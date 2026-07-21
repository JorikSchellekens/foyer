import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { verifyPayload } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";

const bodySchema = z.object({
  token: z.string(),
  viewId: z.string(),
  // seconds of active viewing since the last beacon
  delta: z.number().min(0).max(120).optional(),
  page: z.number().int().min(1).max(10_000).optional(),
  versionId: z.string().nullish(),
  completedPct: z.number().min(0).max(100).optional(),
  downloaded: z.boolean().optional(),
  // dwell per page since last beacon
  dwell: z
    .array(
      z.object({
        page: z.number().int().min(1).max(10_000),
        seconds: z.number().min(0).max(120),
      })
    )
    .max(200)
    .optional(),
  // mouse samples: [tOffsetMs, xPct, yPct]
  mouse: z
    .array(
      z.object({
        page: z.number().int().min(1).max(10_000),
        samples: z.array(z.tuple([z.number(), z.number(), z.number()])).max(600),
      })
    )
    .max(50)
    .optional(),
});

export async function POST(req: NextRequest) {
  // sendBeacon posts as text/plain; parse manually
  let json: unknown;
  try {
    json = JSON.parse(await req.text());
  } catch {
    return NextResponse.json({ error: "Bad payload" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success)
    return NextResponse.json({ error: "Bad payload" }, { status: 400 });
  const body = parsed.data;

  const payload = await verifyPayload<{ vid?: string }>(body.token);
  if (!payload?.vid || payload.vid !== body.viewId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // A valid track token lives 24h and is handed to every viewer; cap the write
  // rate per view so a replayed beacon cannot flood analytics rows/storage.
  // The client beacons at most every few seconds, so this is generous headroom.
  const limited = rateLimit(`track:${body.viewId}`, 40, 60_000);
  if (!limited.ok)
    return NextResponse.json(
      { error: "Slow down" },
      { status: 429, headers: { "retry-after": String(limited.retryAfter) } }
    );

  const view = await db.view.findUnique({ where: { id: body.viewId } });
  if (!view) return NextResponse.json({ error: "Gone" }, { status: 410 });

  await db.view.update({
    where: { id: view.id },
    data: {
      totalDuration: { increment: Math.round(body.delta ?? 0) },
      lastActiveAt: new Date(),
      ...(body.completedPct !== undefined &&
      body.completedPct > view.completedPct
        ? { completedPct: Math.round(body.completedPct) }
        : {}),
      ...(body.downloaded && !view.downloadedAt
        ? { downloadedAt: new Date() }
        : {}),
    },
  });

  for (const d of body.dwell ?? []) {
    if (d.seconds <= 0) continue;
    await db.pageView.upsert({
      where: {
        viewId_pageNumber: { viewId: view.id, pageNumber: d.page },
      },
      update: { duration: { increment: Math.round(d.seconds) } },
      create: {
        viewId: view.id,
        pageNumber: d.page,
        versionId: body.versionId ?? null,
        duration: Math.round(d.seconds),
      },
    });
  }

  for (const m of body.mouse ?? []) {
    if (m.samples.length === 0) continue;
    await db.mouseBatch.create({
      data: {
        viewId: view.id,
        pageNumber: m.page,
        samples: m.samples,
      },
    });
  }

  return NextResponse.json({ ok: true });
}

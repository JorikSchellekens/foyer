import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getTeamContext, signPayload } from "@/lib/auth";
import { newFileKey } from "@/lib/storage";

const bodySchema = z.object({
  files: z
    .array(
      z.object({
        name: z.string().min(1).max(300),
        contentType: z.string().max(200).default("application/octet-stream"),
      })
    )
    .max(500),
});

/**
 * Returns an upload target per file. The target is an app-relative URL on this
 * same HTTPS origin (NOT a direct-to-storage presigned URL): the object store
 * is private and internal, so the browser streams the bytes through the app,
 * which writes them to storage server-side. The signed token authorizes the
 * exact key for the current team.
 */
export async function POST(req: NextRequest) {
  const ctx = await getTeamContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const results = await Promise.all(
    parsed.data.files.map(async (f) => {
      const key = newFileKey(ctx.team.id, f.name);
      const token = await signPayload(
        { key, teamId: ctx.team.id, ct: f.contentType },
        "30m"
      );
      return {
        name: f.name,
        key,
        url: `/api/upload/put?token=${encodeURIComponent(token)}`,
      };
    })
  );
  return NextResponse.json({ files: results });
}

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getTeamContext } from "@/lib/auth";
import { newFileKey, presignUpload } from "@/lib/storage";

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

export async function POST(req: NextRequest) {
  const ctx = await getTeamContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const results = await Promise.all(
    parsed.data.files.map(async (f) => {
      const key = newFileKey(ctx.team.id, f.name);
      const url = await presignUpload(key, f.contentType);
      return { name: f.name, key, url };
    })
  );
  return NextResponse.json({ files: results });
}

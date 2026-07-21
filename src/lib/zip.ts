import "server-only";
import { Readable } from "stream";
import { ZipArchive } from "archiver";
import { getObjectStream } from "@/lib/storage";

export type ZipEntry = { path: string; key: string };

/** Stream a zip of stored objects without buffering the whole archive. */
export async function zipResponse(
  fileName: string,
  entries: ZipEntry[]
): Promise<Response> {
  const archive = new ZipArchive({ zlib: { level: 6 } });

  (async () => {
    try {
      for (const entry of entries) {
        const obj = await getObjectStream(entry.key);
        const body = obj.Body as unknown as Readable;
        archive.append(body, { name: entry.path });
      }
      await archive.finalize();
    } catch (e) {
      archive.destroy(e as Error);
    }
  })();

  const webStream = Readable.toWeb(
    archive as unknown as Readable
  ) as ReadableStream;
  return new Response(webStream, {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${encodeURIComponent(fileName)}.zip"`,
    },
  });
}

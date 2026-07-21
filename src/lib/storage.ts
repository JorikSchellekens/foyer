import "server-only";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { randomBytes } from "crypto";

let _client: S3Client | null = null;

export function s3(): S3Client {
  if (_client) return _client;
  _client = new S3Client({
    region: process.env.S3_REGION ?? "us-east-1",
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
    },
  });
  return _client;
}

export const BUCKET = () => process.env.S3_BUCKET ?? "foyer";

export function newFileKey(teamId: string, fileName: string) {
  const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
  return `${teamId}/${randomBytes(8).toString("hex")}/${safe}`;
}

/**
 * Guard for client-supplied storage keys. Every object a team owns lives under
 * its `${teamId}/` prefix (see newFileKey). A member must never be able to
 * persist a key pointing at another team's object, so any key that arrives from
 * the client - as a document fileKey or a brand/preview image - is validated
 * against the caller's team before it is stored.
 */
export function isTeamKey(
  key: string | null | undefined,
  teamId: string
): key is string {
  return typeof key === "string" && key.startsWith(`${teamId}/`);
}

export async function putObject(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string
) {
  await s3().send(
    new PutObjectCommand({
      Bucket: BUCKET(),
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
}

export async function getObjectStream(key: string, range?: string) {
  const res = await s3().send(
    new GetObjectCommand({
      Bucket: BUCKET(),
      Key: key,
      ...(range ? { Range: range } : {}),
    })
  );
  return res;
}

export async function getObjectBuffer(key: string): Promise<Buffer> {
  const res = await getObjectStream(key);
  const bytes = await res.Body!.transformToByteArray();
  return Buffer.from(bytes);
}

export async function deleteObject(key: string) {
  await s3().send(new DeleteObjectCommand({ Bucket: BUCKET(), Key: key }));
}

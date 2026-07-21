import "server-only";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
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

export async function presignUpload(key: string, contentType: string) {
  return getSignedUrl(
    s3(),
    new PutObjectCommand({
      Bucket: BUCKET(),
      Key: key,
      ContentType: contentType,
    }),
    { expiresIn: 600 }
  );
}

export async function presignDownload(key: string, fileName?: string) {
  return getSignedUrl(
    s3(),
    new GetObjectCommand({
      Bucket: BUCKET(),
      Key: key,
      ...(fileName
        ? {
            ResponseContentDisposition: `attachment; filename="${encodeURIComponent(
              fileName
            )}"`,
          }
        : {}),
    }),
    { expiresIn: 600 }
  );
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

export async function getObjectStream(key: string) {
  const res = await s3().send(
    new GetObjectCommand({ Bucket: BUCKET(), Key: key })
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

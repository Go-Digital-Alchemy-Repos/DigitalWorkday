import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import mime from "mime-types";

const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
  "application/zip",
  "application/x-zip-compressed",
];

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25MB
const PRESIGN_EXPIRES_SECONDS = parseInt(process.env.AWS_S3_PRESIGN_EXPIRES_SECONDS || "300", 10);
const DOWNLOAD_EXPIRES_SECONDS = parseInt(process.env.AWS_S3_DOWNLOAD_EXPIRES_SECONDS || "300", 10);

function getS3Client(): S3Client | null {
  const region = process.env.AWS_REGION;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  
  if (!region || !accessKeyId || !secretAccessKey) {
    return null;
  }
  
  return new S3Client({
    region,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
}

function getBucketName(): string {
  const bucket = process.env.AWS_S3_BUCKET_NAME;
  if (!bucket) {
    throw new Error("AWS_S3_BUCKET_NAME environment variable is required");
  }
  return bucket;
}

function getKeyPrefix(): string {
  return process.env.AWS_S3_KEY_PREFIX || "project-attachments";
}

function sanitizeFileName(fileName: string): string {
  return fileName
    .replace(/[/\\:*?"<>|]/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 200);
}

export function generateStorageKey(
  projectId: string,
  taskId: string,
  attachmentId: string,
  fileName: string
): string {
  const prefix = getKeyPrefix();
  const sanitized = sanitizeFileName(fileName);
  return `${prefix}/${projectId}/tasks/${taskId}/${attachmentId}-${sanitized}`;
}

export function validateFile(mimeType: string, fileSizeBytes: number): { valid: boolean; error?: string } {
  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    return { 
      valid: false, 
      error: `File type "${mimeType}" is not allowed. Allowed types: images, PDFs, documents, spreadsheets, text files, and zip archives.` 
    };
  }
  
  if (fileSizeBytes > MAX_FILE_SIZE_BYTES) {
    return { 
      valid: false, 
      error: `File size exceeds maximum allowed size of ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB` 
    };
  }
  
  return { valid: true };
}

export function isS3Configured(): boolean {
  return getS3Client() !== null && !!process.env.AWS_S3_BUCKET_NAME;
}

export async function createPresignedUploadUrl(
  storageKey: string,
  mimeType: string
): Promise<{ url: string; method: string; headers: Record<string, string> }> {
  const client = getS3Client();
  if (!client) {
    throw new Error("S3 is not configured. Please set AWS environment variables.");
  }
  
  const command = new PutObjectCommand({
    Bucket: getBucketName(),
    Key: storageKey,
    ContentType: mimeType,
  });
  
  const url = await getSignedUrl(client, command, { expiresIn: PRESIGN_EXPIRES_SECONDS });
  
  return {
    url,
    method: "PUT",
    headers: {
      "Content-Type": mimeType,
    },
  };
}

export async function createPresignedDownloadUrl(storageKey: string): Promise<string> {
  const client = getS3Client();
  if (!client) {
    throw new Error("S3 is not configured. Please set AWS environment variables.");
  }
  
  const command = new GetObjectCommand({
    Bucket: getBucketName(),
    Key: storageKey,
  });
  
  return getSignedUrl(client, command, { expiresIn: DOWNLOAD_EXPIRES_SECONDS });
}

export async function deleteS3Object(storageKey: string): Promise<void> {
  const client = getS3Client();
  if (!client) {
    throw new Error("S3 is not configured. Please set AWS environment variables.");
  }
  
  const command = new DeleteObjectCommand({
    Bucket: getBucketName(),
    Key: storageKey,
  });
  
  await client.send(command);
}

export async function checkObjectExists(storageKey: string): Promise<boolean> {
  const client = getS3Client();
  if (!client) {
    throw new Error("S3 is not configured. Please set AWS environment variables.");
  }
  
  try {
    const command = new HeadObjectCommand({
      Bucket: getBucketName(),
      Key: storageKey,
    });
    await client.send(command);
    return true;
  } catch (error: any) {
    if (error.name === "NotFound" || error.$metadata?.httpStatusCode === 404) {
      return false;
    }
    throw error;
  }
}

export function getMimeType(fileName: string): string {
  return mime.lookup(fileName) || "application/octet-stream";
}

export { ALLOWED_MIME_TYPES, MAX_FILE_SIZE_BYTES };

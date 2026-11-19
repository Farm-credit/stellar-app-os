import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const PHOTO_EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials:
    process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
      ? {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
        }
      : undefined,
});

export async function uploadImageToS3(
  farmerId: string,
  imageBuffer: Buffer,
  mimeType: string
): Promise<string> {
  const bucket = process.env.AWS_S3_BUCKET;
  if (!bucket) {
    throw new Error('AWS_S3_BUCKET is not set');
  }

  const extension = mimeType.split('/')[1] || 'jpeg';
  const key = `planting-photos/${farmerId}/${Date.now()}.${extension}`;

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: imageBuffer,
    ContentType: mimeType,
    ContentLength: imageBuffer.byteLength,
    // Bucket owner can still enforce ACLs, assuming bucket config covers privacy
  });

  await s3Client.send(command);
  return key;
}

/**
 * Get signed URL for private S3 access (fallback when CDN is not available)
 * 
 * Prefer using getCdnPhotoUrl() from lib/cdn/cdn-url.ts for public photos
 * as it provides global edge caching with <100ms TTFB
 */
export function getSignedPrivateUrl(key: string, expiresIn = 3600): Promise<string> {
  const bucket = process.env.AWS_S3_BUCKET;
  if (!bucket) {
    throw new Error('AWS_S3_BUCKET is not set');
  }

  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  return getSignedUrl(s3Client, command, { expiresIn });
}

export interface CreatePhotoUploadUrlInput {
  key: string;
  contentType: string;
  contentLength: number;
  expiresIn: number;
}

export function getPhotoExtension(contentType: string): string | undefined {
  return PHOTO_EXTENSION[contentType];
}

export function createPhotoUploadUrl(input: CreatePhotoUploadUrlInput): Promise<string> {
  const bucket = process.env.AWS_S3_BUCKET;
  if (!bucket) throw new Error('AWS_S3_BUCKET is not set');
  if (!getPhotoExtension(input.contentType)) throw new Error('Unsupported photo content type');

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: input.key,
    ContentType: input.contentType,
    ContentLength: input.contentLength,
  });
  return getSignedUrl(s3Client, command, { expiresIn: input.expiresIn });
}

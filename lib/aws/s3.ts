import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

export async function uploadImageToS3(farmerId: string, imageBuffer: Buffer, mimeType: string): Promise<string> {
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
    // Bucket owner can still enforce ACLs, assuming bucket config covers privacy
  });

  await s3Client.send(command);
  return key;
}

export async function getSignedPrivateUrl(key: string, expiresIn = 3600): Promise<string> {
  const bucket = process.env.AWS_S3_BUCKET;
  if (!bucket) {
    throw new Error('AWS_S3_BUCKET is not set');
  }

  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  return await getSignedUrl(s3Client, command, { expiresIn });
}

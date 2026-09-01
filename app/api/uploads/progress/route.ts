import { NextResponse } from 'next/server';

const MAX_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

async function pinToPinata(file: File) {
  const jwt = process.env.PINATA_JWT;
  const apiKey = process.env.PINATA_API_KEY;
  const secretApiKey = process.env.PINATA_SECRET_API_KEY;

  if (!jwt && (!apiKey || !secretApiKey)) {
    throw new Error('Pinata credentials are not configured');
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const formData = new FormData();
  formData.append('file', new Blob([buffer], { type: file.type }), file.name);
  formData.append('pinataMetadata', JSON.stringify({ name: file.name }));

  const headers: HeadersInit = {};
  if (jwt) {
    headers.Authorization = `Bearer ${jwt}`;
  } else {
    headers['pinata_api_key'] = apiKey!;
    headers['pinata_secret_api_key'] = secretApiKey!;
  }

  const response = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
    method: 'POST',
    headers,
    body: formData,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Pinata upload failed: ${response.status} ${errorBody}`);
  }

  const payload = (await response.json()) as { IpfsHash?: string };
  if (!payload.IpfsHash) {
    throw new Error('Pinata did not return an IPFS hash');
  }

  return payload.IpfsHash;
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = (formData.get('file') ?? formData.get('photo')) as File | null;

    if (!file) {
      return NextResponse.json({ error: 'A photo file is required' }, { status: 400 });
    }

    if (!ALLOWED_CONTENT_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'Only JPEG, PNG, and WebP images are allowed' },
        { status: 415 }
      );
    }

    if (file.size > MAX_UPLOAD_SIZE_BYTES) {
      return NextResponse.json({ error: 'File size must be 5MB or less' }, { status: 413 });
    }

    const cid = await pinToPinata(file);

    return NextResponse.json(
      { cid, filename: file.name, size: file.size, contentType: file.type },
      { status: 201 }
    );
  } catch (error) {
    console.error('[uploads/progress] error', error);
    const message = error instanceof Error ? error.message : 'Failed to process upload';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

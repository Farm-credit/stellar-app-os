export interface IpfsUploadResult {
  cid: string;
  size: number;
  ipfsUrl: string;
  gatewayUrl: string;
}

/**
 * Upload a file buffer to IPFS via Pinata.
 * Requires PINATA_JWT env var (or PINATA_API_KEY + PINATA_SECRET_API_KEY).
 */
export async function uploadToIpfs(
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string
): Promise<IpfsUploadResult> {
  const jwt = process.env.PINATA_JWT;
  const apiKey = process.env.PINATA_API_KEY;
  const apiSecret = process.env.PINATA_SECRET_API_KEY;
  const gateway = process.env.IPFS_GATEWAY_URL ?? 'https://gateway.pinata.cloud/ipfs';

  if (!jwt && (!apiKey || !apiSecret)) {
    throw new Error(
      'IPFS upload requires PINATA_JWT or PINATA_API_KEY + PINATA_SECRET_API_KEY env vars'
    );
  }

  const formData = new FormData();
  const blob = new Blob([fileBuffer as unknown as BlobPart], { type: mimeType });
  formData.append('file', blob, fileName);

  const headers: Record<string, string> = {};

  if (jwt) {
    headers.Authorization = `Bearer ${jwt}`;
  } else {
    headers.pinata_api_key = apiKey!;
    headers.pinata_secret_api_key = apiSecret!;
  }

  const response = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
    method: 'POST',
    headers,
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`IPFS upload failed (${response.status}): ${errorText}`);
  }

  const result = (await response.json()) as { IpfsHash: string; PinSize: number };

  return {
    cid: result.IpfsHash,
    size: result.PinSize,
    ipfsUrl: `ipfs://${result.IpfsHash}`,
    gatewayUrl: `${gateway}${result.IpfsHash}`,
  };
}

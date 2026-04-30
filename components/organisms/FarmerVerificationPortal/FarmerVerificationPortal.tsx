'use client';

import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import exifr from 'exifr';
import {
  AlertCircle,
  CheckCircle2,
  FileImage,
  KeyRound,
  Loader2,
  Lock,
  MapPin,
  Send,
  ShieldCheck,
  Sprout,
  TreePine,
} from 'lucide-react';
import { Badge } from '@/components/atoms/Badge';
import { Button } from '@/components/atoms/Button';
import { Input } from '@/components/atoms/Input';
import { Text } from '@/components/atoms/Text';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/molecules/Card';
import type { NetworkType } from '@/lib/types/wallet';

interface GpsReading {
  lat: number;
  lon: number;
  capturedAt: string;
  source: 'exif';
}

interface EncryptedPayload {
  iv: string;
  ciphertext: string;
}

interface VerificationResult {
  treeCount: number;
  encryptedPhotoKey: string;
  transactionHash: string;
  commitment: string;
  inRegion: boolean;
}

type Status = 'idle' | 'reading-photo' | 'encrypting' | 'submitting' | 'success' | 'error';

const defaultContractId = process.env.NEXT_PUBLIC_LOCATION_PROOF_CONTRACT_ID ?? '';

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';

  for (let index = 0; index < bytes.byteLength; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }

  return window.btoa(binary);
}

function viewToArrayBuffer(view: Uint8Array): ArrayBuffer {
  return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer;
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const normalized = pem
    .replace(/-----BEGIN PUBLIC KEY-----/g, '')
    .replace(/-----END PUBLIC KEY-----/g, '')
    .replace(/\s/g, '');
  const binary = window.atob(normalized);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes.buffer;
}

function importRsaPublicKey(pem: string): Promise<CryptoKey> {
  return window.crypto.subtle.importKey(
    'spki',
    pemToArrayBuffer(pem),
    {
      name: 'RSA-OAEP',
      hash: 'SHA-256',
    },
    false,
    ['wrapKey']
  );
}

async function encryptWithAes(key: CryptoKey, bytes: Uint8Array): Promise<EncryptedPayload> {
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await window.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
    },
    key,
    viewToArrayBuffer(bytes)
  );

  return {
    iv: arrayBufferToBase64(viewToArrayBuffer(iv)),
    ciphertext: arrayBufferToBase64(ciphertext),
  };
}

async function prepareEncryptedSubmission(photo: File, gps: GpsReading) {
  const keyResponse = await fetch('/api/planting/verification-key');
  const keyBody = (await keyResponse.json()) as { publicKey?: string; error?: string };

  if (!keyResponse.ok || !keyBody.publicKey) {
    throw new Error(keyBody.error ?? 'Unable to load encryption key');
  }

  const publicKey = await importRsaPublicKey(keyBody.publicKey);
  const aesKey = await window.crypto.subtle.generateKey(
    {
      name: 'AES-GCM',
      length: 256,
    },
    true,
    ['encrypt']
  );
  const wrappedKey = await window.crypto.subtle.wrapKey('raw', aesKey, publicKey, 'RSA-OAEP');
  const photoBytes = new Uint8Array(await photo.arrayBuffer());
  const gpsBytes = new TextEncoder().encode(JSON.stringify(gps));

  return {
    wrappedKey: arrayBufferToBase64(wrappedKey),
    encryptedPhoto: await encryptWithAes(aesKey, photoBytes),
    encryptedGps: await encryptWithAes(aesKey, gpsBytes),
  };
}

function shortenHash(value: string): string {
  if (value.length <= 18) return value;
  return `${value.slice(0, 10)}...${value.slice(-8)}`;
}

export function FarmerVerificationPortal() {
  const [farmerId, setFarmerId] = useState('');
  const [treeCount, setTreeCount] = useState('120');
  const [network, setNetwork] = useState<NetworkType>('testnet');
  const [contractId, setContractId] = useState(defaultContractId);
  const [photo, setPhoto] = useState<File | null>(null);
  const [gps, setGps] = useState<GpsReading | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VerificationResult | null>(null);

  const canSubmit = useMemo(
    () => farmerId.trim() && Number(treeCount) > 0 && contractId.trim() && photo && gps,
    [contractId, farmerId, gps, photo, treeCount]
  );

  async function handlePhotoChange(file: File | null) {
    setPhoto(file);
    setGps(null);
    setResult(null);
    setError(null);

    if (!file) return;

    try {
      setStatus('reading-photo');
      const reading = (await exifr.gps(file)) as { latitude?: number; longitude?: number } | null;

      if (typeof reading?.latitude !== 'number' || typeof reading.longitude !== 'number') {
        throw new Error(
          'This photo does not include GPS metadata. Take a new photo with location enabled.'
        );
      }

      setGps({
        lat: reading.latitude,
        lon: reading.longitude,
        capturedAt: new Date().toISOString(),
        source: 'exif',
      });
      setStatus('idle');
    } catch (caught) {
      setStatus('error');
      setError(caught instanceof Error ? caught.message : 'Unable to read GPS metadata from photo');
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setResult(null);

    if (!photo || !gps) {
      setError('Add a GPS-tagged planting photo before submitting.');
      setStatus('error');
      return;
    }

    try {
      setStatus('encrypting');
      const encrypted = await prepareEncryptedSubmission(photo, gps);
      const formData = new FormData();
      const encryptedPhotoBlob = new Blob(
        [
          JSON.stringify({
            algorithm: 'AES-256-GCM',
            wrappedKey: encrypted.wrappedKey,
            originalName: photo.name,
            payload: encrypted.encryptedPhoto,
          }),
        ],
        {
          type: 'application/octet-stream',
        }
      );

      formData.set('farmerId', farmerId.trim());
      formData.set('treeCount', treeCount);
      formData.set('network', network);
      formData.set('contractId', contractId.trim());
      formData.set('nonce', Date.now().toString());
      formData.set('wrappedKey', encrypted.wrappedKey);
      formData.set('encryptedGps', JSON.stringify(encrypted.encryptedGps));
      formData.set('encryptedPhoto', encryptedPhotoBlob, `${photo.name}.enc`);

      setStatus('submitting');
      const response = await fetch('/api/planting/verification', {
        method: 'POST',
        body: formData,
      });
      const body = (await response.json()) as VerificationResult & { error?: string };

      if (!response.ok) {
        throw new Error(body.error ?? 'Verification submission failed');
      }

      setResult(body);
      setStatus('success');
    } catch (caught) {
      setStatus('error');
      setError(caught instanceof Error ? caught.message : 'Verification submission failed');
    }
  }

  const busy = status === 'reading-photo' || status === 'encrypting' || status === 'submitting';

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Badge variant="success">Farmer verification</Badge>
            <Badge variant="secondary">Client-side encrypted</Badge>
          </div>
          <Text as="h1" variant="h1" className="text-3xl md:text-4xl">
            Planting verification
          </Text>
          <Text className="mt-3 text-muted-foreground">
            Submit a GPS-tagged planting photo and tree count for ZK location proof generation and
            Stellar verification.
          </Text>
        </div>
        <div className="grid grid-cols-3 gap-3 rounded-lg border bg-card p-3 text-center shadow-sm">
          <div className="px-2">
            <Lock className="mx-auto h-5 w-5 text-stellar-blue" />
            <p className="mt-1 text-xs font-semibold">Encrypt</p>
          </div>
          <div className="px-2">
            <ShieldCheck className="mx-auto h-5 w-5 text-stellar-green" />
            <p className="mt-1 text-xs font-semibold">Prove</p>
          </div>
          <div className="px-2">
            <Send className="mx-auto h-5 w-5 text-stellar-purple" />
            <p className="mt-1 text-xs font-semibold">Verify</p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Card className="rounded-lg shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Sprout className="h-5 w-5 text-stellar-green" />
              Planting details
            </CardTitle>
            <CardDescription>
              Use the same wallet address registered to your farmer profile.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-sm font-medium">Farmer Stellar address</span>
                <Input
                  value={farmerId}
                  onChange={(event) => setFarmerId(event.target.value)}
                  placeholder="G..."
                  inputSize="lg"
                  required
                />
              </label>
              <label className="space-y-2">
                <span className="text-sm font-medium">Tree count</span>
                <Input
                  type="number"
                  min={1}
                  step={1}
                  value={treeCount}
                  onChange={(event) => setTreeCount(event.target.value)}
                  inputSize="lg"
                  required
                />
              </label>
            </div>

            <label className="block space-y-2">
              <span className="text-sm font-medium">GPS planting photo</span>
              <div className="flex min-h-44 flex-col items-center justify-center rounded-lg border border-dashed border-stellar-blue/40 bg-secondary/40 px-4 py-6 text-center">
                <FileImage className="h-8 w-8 text-stellar-blue" />
                <p className="mt-3 text-sm font-semibold">
                  {photo ? photo.name : 'Choose or take a photo'}
                </p>
                <p className="mt-1 max-w-md text-sm text-muted-foreground">
                  The photo must include embedded GPS metadata from the device camera.
                </p>
                <Input
                  className="mt-4 max-w-sm"
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(event) => handlePhotoChange(event.target.files?.[0] ?? null)}
                  required
                />
              </div>
            </label>

            {gps && (
              <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-background p-4">
                <MapPin className="h-5 w-5 text-stellar-green" />
                <div>
                  <p className="text-sm font-semibold">GPS metadata found</p>
                  <p className="font-mono text-xs text-muted-foreground">
                    {gps.lat.toFixed(6)}, {gps.lon.toFixed(6)}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="rounded-lg shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <KeyRound className="h-5 w-5 text-stellar-purple" />
                Proof settings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <label className="space-y-2">
                <span className="text-sm font-medium">Network</span>
                <select
                  value={network}
                  onChange={(event) => setNetwork(event.target.value as NetworkType)}
                  className="h-12 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="testnet">Testnet</option>
                  <option value="mainnet">Mainnet</option>
                </select>
              </label>
              <label className="space-y-2">
                <span className="text-sm font-medium">Location proof contract</span>
                <Input
                  value={contractId}
                  onChange={(event) => setContractId(event.target.value)}
                  placeholder="C..."
                  required
                />
              </label>
              <Button
                type="submit"
                stellar="success"
                width="full"
                disabled={!canSubmit || busy}
                className="gap-2"
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <TreePine className="h-4 w-4" />
                )}
                {status === 'encrypting' && 'Encrypting photo'}
                {status === 'submitting' && 'Submitting proof'}
                {status !== 'encrypting' && status !== 'submitting' && 'Submit verification'}
              </Button>
            </CardContent>
          </Card>

          {(status === 'error' || result || status === 'reading-photo') && (
            <Card className="rounded-lg shadow-sm">
              <CardContent className="space-y-3 pt-6">
                {status === 'reading-photo' && (
                  <div className="flex items-center gap-3 text-sm">
                    <Loader2 className="h-5 w-5 animate-spin text-stellar-blue" />
                    Reading GPS metadata...
                  </div>
                )}
                {error && (
                  <div className="flex items-start gap-3 text-sm text-destructive">
                    <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}
                {result && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 text-sm text-stellar-green">
                      <CheckCircle2 className="h-5 w-5" />
                      Verification submitted on-chain
                    </div>
                    <dl className="space-y-2 text-xs">
                      <div className="flex justify-between gap-3">
                        <dt className="text-muted-foreground">Trees</dt>
                        <dd className="font-semibold">{result.treeCount.toLocaleString()}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-muted-foreground">Commitment</dt>
                        <dd className="font-mono">{shortenHash(result.commitment)}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-muted-foreground">Tx hash</dt>
                        <dd className="font-mono">{shortenHash(result.transactionHash)}</dd>
                      </div>
                    </dl>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </form>
    </div>
  );
}

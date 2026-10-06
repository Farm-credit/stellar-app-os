import type {
  MintedCreditRecord,
  RegistryProtocol,
  RegistryProjectData,
  RegistryRetirementData,
} from '../certification/types';
import { makeTokenId } from './registry-client';
import { uploadToIpfs } from '../ipfs/upload';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import logger from '../logger';

export interface CreditMetadata {
  name: string;
  description: string;
  image?: string;
  external_url?: string;
  attributes: CreditMetadataAttribute[];
  properties: CreditMetadataProperties;
}

export interface CreditMetadataAttribute {
  trait_type: string;
  value: string | number | boolean;
  display_type?: 'number' | 'date' | 'boost_number' | 'boost_percentage';
}

export interface CreditMetadataProperties {
  protocol: RegistryProtocol;
  projectId: string;
  projectName: string;
  vintage: number | null;
  tonnage: number;
  serialNumber: string;
  countryCode: string | null;
  methodologyId: string | null;
  proponent: string | null;
  retiredAt: string | null;
  validationId: string;
  tokenizedAt: string;
}

export function buildCreditMetadata(params: {
  project: RegistryProjectData;
  retirement: RegistryRetirementData;
  validationId: string;
  tokenizedAt?: string;
  image?: string;
  externalUrl?: string;
}): CreditMetadata {
  const { project, retirement, validationId } = params;
  const tokenizedAt = params.tokenizedAt ?? new Date().toISOString();
  const vintage = retirement.vintage ?? project.vintage;
  const displayProtocol =
    project.protocol === 'verra' ? 'Verra (VCS)' : 'Gold Standard';
  const vintageLabel = vintage ? String(vintage) : 'N/A';
  const name = `Verified Carbon Credit · ${displayProtocol} · Project ${project.projectId} · Vintage ${vintageLabel}`;
  const description =
    `Verified carbon credit tokenized from the ${displayProtocol} registry. ` +
    `Project: ${project.projectName} (${project.projectId}). ` +
    `Tonnage: ${retirement.tonnage} t CO₂e. Serial: ${retirement.serialNumber}.`;

  const attributes: CreditMetadataAttribute[] = [
    {
      trait_type: 'Protocol',
      value: displayProtocol,
    },
    {
      trait_type: 'Project ID',
      value: project.projectId,
    },
    {
      trait_type: 'Project Name',
      value: project.projectName,
    },
    ...(vintage !== null && vintage !== undefined
      ? [
          {
            trait_type: 'Vintage',
            value: vintage,
            display_type: 'number' as const,
          },
        ]
      : []),
    {
      trait_type: 'Tonnage (t CO₂e)',
      value: retirement.tonnage,
      display_type: 'number',
    },
    {
      trait_type: 'Serial Number',
      value: retirement.serialNumber,
    },
    {
      trait_type: 'Status',
      value: retirement.retirementStatus,
    },
    ...(project.countryCode
      ? [
          {
            trait_type: 'Country',
            value: project.countryCode,
          },
        ]
      : []),
    ...(project.methodologyId
      ? [
          {
            trait_type: 'Methodology',
            value: project.methodologyId,
          },
        ]
      : []),
  ];

  const properties: CreditMetadataProperties = {
    protocol: project.protocol,
    projectId: project.projectId,
    projectName: project.projectName,
    vintage,
    tonnage: retirement.tonnage,
    serialNumber: retirement.serialNumber,
    countryCode: project.countryCode,
    methodologyId: project.methodologyId,
    proponent: project.proponent,
    retiredAt: retirement.retiredAt,
    validationId,
    tokenizedAt,
  };

  return {
    name,
    description,
    image: params.image,
    external_url: params.externalUrl,
    attributes,
    properties,
  };
}

export interface MetadataUploadResult {
  metadataUri: string;
  metadata: CreditMetadata;
  cid?: string;
  storageLocation: 'ipfs' | 'local';
}

export async function storeCreditMetadata(params: {
  metadata: CreditMetadata;
  tokenId: string;
  requestOrigin?: string;
  storagePreference?: 'ipfs' | 'local';
}): Promise<MetadataUploadResult> {
  const { metadata, tokenId, requestOrigin, storagePreference } = params;
  const preferIpfs = storagePreference === 'ipfs'
    ? true
    : storagePreference === 'local'
      ? false
      : Boolean(process.env.PINATA_JWT || process.env.PINATA_API_KEY);

  const jsonBuffer = Buffer.from(JSON.stringify(metadata, null, 2), 'utf8');

  if (preferIpfs) {
    try {
      const fileName = `carbon-credit-${tokenId}.json`;
      const upload = await uploadToIpfs(jsonBuffer, fileName, 'application/json');
      logger.info('[MetadataStore] Uploaded credit metadata to IPFS', {
        tokenId,
        cid: upload.cid,
      });
      return {
        metadataUri: upload.ipfsUrl,
        metadata,
        cid: upload.cid,
        storageLocation: 'ipfs',
      };
    } catch (error) {
      logger.warn('[MetadataStore] IPFS upload failed, falling back to local', {
        tokenId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const metaDir =
    process.env.CREDIT_METADATA_DIR ||
    path.join(process.cwd(), 'public', 'credit-metadata');
  if (!fs.existsSync(metaDir)) {
    fs.mkdirSync(metaDir, { recursive: true });
  }
  const filePath = path.join(metaDir, `${tokenId}.json`);
  fs.writeFileSync(filePath, jsonBuffer);
  const origin = requestOrigin ?? process.env.NEXT_PUBLIC_APP_URL ?? '';
  const metadataUri = `${origin}/credit-metadata/${tokenId}.json`;
  return {
    metadataUri,
    metadata,
    storageLocation: 'local',
  };
}

export function deriveEvmTokenId(
  protocol: RegistryProtocol,
  serialNumber: string
): bigint {
  const hex = makeTokenId(protocol, serialNumber);
  return BigInt(`0x${hex.slice(0, 64)}`);
}

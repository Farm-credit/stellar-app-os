/**
 * Trusted biodiversity oracle client (#1155).
 *
 * Verifies ed25519 signatures from the bioacoustic sensor network and drone
 * survey pipeline before accepting readings into the platform. The same
 * signature-verification pattern as the NDVI oracle (lib/oracle/oracle-client.ts)
 * is used so both oracles share the same trust model.
 */

import { hexToBytes } from '@noble/hashes/utils';
import { ed25519 } from '@noble/curves/ed25519';
import type {
  BioacousticReading,
  DroneObservation,
  SpeciesDetectionEvent,
} from '@/lib/types/biodiversity';

// ── Signature verification ────────────────────────────────────────────────────

function verifyBiodiversitySignature(payload: string, signatureHex: string): boolean {
  const pubHex = process.env.BIODIVERSITY_ORACLE_PUBLIC_KEY_HEX;
  if (!pubHex) throw new Error('BIODIVERSITY_ORACLE_PUBLIC_KEY_HEX environment variable not set');

  const pub = hexToBytes(pubHex);
  const sig = hexToBytes(signatureHex);
  const msg = new TextEncoder().encode(payload);

  return ed25519.verify(sig, msg, pub);
}

// ── Bioacoustic submission ────────────────────────────────────────────────────

/**
 * Canonical payload string for bioacoustic readings.
 * Format is deterministic so the oracle can sign it off-chain.
 */
function bioacousticPayload(reading: Omit<BioacousticReading, 'signature'>): string {
  return [
    reading.deviceId,
    reading.regionKey,
    reading.recordedAt,
    reading.durationSeconds.toFixed(0),
    reading.aciScore.toFixed(6),
    reading.detectedSpecies.slice().sort().join(','),
  ].join('|');
}

export interface VerifiedBioacousticResult {
  verified: true;
  reading: Omit<BioacousticReading, 'signature'>;
  speciesEvents: Pick<SpeciesDetectionEvent, 'species' | 'method' | 'lastDetectedAt'>[];
}

/**
 * Validates and processes a bioacoustic sensor reading from the field.
 * Throws on invalid input or signature mismatch.
 */
export function processBioacousticReading(
  reading: BioacousticReading
): VerifiedBioacousticResult {
  // Input validation
  if (!reading.deviceId) throw new Error('Missing deviceId');
  if (!reading.regionKey) throw new Error('Missing regionKey');
  if (!reading.recordedAt || isNaN(new Date(reading.recordedAt).getTime()))
    throw new Error('recordedAt must be a valid ISO-8601 datetime');
  if (typeof reading.durationSeconds !== 'number' || reading.durationSeconds <= 0)
    throw new Error('durationSeconds must be a positive number');
  if (typeof reading.aciScore !== 'number' || reading.aciScore < 0 || reading.aciScore > 1)
    throw new Error('aciScore must be a number between 0.0 and 1.0');
  if (!Array.isArray(reading.detectedSpecies) || reading.detectedSpecies.length === 0)
    throw new Error('detectedSpecies must be a non-empty array');
  if (!reading.signature || !/^[0-9a-f]{128}$/i.test(reading.signature))
    throw new Error('signature must be a 128-char hex string (64-byte ed25519 sig)');

  const payload = bioacousticPayload(reading);
  if (!verifyBiodiversitySignature(payload, reading.signature)) {
    throw new Error('BIODIVERSITY_ORACLE_SIGNATURE_INVALID');
  }

  const { signature: _sig, ...readingData } = reading;

  const speciesEvents = reading.detectedSpecies.map((species) => ({
    species,
    method: 'bioacoustic' as const,
    lastDetectedAt: reading.recordedAt,
  }));

  return { verified: true, reading: readingData, speciesEvents };
}

// ── Drone survey submission ───────────────────────────────────────────────────

/**
 * Canonical payload string for drone observations.
 */
function dronePayload(obs: Omit<DroneObservation, 'signature'>): string {
  return [
    obs.flightId,
    obs.regionKey,
    obs.surveyedAt,
    obs.altitudeMetres.toFixed(1),
    obs.canopyCoverPercent.toFixed(2),
    obs.ndviMean.toFixed(6),
    obs.detectedFauna.slice().sort().join(','),
  ].join('|');
}

export interface VerifiedDroneResult {
  verified: true;
  observation: Omit<DroneObservation, 'signature'>;
  speciesEvents: Pick<SpeciesDetectionEvent, 'species' | 'method' | 'lastDetectedAt'>[];
}

/**
 * Validates and processes a drone survey observation.
 * Throws on invalid input or signature mismatch.
 */
export function processDroneObservation(obs: DroneObservation): VerifiedDroneResult {
  if (!obs.flightId) throw new Error('Missing flightId');
  if (!obs.regionKey) throw new Error('Missing regionKey');
  if (!obs.surveyedAt || isNaN(new Date(obs.surveyedAt).getTime()))
    throw new Error('surveyedAt must be a valid ISO-8601 datetime');
  if (typeof obs.altitudeMetres !== 'number' || obs.altitudeMetres <= 0)
    throw new Error('altitudeMetres must be a positive number');
  if (
    typeof obs.canopyCoverPercent !== 'number' ||
    obs.canopyCoverPercent < 0 ||
    obs.canopyCoverPercent > 100
  )
    throw new Error('canopyCoverPercent must be between 0 and 100');
  if (typeof obs.ndviMean !== 'number' || obs.ndviMean < 0 || obs.ndviMean > 1)
    throw new Error('ndviMean must be between 0.0 and 1.0');
  if (!Array.isArray(obs.detectedFauna))
    throw new Error('detectedFauna must be an array');
  if (!obs.signature || !/^[0-9a-f]{128}$/i.test(obs.signature))
    throw new Error('signature must be a 128-char hex string');

  const payload = dronePayload(obs);
  if (!verifyBiodiversitySignature(payload, obs.signature)) {
    throw new Error('BIODIVERSITY_ORACLE_SIGNATURE_INVALID');
  }

  const { signature: _sig, ...observationData } = obs;

  const speciesEvents = obs.detectedFauna.map((species) => ({
    species,
    method: 'drone' as const,
    lastDetectedAt: obs.surveyedAt,
  }));

  return { verified: true, observation: observationData, speciesEvents };
}

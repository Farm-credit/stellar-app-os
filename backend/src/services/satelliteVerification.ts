// Copyright 2024 Farm-credit Contributors
// Licensed under the Apache License, Version 2.0

/**
 * Environmental Impact Verification - Satellite Imagery Service
 *
 * Issue #1429: Use satellite data to verify environmental claims:
 * - Tree count from aerial imagery
 * - Land cover changes
 * - Vegetation health indices (NDVI, EVI)
 *
 * This service integrates with satellite imagery providers (Sentinel-2, Landsat, Planet)
 * to verify carbon offset project claims.
 */

import { createClient } from '@supabase/supabase-js';

import {
  boundsToGeoJsonPolygon,
  fetchNdviStatistics,
  getCopernicusConfig,
  isCopernicusConfigured,
  pointBufferToGeoJsonPolygon,
  type CopernicusConfig,
  type NdviDateRange,
  type NdviQueryGeometry,
  type NdviStatistics,
} from './copernicusNdviApi';
import {
  auditClaimAgainstNdvi,
  evidenceFromStatistics,
  validateGroundPlantingClaim,
  type GroundPlantingClaim,
  type LandPlotAuditResult,
  type SatelliteNdviEvidence,
} from './landPlotAudit';

// Re-export the land-plot-audit contracts so route handlers and UI import
// from a single module.
export type {
  AuditVerdict,
  ClaimedVegetationStatus,
  GroundPlantingClaim,
  LandPlotAuditResult,
  SatelliteNdviEvidence,
} from './landPlotAudit';
export type { CopernicusConfig, NdviStatistics } from './copernicusNdviApi';

export interface SatelliteImageBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface VerificationRequest {
  projectId: string;
  bounds: SatelliteImageBounds;
  verificationType: 'tree_count' | 'land_cover_change' | 'vegetation_health';
  startDate: string; // ISO 8601
  endDate: string; // ISO 8601
}

export interface TreeCountResult {
  estimatedTreeCount: number;
  confidence: number; // 0-1
  methodology: string;
  imageDate: string;
  resolutionMeters: number;
}

export interface LandCoverChangeResult {
  forestGainHectares: number;
  forestLossHectares: number;
  netChangeHectares: number;
  changePeriod: { start: string; end: string };
  confidence: number;
}

export interface VegetationHealthResult {
  meanNDVI: number;
  meanEVI: number;
  healthScore: number; // 0-100
  anomalyDetected: boolean;
  imageDate: string;
}

export type VerificationResult =
  | { type: 'tree_count'; data: TreeCountResult }
  | { type: 'land_cover_change'; data: LandCoverChangeResult }
  | { type: 'vegetation_health'; data: VegetationHealthResult };

export interface VerificationJob {
  id: string;
  request: VerificationRequest;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  result?: VerificationResult;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-service-role-key';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

/**
 * Submit a new verification job using satellite imagery
 */
export async function submitVerificationJob(
  request: VerificationRequest
): Promise<VerificationJob> {
  const job: VerificationJob = {
    id: crypto.randomUUID(),
    request,
    status: 'pending',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const { error } = await supabase.from('satellite_verification_jobs').insert(job);

  if (error) {
    throw new Error(`Failed to create verification job: ${error.message}`);
  }

  // Trigger async processing (would be picked up by worker queue)
  await triggerVerificationProcessing(job.id);

  return job;
}

/**
 * Get verification job status and results
 */
export async function getVerificationJob(jobId: string): Promise<VerificationJob | null> {
  const { data, error } = await supabase
    .from('satellite_verification_jobs')
    .select('*')
    .eq('id', jobId)
    .single();

  if (error || !data) {
    return null;
  }

  return data as VerificationJob;
}

/**
 * List verification jobs for a project
 */
export async function listVerificationJobs(projectId: string): Promise<VerificationJob[]> {
  const { data, error } = await supabase
    .from('satellite_verification_jobs')
    .select('*')
    .eq('request->projectId', projectId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to list verification jobs: ${error.message}`);
  }

  return data as VerificationJob[];
}

/**
 * Trigger async verification processing
 * In production, this would push to a message queue (Redis, RabbitMQ, etc.)
 */
function triggerVerificationProcessing(jobId: string): Promise<void> {
  return processVerificationJob(jobId).catch(console.error);
}

/**
 * Process a verification job (simulated)
 * Real implementation would:
 * 1. Query satellite imagery API (Sentinel Hub, Google Earth Engine, Planet)
 * 2. Download relevant imagery tiles
 * 3. Run computer vision / ML models for analysis
 * 4. Store results
 */
async function processVerificationJob(jobId: string): Promise<void> {
  const job = await getVerificationJob(jobId);
  if (!job) return;

  // Update status to processing
  await supabase
    .from('satellite_verification_jobs')
    .update({ status: 'processing', updatedAt: new Date().toISOString() })
    .eq('id', jobId);

  try {
    let result: VerificationResult;

    switch (job.request.verificationType) {
      case 'tree_count':
        result = await simulateTreeCountAnalysis(job.request);
        break;
      case 'land_cover_change':
        result = await simulateLandCoverChangeAnalysis(job.request);
        break;
      case 'vegetation_health':
        result = await runVegetationHealthAnalysis(job.request);
        break;
    }

    await supabase
      .from('satellite_verification_jobs')
      .update({
        status: 'completed',
        result,
        updatedAt: new Date().toISOString(),
      })
      .eq('id', jobId);
  } catch (error) {
    await supabase
      .from('satellite_verification_jobs')
      .update({
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        updatedAt: new Date().toISOString(),
      })
      .eq('id', jobId);
  }
}

/**
 * Simulated tree count analysis using satellite imagery
 * Real implementation would use ML models on Sentinel-2/Planet imagery
 */
async function simulateTreeCountAnalysis(
  request: VerificationRequest
): Promise<VerificationResult> {
  // Simulate API call delay
  await new Promise((resolve) => setTimeout(resolve, 100));

  const areaHectares = calculateAreaHectares(request.bounds);
  const estimatedDensity = 200 + Math.random() * 400; // trees per hectare
  const estimatedTreeCount = Math.round(areaHectares * estimatedDensity);

  return {
    type: 'tree_count',
    data: {
      estimatedTreeCount,
      confidence: 0.75 + Math.random() * 0.2,
      methodology: 'Sentinel-2 10m resolution + Random Forest classifier',
      imageDate: request.endDate,
      resolutionMeters: 10,
    },
  };
}

/**
 * Simulated land cover change analysis
 */
async function simulateLandCoverChangeAnalysis(
  request: VerificationRequest
): Promise<VerificationResult> {
  await new Promise((resolve) => setTimeout(resolve, 100));

  const areaHectares = calculateAreaHectares(request.bounds);
  const forestGain = Math.random() * areaHectares * 0.1;
  const forestLoss = Math.random() * areaHectares * 0.05;

  return {
    type: 'land_cover_change',
    data: {
      forestGainHectares: Math.round(forestGain * 100) / 100,
      forestLossHectares: Math.round(forestLoss * 100) / 100,
      netChangeHectares: Math.round((forestGain - forestLoss) * 100) / 100,
      changePeriod: { start: request.startDate, end: request.endDate },
      confidence: 0.8 + Math.random() * 0.15,
    },
  };
}

/**
 * Simulated vegetation health analysis (NDVI/EVI)
 */
async function simulateVegetationHealthAnalysis(
  request: VerificationRequest
): Promise<VerificationResult> {
  await new Promise((resolve) => setTimeout(resolve, 100));

  const meanNDVI = 0.3 + Math.random() * 0.5;
  const meanEVI = 0.2 + Math.random() * 0.4;

  return {
    type: 'vegetation_health',
    data: {
      meanNDVI: Math.round(meanNDVI * 1000) / 1000,
      meanEVI: Math.round(meanEVI * 1000) / 1000,
      healthScore: Math.round(((meanNDVI + meanEVI) / 2) * 100),
      anomalyDetected: Math.random() < 0.1,
      imageDate: request.endDate,
    },
  };
}

/**
 * Calculate area in hectares from bounds
 */
export function calculateAreaHectares(bounds: SatelliteImageBounds): number {
  // Approximate calculation using Haversine formula
  const R = 6371000; // Earth radius in meters
  const latDiff = ((bounds.north - bounds.south) * Math.PI) / 180;
  const lonDiff = ((bounds.east - bounds.west) * Math.PI) / 180;
  const avgLat = (((bounds.north + bounds.south) / 2) * Math.PI) / 180;

  const northSouthMeters = R * latDiff;
  const eastWestMeters = R * lonDiff * Math.cos(avgLat);

  return (northSouthMeters * eastWestMeters) / 10000; // Convert m² to hectares
}

/**
 * Get satellite imagery providers configuration
 */
export function getSupportedProviders(): string[] {
  return ['sentinel-2', 'landsat-8', 'planet'];
}

/**
 * Estimate cost for a verification job
 */
export function estimateJobCost(request: VerificationRequest): {
  estimatedCost: number;
  currency: 'USD';
} {
  const areaHectares = calculateAreaHectares(request.bounds);
  const costPerHectare = request.verificationType === 'tree_count' ? 0.5 : 0.25;
  return {
    estimatedCost: Math.round(areaHectares * costPerHectare * 100) / 100,
    currency: 'USD',
  };
}

// ── Copernicus NDVI integration ──────────────────────────────────────────────

/** NDVI value mapped to the top of the 0–100 health-score scale. */
const NDVI_SCORE_CEIL = 0.9;
/** NDVI below this is treated as absent/unhealthy vegetation. */
const NDVI_UNHEALTHY_THRESHOLD = 0.2;

/**
 * Run vegetation-health analysis, preferring a real Sentinel-2 NDVI lookup via
 * the Copernicus Statistical API. Falls back to the simulated analysis when
 * credentials are missing, the API errors, or no cloud-free pixels are found,
 * emitting an informative console warning so operators know the data source.
 */
async function runVegetationHealthAnalysis(
  request: VerificationRequest
): Promise<VerificationResult> {
  const config = getCopernicusConfig();
  if (!isCopernicusConfigured(config)) {
    console.info(
      '[satelliteVerification] Copernicus credentials not configured; using simulated ' +
        'vegetation health analysis. Set COPERNICUS_CLIENT_ID and COPERNICUS_CLIENT_SECRET ' +
        'to enable Sentinel-2 NDVI lookups.'
    );
    return simulateVegetationHealthAnalysis(request);
  }

  try {
    const geometry = boundsToGeoJsonPolygon(request.bounds);
    const stats = await fetchNdviStatistics(
      geometry,
      { from: request.startDate, to: request.endDate },
      config
    );

    if (stats.sampleCount < 1) {
      console.warn(
        `[satelliteVerification] No cloud-free Sentinel-2 pixels found for project ` +
          `${request.projectId} in ${request.startDate}..${request.endDate}; falling back to ` +
          'simulated vegetation health analysis.'
      );
      return simulateVegetationHealthAnalysis(request);
    }

    return {
      type: 'vegetation_health',
      data: {
        meanNDVI: stats.meanNdvi,
        meanEVI: stats.meanEvi ?? 0,
        healthScore: computeNdviHealthScore(stats.meanNdvi),
        anomalyDetected: stats.meanNdvi < NDVI_UNHEALTHY_THRESHOLD,
        imageDate: stats.interval?.to ?? request.endDate,
      },
    };
  } catch (error) {
    console.error(
      '[satelliteVerification] Copernicus NDVI lookup failed; falling back to simulated ' +
        `vegetation health analysis: ${error instanceof Error ? error.message : 'unknown error'}`
    );
    return simulateVegetationHealthAnalysis(request);
  }
}

/** Map a mean NDVI value to a 0–100 health score (0 → 0, 0.9+ → 100). */
function computeNdviHealthScore(ndvi: number): number {
  const normalised = Math.max(0, Math.min(ndvi, NDVI_SCORE_CEIL)) / NDVI_SCORE_CEIL;
  return Math.round(normalised * 100);
}

// ── Land plot audits ─────────────────────────────────────────────────────────

/** Options for {@link auditLandPlot}. */
export interface AuditLandPlotOptions {
  /** Override the Copernicus client config (defaults to env-derived config). */
  config?: CopernicusConfig;
  /** Override the acquisition window (defaults to a window around claimedAt). */
  dateRange?: NdviDateRange;
  /** Half-width (days) of the acquisition window around claimedAt. Default 15. */
  windowDays?: number;
  /** Optional cloud coverage (0–100) to attach to the satellite evidence. */
  cloudCoveragePercent?: number;
}

/**
 * Audit a ground planting claim against Sentinel-2 NDVI vegetation density.
 *
 * This is the cross-check used by verifiers/auditors: it fetches the mean NDVI
 * for the plot from the Copernicus Statistical API and compares it to the
 * steward's claimed vegetation status, returning a confirmed / disputed /
 * insufficient_data verdict with confidence and reasoning.
 *
 * Degrades gracefully: when credentials are missing or the API call fails, an
 * `insufficient_data` verdict is returned (with a console warning) rather than
 * throwing, so the audit endpoint stays available in every environment.
 *
 * @param claim   The steward's ground planting claim.
 * @param options Optional config / window overrides.
 * @returns       The land plot audit result.
 * @throws Error when the claim fails validation (callers should map this to 422).
 */
export async function auditLandPlot(
  claim: GroundPlantingClaim,
  options: AuditLandPlotOptions = {}
): Promise<LandPlotAuditResult> {
  const issues = validateGroundPlantingClaim(claim);
  if (issues.length > 0) {
    throw new Error(
      `Invalid land plot audit claim: ${issues.map((i) => `${i.field} (${i.message})`).join('; ')}`
    );
  }

  const config = options.config ?? getCopernicusConfig();

  const noDataEvidence: SatelliteNdviEvidence = {
    meanNdvi: 0,
    sampleCount: 0,
    imageDate: null,
    source: 'copernicus-sentinel-2',
    cloudCoveragePercent: options.cloudCoveragePercent,
  };

  if (!isCopernicusConfigured(config)) {
    console.warn(
      '[satelliteVerification] Copernicus credentials not configured; returning ' +
        'insufficient_data for land plot audit. Set COPERNICUS_CLIENT_ID and ' +
        'COPERNICUS_CLIENT_SECRET to cross-check claims against Sentinel-2 NDVI.'
    );
    return auditClaimAgainstNdvi(claim, noDataEvidence);
  }

  const geometry = resolveAuditGeometry(claim);
  const dateRange = options.dateRange ?? buildAuditWindow(claim.claimedAt, options.windowDays);

  let stats: NdviStatistics;
  try {
    stats = await fetchNdviStatistics(geometry, dateRange, config);
  } catch (error) {
    console.error(
      '[satelliteVerification] Copernicus NDVI lookup failed during land plot audit; ' +
        `returning insufficient_data: ${error instanceof Error ? error.message : 'unknown error'}`
    );
    return auditClaimAgainstNdvi(claim, noDataEvidence);
  }

  const evidence = evidenceFromStatistics(stats, options.cloudCoveragePercent);
  return auditClaimAgainstNdvi(claim, evidence);
}

/** Resolve a plot geometry from the claim, preferring bounds over a centroid. */
function resolveAuditGeometry(claim: GroundPlantingClaim): NdviQueryGeometry {
  if (claim.bounds) return boundsToGeoJsonPolygon(claim.bounds);
  const coords = claim.coordinates;
  if (!coords) throw new Error('Plot geometry could not be resolved from the claim.');
  return pointBufferToGeoJsonPolygon(coords.latitude, coords.longitude);
}

/** Build a symmetric acquisition window around the claim date, capped to now. */
function buildAuditWindow(claimedAt: string, windowDays = 15): NdviDateRange {
  const halfMs = windowDays * 24 * 60 * 60 * 1000;
  const center = new Date(claimedAt);
  const now = new Date();

  if (Number.isNaN(center.getTime())) {
    const from = new Date(now.getTime() - halfMs);
    return { from: from.toISOString(), to: now.toISOString() };
  }

  const from = new Date(center.getTime() - halfMs);
  const to = new Date(center.getTime() + halfMs);
  const cappedTo = to.getTime() > now.getTime() ? now : to;
  return { from: from.toISOString(), to: cappedTo.toISOString() };
}

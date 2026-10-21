'use client';

import { useState, useMemo, useEffect, type JSX } from 'react';
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Circle,
  Tooltip,
  Popup,
  useMap,
} from 'react-leaflet';
import Link from 'next/link';
import { Badge } from '@/components/atoms/Badge';
import { Button } from '@/components/atoms/Button';
import type { CarbonProject, ProjectType } from '@/lib/types/carbon';
import { getProjectClimateComparison } from '@/lib/climate/climateComparisonService';
import type {
  ClimateLayerMetric,
  ClimateLayerTimeframe,
  ProjectClimateComparison,
} from '@/lib/climate/climateComparisonTypes';
import { ClimateComparisonModal } from './ClimateComparisonModal';
import 'leaflet/dist/leaflet.css';

export type MapRegionFilter =
  'All' | 'Africa' | 'South America' | 'North America' | 'Europe' | 'Asia-Pacific';

export type MapAvailabilityFilter = 'all' | 'in_stock' | 'out_of_stock';

export interface OffsetProjectMapFilters {
  types: ProjectType[];
  regions: string[];
  availableOnly: boolean;
}

export interface OffsetProjectMapProps {
  projects: CarbonProject[];
  initialRegion?: MapRegionFilter;
  initialType?: string;
  initialAvailability?: MapAvailabilityFilter;
  filters?: OffsetProjectMapFilters;
  height?: string;
  className?: string;
  showFilters?: boolean;
  filters?: OffsetProjectMapFilters;
  className?: string;
  enableClimateLayerByDefault?: boolean;
}

// Region bounding box and view center definitions
const REGION_CENTERS: Record<MapRegionFilter, { center: [number, number]; zoom: number }> = {
  All: { center: [20, 0], zoom: 2 },
  Africa: { center: [2, 20], zoom: 3 },
  'South America': { center: [-15, -60], zoom: 3 },
  'North America': { center: [40, -100], zoom: 3 },
  Europe: { center: [54, 15], zoom: 4 },
  'Asia-Pacific': { center: [10, 105], zoom: 3 },
};

export function getProjectRegion(project: CarbonProject): MapRegionFilter {
  const loc = (project.location + ' ' + project.name).toLowerCase();
  if (
    loc.includes('brazil') ||
    loc.includes('amazon') ||
    loc.includes('peru') ||
    loc.includes('colombia') ||
    loc.includes('andes')
  ) {
    return 'South America';
  }
  if (
    loc.includes('kenya') ||
    loc.includes('senegal') ||
    loc.includes('nigeria') ||
    loc.includes('ghana') ||
    loc.includes('africa') ||
    loc.includes('sahel')
  ) {
    return 'Africa';
  }
  if (
    loc.includes('usa') ||
    loc.includes('texas') ||
    loc.includes('canada') ||
    loc.includes('ontario') ||
    loc.includes('north america')
  ) {
    return 'North America';
  }
  if (
    loc.includes('iceland') ||
    loc.includes('scotland') ||
    loc.includes('united kingdom') ||
    loc.includes('europe') ||
    loc.includes('germany')
  ) {
    return 'Europe';
  }
  if (
    loc.includes('india') ||
    loc.includes('indonesia') ||
    loc.includes('bangladesh') ||
    loc.includes('australia') ||
    loc.includes('asia') ||
    loc.includes('queensland')
  ) {
    return 'Asia-Pacific';
  }

  // Coordinate-based fallback
  const { latitude: lat, longitude: lng } = project.coordinates || {};
  if (typeof lat === 'number' && typeof lng === 'number') {
    if (lat >= -60 && lat <= 15 && lng >= -90 && lng <= -30) return 'South America';
    if (lat >= 10 && lat <= 85 && lng >= -170 && lng <= -50) return 'North America';
    if (lat >= 35 && lat <= 75 && lng >= -25 && lng <= 45) return 'Europe';
    if (lat >= -35 && lat <= 38 && lng >= -20 && lng <= 55) return 'Africa';
    if (lng >= 55 || (lat <= 15 && lng >= 90) || lat <= -10) return 'Asia-Pacific';
  }

  return 'All';
}

export function getProjectTypeColor(type: ProjectType): {
  fill: string;
  stroke: string;
  glow: string;
} {
  switch (type) {
    case 'Reforestation':
      return { fill: '#10b981', stroke: '#059669', glow: 'rgba(16, 185, 129, 0.4)' };
    case 'Renewable Energy':
      return { fill: '#f59e0b', stroke: '#d97706', glow: 'rgba(245, 158, 11, 0.4)' };
    case 'Mangrove Restoration':
      return { fill: '#06b6d4', stroke: '#0891b2', glow: 'rgba(6, 182, 212, 0.4)' };
    case 'Sustainable Agriculture':
      return { fill: '#8b5cf6', stroke: '#7c3aed', glow: 'rgba(139, 92, 246, 0.4)' };
    default:
      return { fill: '#14b6e7', stroke: '#0284c7', glow: 'rgba(20, 182, 231, 0.4)' };
  }
}

/** Determines climate overlay styling based on metric & timeframe */
function getClimateOverlayColor(
  climate: ProjectClimateComparison,
  metric: ClimateLayerMetric,
  timeframe: ClimateLayerTimeframe
): { fill: string; stroke: string; label: string } {
  if (metric === 'rainfall') {
    const rainfallMm =
      timeframe === 'historical'
        ? climate.historical.annualRainfallMm
        : climate.current.annualRainfallMm;

    if (timeframe === 'comparison') {
      const deltaPct = climate.comparison.rainfallDeltaPercent;
      if (deltaPct >= 10)
        return { fill: '#0284c7', stroke: '#0369a1', label: `Surplus (+${deltaPct}%)` };
      if (deltaPct >= -10)
        return {
          fill: '#10b981',
          stroke: '#059669',
          label: `Stable (${deltaPct >= 0 ? '+' : ''}${deltaPct}%)`,
        };
      if (deltaPct >= -25)
        return { fill: '#f59e0b', stroke: '#d97706', label: `Deficit (${deltaPct}%)` };
      return { fill: '#ef4444', stroke: '#b91c1c', label: `Severe Drought (${deltaPct}%)` };
    }

    if (rainfallMm >= 2200)
      return { fill: '#1d4ed8', stroke: '#1e40af', label: `${rainfallMm} mm (Very High)` };
    if (rainfallMm >= 1400)
      return { fill: '#0891b2', stroke: '#0e7490', label: `${rainfallMm} mm (High)` };
    if (rainfallMm >= 800)
      return { fill: '#16a34a', stroke: '#15803d', label: `${rainfallMm} mm (Moderate)` };
    if (rainfallMm >= 500)
      return { fill: '#d97706', stroke: '#b45309', label: `${rainfallMm} mm (Low)` };
    return { fill: '#dc2626', stroke: '#991b1b', label: `${rainfallMm} mm (Arid)` };
  }

  if (metric === 'temperature') {
    const tempC =
      timeframe === 'historical'
        ? climate.historical.meanTemperatureC
        : climate.current.meanTemperatureC;

    if (timeframe === 'comparison') {
      const deltaC = climate.comparison.temperatureDeltaC;
      if (deltaC >= 1.5)
        return { fill: '#ef4444', stroke: '#b91c1c', label: `Elevated Warming (+${deltaC}°C)` };
      if (deltaC >= 0.5)
        return { fill: '#f59e0b', stroke: '#d97706', label: `Moderate Warming (+${deltaC}°C)` };
      if (deltaC >= -0.5)
        return {
          fill: '#10b981',
          stroke: '#059669',
          label: `Baseline Baseline (${deltaC >= 0 ? '+' : ''}${deltaC}°C)`,
        };
      return { fill: '#3b82f6', stroke: '#1d4ed8', label: `Cooler Anomaly (${deltaC}°C)` };
    }

    if (tempC >= 26)
      return { fill: '#ef4444', stroke: '#dc2626', label: `${tempC.toFixed(1)}°C (Hot/Tropical)` };
    if (tempC >= 20)
      return { fill: '#f59e0b', stroke: '#d97706', label: `${tempC.toFixed(1)}°C (Warm)` };
    if (tempC >= 14)
      return { fill: '#10b981', stroke: '#059669', label: `${tempC.toFixed(1)}°C (Temperate)` };
    if (tempC >= 8)
      return { fill: '#06b6d4', stroke: '#0891b2', label: `${tempC.toFixed(1)}°C (Mild-Cool)` };
    return { fill: '#3b82f6', stroke: '#2563eb', label: `${tempC.toFixed(1)}°C (Cold)` };
  }

  // Planting conditions rating
  const score = climate.plantingConditions.suitabilityScore;
  if (score >= 85) return { fill: '#10b981', stroke: '#059669', label: `Optimal (${score}/100)` };
  if (score >= 70) return { fill: '#84cc16', stroke: '#65a30d', label: `Favorable (${score}/100)` };
  if (score >= 55)
    return { fill: '#eab308', stroke: '#ca8a04', label: `Moderate Risk (${score}/100)` };
  return { fill: '#ef4444', stroke: '#dc2626', label: `Challenging (${score}/100)` };
}

function MapViewUpdater({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo(center, zoom, { duration: 1.2 });
  }, [center, zoom, map]);
  return null;
}

export function OffsetProjectMap({
  projects,
  initialRegion = 'All',
  initialType = 'all',
  initialAvailability = 'all',
  height = '620px',
  showFilters = true,
  filters: externalFilters,
  className = '',
  enableClimateLayerByDefault = false,
}: OffsetProjectMapProps): JSX.Element {
  const [selectedRegion, setSelectedRegion] = useState<MapRegionFilter>(initialRegion);
  const [selectedType, setSelectedType] = useState<string>(initialType);
  const [selectedAvailability, setSelectedAvailability] =
    useState<MapAvailabilityFilter>(initialAvailability);
  const [activeProjectHover, setActiveProjectHover] = useState<CarbonProject | null>(null);

  // ── Climate Layer States ──────────────────────────────────────────────────
  const [climateLayerActive, setClimateLayerActive] = useState<boolean>(
    enableClimateLayerByDefault
  );
  const [climateMetric, setClimateMetric] = useState<ClimateLayerMetric>('rainfall');
  const [climateTimeframe, setClimateTimeframe] = useState<ClimateLayerTimeframe>('comparison');
  const [modalProject, setModalProject] = useState<ProjectClimateComparison | null>(null);

  // Configure Leaflet icon defaults in browser
  useEffect(() => {
    void import('leaflet').then((L) => {
      // @ts-expect-error Leaflet icon URL internals
      delete L.Icon.Default.prototype._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });
    });
  }, []);

  // Compute climate comparisons for all projects
  const climateMap = useMemo(() => {
    const map = new Map<string, ProjectClimateComparison>();
    projects.forEach((p) => {
      map.set(p.id, getProjectClimateComparison(p, 2026));
    });
    return map;
  }, [projects]);

  // Filter projects by region, type, and availability
  const filteredProjects = useMemo(() => {
    return projects.filter((p) => {
      if (externalFilters) {
        if (externalFilters.types.length > 0 && !externalFilters.types.includes(p.type))
          return false;
        if (externalFilters.regions.length > 0 && !externalFilters.regions.includes(p.location))
          return false;
        if (externalFilters.availableOnly && p.isOutOfStock) return false;
        return true;
      }
      if (selectedRegion !== 'All') {
        const reg = getProjectRegion(p);
        if (reg !== selectedRegion) return false;
      }
      if (selectedType !== 'all') {
        if (p.type !== selectedType) return false;
      }
      if (selectedAvailability === 'in_stock') {
        if (p.isOutOfStock || p.availableSupply <= 0) return false;
      } else if (selectedAvailability === 'out_of_stock') {
        if (!p.isOutOfStock && p.availableSupply > 0) return false;
      }
      return true;
    });
  }, [projects, selectedRegion, selectedType, selectedAvailability, externalFilters]);

  // Aggregate summary metrics
  const totalSupply = useMemo(() => {
    return filteredProjects.reduce((sum, p) => sum + p.availableSupply, 0);
  }, [filteredProjects]);

  const avgPrice = useMemo(() => {
    if (filteredProjects.length === 0) return '0.00';
    const sum = filteredProjects.reduce((s, p) => s + p.pricePerTon, 0);
    return (sum / filteredProjects.length).toFixed(2);
  }, [filteredProjects]);

  const projectTypesList = useMemo(() => {
    const set = new Set<string>();
    projects.forEach((p) => set.add(p.type));
    return Array.from(set);
  }, [projects]);

  const mapConfig = REGION_CENTERS[selectedRegion] || REGION_CENTERS.All;

  return (
    <div
      className={`flex flex-col gap-4 w-full ${className}`}
      data-testid="offset-project-map-container"
    >
      {showFilters && (
        <div className="bg-card border border-border/80 rounded-2xl p-4 shadow-sm backdrop-blur-md">
          {/* Quick Stats Bar */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 pb-4 border-b border-border/60">
            <div className="flex flex-col">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Active Projects
              </span>
              <span
                className="text-xl font-bold text-foreground"
                data-testid="active-projects-count"
              >
                {filteredProjects.length}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Available Credits
              </span>
              <span className="text-xl font-bold text-emerald-500">
                {totalSupply.toLocaleString(undefined, { maximumFractionDigits: 0 })}{' '}
                <span className="text-xs font-normal text-muted-foreground">tCO2e</span>
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Avg. Price / Ton
              </span>
              <span className="text-xl font-bold text-primary">${avgPrice}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Climate Layer
              </span>
              <span
                className={`text-xl font-bold ${climateLayerActive ? 'text-emerald-500' : 'text-muted-foreground'}`}
              >
                {climateLayerActive ? 'Active' : 'Disabled'}
              </span>
            </div>
          </div>

          {/* Filter Controls Row */}
          <div className="flex flex-wrap items-center gap-3 justify-between">
            {/* Region Pills */}
            <div
              className="flex flex-wrap items-center gap-1.5"
              role="group"
              aria-label="Filter by region"
            >
              <span className="text-xs font-semibold text-muted-foreground mr-1">Region:</span>
              {(
                [
                  'All',
                  'Africa',
                  'South America',
                  'North America',
                  'Europe',
                  'Asia-Pacific',
                ] as MapRegionFilter[]
              ).map((region) => (
                <button
                  key={region}
                  type="button"
                  aria-label={`Filter region ${region}`}
                  aria-pressed={selectedRegion === region}
                  onClick={() => setSelectedRegion(region)}
                  className={`px-3 py-1 text-xs font-medium rounded-full transition-all cursor-pointer ${
                    selectedRegion === region
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  {region}
                </button>
              ))}
            </div>

            {/* Type & Availability Selects */}
            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label="Filter by project type"
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                className="bg-background border border-border text-xs rounded-lg px-2.5 py-1.5 text-foreground focus:ring-1 focus:ring-primary outline-none cursor-pointer"
              >
                <option value="all">All Project Types</option>
                {projectTypesList.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>

              <select
                aria-label="Filter by availability"
                value={selectedAvailability}
                onChange={(e) => setSelectedAvailability(e.target.value as MapAvailabilityFilter)}
                className="bg-background border border-border text-xs rounded-lg px-2.5 py-1.5 text-foreground focus:ring-1 focus:ring-primary outline-none cursor-pointer"
              >
                <option value="all">All Availability</option>
                <option value="in_stock">In Stock Only</option>
                <option value="out_of_stock">Sold Out / Reserved</option>
              </select>

              {(selectedRegion !== 'All' ||
                selectedType !== 'all' ||
                selectedAvailability !== 'all') && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelectedRegion('All');
                    setSelectedType('all');
                    setSelectedAvailability('all');
                  }}
                  className="text-xs text-muted-foreground hover:text-foreground h-8 cursor-pointer"
                >
                  Reset
                </Button>
              )}
            </div>
          </div>

          {/* ── Climate Layer Toggle & Mode Controls Row ─────────────────── */}
          <div className="mt-3 pt-3 border-t border-border/60 flex flex-wrap items-center justify-between gap-3 bg-muted/20 p-2.5 rounded-xl">
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                data-testid="climate-layer-toggle"
                onClick={() => setClimateLayerActive((prev) => !prev)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer border ${
                  climateLayerActive
                    ? 'bg-emerald-600 text-white border-emerald-500 shadow-sm'
                    : 'bg-background text-muted-foreground border-border hover:text-foreground hover:bg-muted'
                }`}
                aria-pressed={climateLayerActive}
                aria-label="Toggle climate meteorological layer overlay on map"
              >
                <span>{climateLayerActive ? '🌱 Climate Layer: ON' : '🌦️ Climate Layer: OFF'}</span>
              </button>

              <span className="hidden sm:inline-block text-[11px] text-muted-foreground">
                Sourced from open meteorological APIs (Open-Meteo & NASA POWER)
              </span>
            </div>

            {climateLayerActive && (
              <div className="flex flex-wrap items-center gap-2 animate-fadeIn">
                {/* Metric Selector */}
                <div className="inline-flex rounded-lg border border-border bg-background p-0.5">
                  <button
                    type="button"
                    onClick={() => setClimateMetric('rainfall')}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                      climateMetric === 'rainfall'
                        ? 'bg-blue-600 text-white'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    🌧️ Rainfall (mm)
                  </button>
                  <button
                    type="button"
                    onClick={() => setClimateMetric('temperature')}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                      climateMetric === 'temperature'
                        ? 'bg-amber-600 text-white'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    🌡️ Temperature (°C)
                  </button>
                  <button
                    type="button"
                    onClick={() => setClimateMetric('conditions')}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                      climateMetric === 'conditions'
                        ? 'bg-emerald-600 text-white'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    🌱 Planting Conditions
                  </button>
                </div>

                {/* Timeframe / Comparison Selector */}
                <div className="inline-flex rounded-lg border border-border bg-background p-0.5">
                  <button
                    type="button"
                    onClick={() => setClimateTimeframe('comparison')}
                    className={`px-2 py-1 text-xs font-medium rounded-md transition-colors ${
                      climateTimeframe === 'comparison'
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    ⚖️ Historical vs Current
                  </button>
                  <button
                    type="button"
                    onClick={() => setClimateTimeframe('current')}
                    className={`px-2 py-1 text-xs font-medium rounded-md transition-colors ${
                      climateTimeframe === 'current'
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Current (2026)
                  </button>
                  <button
                    type="button"
                    onClick={() => setClimateTimeframe('historical')}
                    className={`px-2 py-1 text-xs font-medium rounded-md transition-colors ${
                      climateTimeframe === 'historical'
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Historical (30-yr)
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Interactive Map Visualizer */}
      <div
        className="relative w-full rounded-2xl overflow-hidden border border-border/80 shadow-lg bg-card"
        style={{ height }}
      >
        <MapContainer
          center={mapConfig.center}
          zoom={mapConfig.zoom}
          scrollWheelZoom={true}
          className="h-full w-full"
          aria-label="Global interactive carbon offset projects map with climate overlay"
        >
          <MapViewUpdater center={mapConfig.center} zoom={mapConfig.zoom} />
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {filteredProjects.map((project) => {
            const colors = getProjectTypeColor(project.type);
            const isOutOfStock = project.isOutOfStock || project.availableSupply <= 0;
            const markerRadius = isOutOfStock
              ? 7
              : Math.min(18, 9 + Math.log10(Math.max(10, project.availableSupply)) * 2.5);

            const climate =
              climateMap.get(project.id) ?? getProjectClimateComparison(project, 2026);
            const climateColor = getClimateOverlayColor(climate, climateMetric, climateTimeframe);

            return (
              <div key={project.id}>
                {/* Microclimate Zone Halo Overlay (Rendered when Climate Layer is active) */}
                {climateLayerActive && (
                  <Circle
                    center={[project.coordinates.latitude, project.coordinates.longitude]}
                    radius={55000} // ~55 km regional planting microclimate buffer
                    pathOptions={{
                      fillColor: climateColor.fill,
                      fillOpacity: 0.28,
                      color: climateColor.stroke,
                      weight: 1.5,
                      dashArray: '3, 6',
                    }}
                  />
                )}

                {/* Primary Project Pin */}
                <CircleMarker
                  center={[project.coordinates.latitude, project.coordinates.longitude]}
                  radius={climateLayerActive ? markerRadius + 3 : markerRadius}
                  pathOptions={{
                    fillColor: climateLayerActive
                      ? climateColor.fill
                      : isOutOfStock
                        ? '#94a3b8'
                        : colors.fill,
                    fillOpacity: isOutOfStock ? 0.4 : 0.88,
                    color: climateLayerActive
                      ? '#ffffff'
                      : isOutOfStock
                        ? '#64748b'
                        : colors.stroke,
                    weight: climateLayerActive ? 2.5 : 2,
                  }}
                  eventHandlers={{
                    mouseover: () => setActiveProjectHover(project),
                    mouseout: () => setActiveProjectHover(null),
                  }}
                >
                  {/* On-Hover Interactive Tooltip */}
                  <Tooltip
                    direction="top"
                    offset={[0, -10]}
                    opacity={1}
                    className="offset-project-tooltip"
                  >
                    <div className="p-1 min-w-[240px] max-w-[300px]">
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          {project.type}
                        </span>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                            isOutOfStock
                              ? 'bg-red-500/10 text-red-500'
                              : 'bg-emerald-500/10 text-emerald-600'
                          }`}
                        >
                          {isOutOfStock
                            ? 'Sold Out'
                            : `${project.availableSupply.toLocaleString()} tCO2e`}
                        </span>
                      </div>

                      <h4 className="font-semibold text-xs leading-tight mb-1 text-foreground">
                        {project.name}
                      </h4>
                      <p className="text-[11px] text-muted-foreground mb-1.5 flex items-center gap-1">
                        📍 {project.location}
                      </p>

                      {/* Climate Layer Preview in Tooltip */}
                      {climateLayerActive && (
                        <div className="mb-2 p-1.5 rounded-lg bg-muted/60 border border-border/60 text-[10px]">
                          <div className="font-bold text-foreground flex items-center justify-between mb-0.5">
                            <span>🌦️ Climate ({climateTimeframe})</span>
                            <span className="text-emerald-600 font-semibold">
                              {climate.plantingConditions.overallCondition}
                            </span>
                          </div>
                          <div className="text-muted-foreground flex justify-between">
                            <span>Rainfall (Hist/Curr):</span>
                            <strong className="text-foreground">
                              {climate.historical.annualRainfallMm} /{' '}
                              {climate.current.annualRainfallMm} mm
                            </strong>
                          </div>
                          <div className="text-muted-foreground flex justify-between">
                            <span>Temp (Hist/Curr):</span>
                            <strong className="text-foreground">
                              {climate.historical.meanTemperatureC}°C /{' '}
                              {climate.current.meanTemperatureC}°C
                            </strong>
                          </div>
                        </div>
                      )}

                      <div className="flex items-center justify-between text-xs pt-1 border-t border-border/50">
                        <span className="font-semibold text-primary">
                          ${project.pricePerTon.toFixed(2)} / ton
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {project.verificationStatus}
                        </span>
                      </div>
                    </div>
                  </Tooltip>

                  {/* Clickable Popup with Detailed Information & Climate Deep Dive */}
                  <Popup>
                    <div className="p-2 min-w-[280px] max-w-[340px]">
                      <div className="flex items-center justify-between mb-1.5">
                        <Badge variant="outline" className="text-[10px]">
                          {project.type}
                        </Badge>
                        <Badge
                          variant={isOutOfStock ? 'destructive' : 'default'}
                          className="text-[10px]"
                        >
                          {isOutOfStock ? 'Out of Stock' : 'Active Listing'}
                        </Badge>
                      </div>

                      <h3 className="font-bold text-sm text-foreground mb-0.5">{project.name}</h3>
                      <p className="text-xs text-muted-foreground mb-2">{project.description}</p>

                      {/* Side-by-side Climate Normals & Current Year Meteorological Card */}
                      <div className="mb-3 p-2.5 rounded-xl bg-blue-50/50 dark:bg-blue-950/30 border border-blue-500/20 text-xs">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="font-bold text-blue-700 dark:text-blue-300 flex items-center gap-1">
                            🌱 Planting Climate Data
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 font-medium">
                            Open Meteorological APIs
                          </span>
                        </div>

                        {/* Comparison Table */}
                        <div className="grid grid-cols-3 gap-1 py-1 border-y border-border/50 text-[11px] mb-2">
                          <div className="font-medium text-muted-foreground">Metric</div>
                          <div className="font-medium text-muted-foreground text-center">
                            Historical
                          </div>
                          <div className="font-medium text-muted-foreground text-right">
                            Current (2026)
                          </div>

                          <div className="text-foreground">Rainfall</div>
                          <div className="text-center font-semibold text-foreground">
                            {climate.historical.annualRainfallMm} mm
                          </div>
                          <div className="text-right font-semibold text-blue-600">
                            {climate.current.annualRainfallMm} mm
                          </div>

                          <div className="text-foreground">Mean Temp</div>
                          <div className="text-center font-semibold text-foreground">
                            {climate.historical.meanTemperatureC}°C
                          </div>
                          <div className="text-right font-semibold text-amber-600">
                            {climate.current.meanTemperatureC}°C
                          </div>
                        </div>

                        {/* Planting Conditions Assessment for Sponsors & Ecologists */}
                        <div className="text-[11px] space-y-1 text-muted-foreground">
                          <div className="flex justify-between items-center">
                            <span>Planting Suitability:</span>
                            <Badge
                              variant="outline"
                              className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                            >
                              {climate.plantingConditions.overallCondition} (
                              {climate.plantingConditions.suitabilityScore}/100)
                            </Badge>
                          </div>
                          <p className="text-[10px] italic text-muted-foreground leading-tight pt-1">
                            &quot;{climate.plantingConditions.moistureDescription}&quot;
                          </p>
                        </div>

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setModalProject(climate)}
                          className="w-full mt-2 h-7 text-[11px] font-semibold text-primary hover:bg-primary/10"
                        >
                          🔍 Open Climate Deep Dive &rarr;
                        </Button>
                      </div>

                      <div className="space-y-1 mb-3 text-xs bg-muted/40 p-2 rounded-lg">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Location:</span>
                          <span className="font-medium text-foreground">{project.location}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Standard:</span>
                          <span className="font-medium text-foreground">
                            {project.verificationStatus}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Available Supply:</span>
                          <span className="font-semibold text-emerald-600">
                            {project.availableSupply.toLocaleString()} tCO2e
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Price per Ton:</span>
                          <span className="font-bold text-primary">
                            ${project.pricePerTon.toFixed(2)} USDC
                          </span>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-border flex items-center justify-end">
                        <Link href={`/projects/${project.id}`}>
                          <Button size="sm" className="w-full text-xs">
                            View Project Details &rarr;
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </Popup>
                </CircleMarker>
              </div>
            );
          })}
        </MapContainer>

        {/* Dynamic Legend Overlay at Bottom Right */}
        <div className="absolute bottom-4 right-4 z-[1000] bg-background/90 backdrop-blur-md p-3 rounded-xl border border-border/80 shadow-md text-xs max-w-[230px]">
          {climateLayerActive ? (
            <div>
              <div className="font-semibold text-foreground mb-1 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  {climateMetric === 'rainfall'
                    ? 'Rainfall Scale'
                    : climateMetric === 'temperature'
                      ? 'Temperature Scale'
                      : 'Planting Conditions'}
                </span>
                <span className="text-[10px] text-muted-foreground uppercase">
                  {climateTimeframe}
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground mb-2">
                Open meteorological API overlay for ecologists & sponsors
              </p>

              {climateMetric === 'rainfall' && (
                <div className="space-y-1 text-[11px]">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-[#1d4ed8]" />
                    <span className="text-muted-foreground">&gt; 2,200 mm (High)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-[#0891b2]" />
                    <span className="text-muted-foreground">1,400–2,200 mm</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-[#16a34a]" />
                    <span className="text-muted-foreground">800–1,400 mm</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-[#d97706]" />
                    <span className="text-muted-foreground">&lt; 800 mm (Arid)</span>
                  </div>
                </div>
              )}

              {climateMetric === 'temperature' && (
                <div className="space-y-1 text-[11px]">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-[#ef4444]" />
                    <span className="text-muted-foreground">&gt; 26 °C (Hot)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-[#f59e0b]" />
                    <span className="text-muted-foreground">20–26 °C (Warm)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-[#10b981]" />
                    <span className="text-muted-foreground">14–20 °C (Temperate)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-[#3b82f6]" />
                    <span className="text-muted-foreground">&lt; 14 °C (Cool)</span>
                  </div>
                </div>
              )}

              {climateMetric === 'conditions' && (
                <div className="space-y-1 text-[11px]">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-[#10b981]" />
                    <span className="text-muted-foreground">Optimal (85–100)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-[#84cc16]" />
                    <span className="text-muted-foreground">Favorable (70–84)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-[#eab308]" />
                    <span className="text-muted-foreground">Moderate Risk (55–69)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-[#ef4444]" />
                    <span className="text-muted-foreground">Challenging (&lt; 55)</span>
                  </div>
                </div>
              )}

              <div className="mt-2 pt-1.5 border-t border-border/60 text-[9px] text-muted-foreground font-mono">
                Source: Open-Meteo & NASA POWER
              </div>
            </div>
          ) : (
            <div>
              <div className="font-semibold text-foreground mb-2 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse" /> Project Types
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-[#10b981]" />
                  <span className="text-muted-foreground">Reforestation</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-[#f59e0b]" />
                  <span className="text-muted-foreground">Renewable Energy</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-[#06b6d4]" />
                  <span className="text-muted-foreground">Mangrove / Blue Carbon</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-[#8b5cf6]" />
                  <span className="text-muted-foreground">Sustainable Agriculture</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-[#94a3b8]" />
                  <span className="text-muted-foreground">Sold Out / Reserved</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Floating Active Hover Card at Top Left with comprehensive details */}
        {activeProjectHover && (
          <div
            data-testid="project-hover-card"
            className="absolute top-4 left-4 z-[1000] bg-background/95 backdrop-blur-md p-3.5 rounded-xl border border-border/90 shadow-xl max-w-xs pointer-events-none transition-all duration-200"
          >
            <div className="flex items-center gap-1.5 mb-1">
              <Badge variant="outline" className="text-[10px]">
                {activeProjectHover.type}
              </Badge>
              <Badge
                variant={activeProjectHover.isOutOfStock ? 'destructive' : 'default'}
                className="text-[10px]"
              >
                {activeProjectHover.isOutOfStock
                  ? 'Sold Out'
                  : activeProjectHover.verificationStatus}
              </Badge>
            </div>
            <h4 className="font-bold text-sm text-foreground leading-tight mb-1">
              {activeProjectHover.name}
            </h4>
            <p className="text-xs text-muted-foreground mb-1.5">📍 {activeProjectHover.location}</p>

            {climateLayerActive && (
              <div className="mb-2 p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-[10px] space-y-0.5">
                <div className="font-semibold text-emerald-700 dark:text-emerald-400">
                  Planting Condition:{' '}
                  {climateMap.get(activeProjectHover.id)?.plantingConditions.overallCondition}
                </div>
                <div className="text-muted-foreground">
                  Rain: {climateMap.get(activeProjectHover.id)?.current.annualRainfallMm} mm (Δ{' '}
                  {climateMap.get(activeProjectHover.id)?.comparison.rainfallDeltaPercent}%) • Temp:{' '}
                  {climateMap.get(activeProjectHover.id)?.current.meanTemperatureC}°C
                </div>
              </div>
            )}

            <div className="flex items-center justify-between text-xs pt-1 border-t border-border/60">
              <span className="font-semibold text-primary">
                ${activeProjectHover.pricePerTon.toFixed(2)} / ton
              </span>
              <span className="font-medium text-emerald-600">
                {activeProjectHover.availableSupply.toLocaleString()} tCO2e available
              </span>
            </div>

            {activeProjectHover.coBenefits && activeProjectHover.coBenefits.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {activeProjectHover.coBenefits.map((b) => (
                  <span
                    key={b}
                    className="text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded"
                  >
                    {b}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Climate Comparison Deep Dive Modal for Ecologists & Sponsors */}
      <ClimateComparisonModal comparison={modalProject} onClose={() => setModalProject(null)} />
    </div>
  );
}

'use client';

import { useState, useMemo, useEffect, type JSX } from 'react';
import { MapContainer, TileLayer, CircleMarker, Tooltip, Popup, useMap } from 'react-leaflet';
import Link from 'next/link';
import { Badge } from '@/components/atoms/Badge';
import { Button } from '@/components/atoms/Button';
import type { CarbonProject, ProjectType } from '@/lib/types/carbon';
import 'leaflet/dist/leaflet.css';

export type MapRegionFilter =
  | 'All'
  | 'Africa'
  | 'South America'
  | 'North America'
  | 'Europe'
  | 'Asia-Pacific';

export type MapAvailabilityFilter = 'all' | 'in_stock' | 'out_of_stock';

interface OffsetProjectMapProps {
  projects: CarbonProject[];
  initialRegion?: MapRegionFilter;
  initialType?: string;
  initialAvailability?: MapAvailabilityFilter;
  height?: string;
  showFilters?: boolean;
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

function getProjectRegion(project: CarbonProject): MapRegionFilter {
  const loc = (project.location + ' ' + project.name).toLowerCase();
  if (loc.includes('brazil') || loc.includes('amazon') || loc.includes('peru') || loc.includes('colombia') || loc.includes('andes')) {
    return 'South America';
  }
  if (loc.includes('kenya') || loc.includes('senegal') || loc.includes('nigeria') || loc.includes('ghana') || loc.includes('africa') || loc.includes('sahel')) {
    return 'Africa';
  }
  if (loc.includes('usa') || loc.includes('texas') || loc.includes('canada') || loc.includes('ontario') || loc.includes('north america')) {
    return 'North America';
  }
  if (loc.includes('iceland') || loc.includes('scotland') || loc.includes('united kingdom') || loc.includes('europe') || loc.includes('germany')) {
    return 'Europe';
  }
  if (loc.includes('india') || loc.includes('indonesia') || loc.includes('bangladesh') || loc.includes('australia') || loc.includes('asia') || loc.includes('queensland')) {
    return 'Asia-Pacific';
  }
  return 'All';
}

function getProjectTypeColor(type: ProjectType): { fill: string; stroke: string; glow: string } {
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
}: OffsetProjectMapProps): JSX.Element {
  const [selectedRegion, setSelectedRegion] = useState<MapRegionFilter>(initialRegion);
  const [selectedType, setSelectedType] = useState<string>(initialType);
  const [selectedAvailability, setSelectedAvailability] = useState<MapAvailabilityFilter>(initialAvailability);
  const [activeProjectHover, setActiveProjectHover] = useState<CarbonProject | null>(null);

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

  // Filter projects by region, type, and availability
  const filteredProjects = useMemo(() => {
    return projects.filter((p) => {
      // Region match
      if (selectedRegion !== 'All') {
        const reg = getProjectRegion(p);
        if (reg !== selectedRegion) return false;
      }
      // Type match
      if (selectedType !== 'all') {
        if (p.type !== selectedType) return false;
      }
      // Availability match
      if (selectedAvailability === 'in_stock') {
        if (p.isOutOfStock || p.availableSupply <= 0) return false;
      } else if (selectedAvailability === 'out_of_stock') {
        if (!p.isOutOfStock && p.availableSupply > 0) return false;
      }
      return true;
    });
  }, [projects, selectedRegion, selectedType, selectedAvailability]);

  // Aggregate summary metrics
  const totalSupply = useMemo(() => {
    return filteredProjects.reduce((sum, p) => sum + p.availableSupply, 0);
  }, [filteredProjects]);

  const avgPrice = useMemo(() => {
    if (filteredProjects.length === 0) return 0;
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
    <div className="flex flex-col gap-4 w-full" data-testid="offset-project-map-container">
      {showFilters && (
        <div className="bg-card border border-border/80 rounded-2xl p-4 shadow-sm backdrop-blur-md">
          {/* Quick Stats Bar */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 pb-4 border-b border-border/60">
            <div className="flex flex-col">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Active Projects</span>
              <span className="text-xl font-bold text-foreground">{filteredProjects.length}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Available Credits</span>
              <span className="text-xl font-bold text-emerald-500">
                {totalSupply.toLocaleString(undefined, { maximumFractionDigits: 0 })} <span className="text-xs font-normal text-muted-foreground">tCO2e</span>
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Avg. Price / Ton</span>
              <span className="text-xl font-bold text-primary">${avgPrice}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Active Region</span>
              <span className="text-xl font-bold text-foreground">{selectedRegion}</span>
            </div>
          </div>

          {/* Filter Controls Row */}
          <div className="flex flex-wrap items-center gap-3 justify-between">
            {/* Region Pills */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-semibold text-muted-foreground mr-1">Region:</span>
              {(['All', 'Africa', 'South America', 'North America', 'Europe', 'Asia-Pacific'] as MapRegionFilter[]).map(
                (region) => (
                  <button
                    key={region}
                    type="button"
                    onClick={() => setSelectedRegion(region)}
                    className={`px-3 py-1 text-xs font-medium rounded-full transition-all cursor-pointer ${
                      selectedRegion === region
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                  >
                    {region}
                  </button>
                )
              )}
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

              {(selectedRegion !== 'All' || selectedType !== 'all' || selectedAvailability !== 'all') && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelectedRegion('All');
                    setSelectedType('all');
                    setSelectedAvailability('all');
                  }}
                  className="text-xs text-muted-foreground hover:text-foreground h-8"
                >
                  Reset
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Interactive Map Visualizer */}
      <div className="relative w-full rounded-2xl overflow-hidden border border-border/80 shadow-lg bg-card" style={{ height }}>
        <MapContainer
          center={mapConfig.center}
          zoom={mapConfig.zoom}
          scrollWheelZoom={true}
          className="h-full w-full"
          aria-label="Global interactive carbon offset projects map"
        >
          <MapViewUpdater center={mapConfig.center} zoom={mapConfig.zoom} />
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {filteredProjects.map((project) => {
            const colors = getProjectTypeColor(project.type);
            const isOutOfStock = project.isOutOfStock || project.availableSupply <= 0;
            const markerRadius = isOutOfStock ? 7 : Math.min(18, 9 + Math.log10(Math.max(10, project.availableSupply)) * 2.5);

            return (
              <CircleMarker
                key={project.id}
                center={[project.coordinates.latitude, project.coordinates.longitude]}
                radius={markerRadius}
                pathOptions={{
                  fillColor: isOutOfStock ? '#94a3b8' : colors.fill,
                  fillOpacity: isOutOfStock ? 0.4 : 0.85,
                  color: isOutOfStock ? '#64748b' : colors.stroke,
                  weight: 2,
                }}
                eventHandlers={{
                  mouseover: () => setActiveProjectHover(project),
                  mouseout: () => setActiveProjectHover(null),
                }}
              >
                {/* On-Hover Interactive Tooltip */}
                <Tooltip direction="top" offset={[0, -10]} opacity={1} className="offset-project-tooltip">
                  <div className="p-1 min-w-[220px] max-w-[280px]">
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {project.type}
                      </span>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                          isOutOfStock ? 'bg-red-500/10 text-red-500' : 'bg-emerald-500/10 text-emerald-600'
                        }`}
                      >
                        {isOutOfStock ? 'Sold Out' : `${project.availableSupply.toLocaleString()} tCO2e`}
                      </span>
                    </div>

                    <h4 className="font-semibold text-xs leading-tight mb-1 text-foreground">{project.name}</h4>
                    <p className="text-[11px] text-muted-foreground mb-1.5 flex items-center gap-1">
                      📍 {project.location}
                    </p>

                    <div className="flex items-center justify-between text-xs pt-1 border-t border-border/50">
                      <span className="font-semibold text-primary">${project.pricePerTon.toFixed(2)} / ton</span>
                      <span className="text-[10px] text-muted-foreground">{project.verificationStatus}</span>
                    </div>
                  </div>
                </Tooltip>

                {/* Clickable Popup with Detailed Information & Navigation */}
                <Popup>
                  <div className="p-2 min-w-[260px] max-w-[300px]">
                    <div className="flex items-center justify-between mb-1.5">
                      <Badge variant="outline" className="text-[10px]">
                        {project.type}
                      </Badge>
                      <Badge variant={isOutOfStock ? 'destructive' : 'default'} className="text-[10px]">
                        {isOutOfStock ? 'Out of Stock' : 'Active Listing'}
                      </Badge>
                    </div>

                    <h3 className="font-bold text-sm text-foreground mb-1">{project.name}</h3>
                    <p className="text-xs text-muted-foreground mb-2">{project.description}</p>

                    <div className="space-y-1 mb-3 text-xs bg-muted/40 p-2 rounded-lg">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Location:</span>
                        <span className="font-medium text-foreground">{project.location}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Standard:</span>
                        <span className="font-medium text-foreground">{project.verificationStatus}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Vintage Year:</span>
                        <span className="font-medium text-foreground">{project.vintageYear}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Available Supply:</span>
                        <span className="font-semibold text-emerald-600">
                          {project.availableSupply.toLocaleString()} tCO2e
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Price per Ton:</span>
                        <span className="font-bold text-primary">${project.pricePerTon.toFixed(2)} USDC</span>
                      </div>
                    </div>

                    {project.coBenefits && project.coBenefits.length > 0 && (
                      <div className="mb-3">
                        <span className="text-[10px] uppercase font-semibold text-muted-foreground block mb-1">
                          Verified Co-Benefits:
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {project.coBenefits.map((b) => (
                            <span key={b} className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                              {b}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

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
            );
          })}
        </MapContainer>

        {/* Legend Overlay at Bottom Right */}
        <div className="absolute bottom-4 right-4 z-[1000] bg-background/90 backdrop-blur-md p-3 rounded-xl border border-border/80 shadow-md text-xs">
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

        {/* Floating Active Hover Card at Top Left */}
        {activeProjectHover && (
          <div className="absolute top-4 left-4 z-[1000] bg-background/95 backdrop-blur-md p-3.5 rounded-xl border border-border/90 shadow-xl max-w-xs pointer-events-none transition-all duration-200">
            <div className="flex items-center gap-1.5 mb-1">
              <Badge variant="outline" className="text-[10px]">
                {activeProjectHover.type}
              </Badge>
              <Badge variant={activeProjectHover.isOutOfStock ? 'destructive' : 'default'} className="text-[10px]">
                {activeProjectHover.verificationStatus}
              </Badge>
            </div>
            <h4 className="font-bold text-sm text-foreground leading-tight mb-1">{activeProjectHover.name}</h4>
            <p className="text-xs text-muted-foreground mb-1.5">📍 {activeProjectHover.location}</p>
            <div className="flex items-center justify-between text-xs pt-1 border-t border-border/60">
              <span className="font-semibold text-primary">${activeProjectHover.pricePerTon.toFixed(2)} / ton</span>
              <span className="font-medium text-emerald-600">
                {activeProjectHover.availableSupply.toLocaleString()} tCO2e available
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

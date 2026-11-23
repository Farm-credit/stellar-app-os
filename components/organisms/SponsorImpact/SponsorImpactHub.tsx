'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Circle, CircleMarker, MapContainer, Popup, TileLayer } from 'react-leaflet';
import {
  Bell,
  ChevronRight,
  Gift,
  Leaf,
  MapPinned,
  Smartphone,
  Star,
  TreePine,
  Users,
} from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/molecules/Card';
import { Button } from '@/components/atoms/Button';
import { mockAllTimeSponsors } from '@/lib/api/mock/leaderboard';
import { ImpactReportsTab } from './ImpactReportsTab';

type Tab = 'overview' | 'portfolio' | 'rewards' | 'reports';
interface PortfolioProject {
  id: string;
  name: string;
  color: string;
  lat: number;
  lng: number;
  trees: number;
  co2Tonnes: number;
  species: number;
  health: number;
  protectedHectares: number;
}
const projects: PortfolioProject[] = [
  {
    id: 'mangrove-restoration',
    name: 'Delta Mangrove Restoration',
    color: '#0ea5e9',
    lat: 5.55,
    lng: 5.75,
    trees: 1240,
    co2Tonnes: 82.4,
    species: 8,
    health: 96,
    protectedHectares: 34.6,
  },
  {
    id: 'great-green-wall',
    name: 'Great Green Wall — Kano',
    color: '#16a34a',
    lat: 12.0,
    lng: 8.5,
    trees: 2860,
    co2Tonnes: 174.2,
    species: 12,
    health: 91,
    protectedHectares: 78.1,
  },
  {
    id: 'rainforest-corridor',
    name: 'Amazon Rainforest Corridor',
    color: '#9333ea',
    lat: -3.2,
    lng: -60.1,
    trees: 740,
    co2Tonnes: 48.7,
    species: 19,
    health: 88,
    protectedHectares: 21.4,
  },
];
const rewards = [
  {
    id: 'tree',
    name: 'Sponsor one native tree',
    cost: 500,
    description: 'A verified native tree planted in a partner grove.',
    icon: TreePine,
  },
  {
    id: 'mug',
    name: 'Recycled fibre travel mug',
    cost: 1200,
    description: '10% partner discount from EarthKind Supply.',
    icon: Gift,
  },
  {
    id: 'seed',
    name: 'Native seed collection',
    cost: 800,
    description: 'A seasonal seed pack from a local cooperative.',
    icon: Leaf,
  },
];
function Stat({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof Leaf;
}) {
  return (
    <div className="rounded-2xl border bg-card p-5">
      <Icon className="mb-4 h-5 w-5 text-stellar-green" />
      <p className="text-2xl font-black">{value}</p>
      <p className="text-sm font-medium">{label}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}
function PortfolioMap() {
  return (
    <div
      className="relative h-[360px] overflow-hidden rounded-2xl border bg-[#dff4ed] dark:bg-[#102c2a]"
      aria-label="Portfolio map with colour-coded project markers"
    >
      <MapContainer center={[4, -15]} zoom={2} scrollWheelZoom={false} className="h-full w-full">
        <TileLayer
          attribution="© OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {projects.map((project) => (
          <span key={project.id}>
            <Circle
              center={[project.lat, project.lng]}
              radius={project.protectedHectares * 900}
              pathOptions={{
                color: project.color,
                fillColor: project.color,
                fillOpacity: 0.14,
                weight: 2,
              }}
            />
            <CircleMarker
              center={[project.lat, project.lng]}
              radius={10}
              pathOptions={{
                color: project.color,
                fillColor: project.color,
                fillOpacity: 0.9,
                weight: 3,
              }}
            >
              <Popup>
                <div className="space-y-1">
                  <strong>{project.name}</strong>
                  <p>
                    {project.trees.toLocaleString()} trees · {project.health}% health
                  </p>
                  <Link className="text-stellar-blue underline" href={`/projects/${project.id}`}>
                    Open project
                  </Link>
                </div>
              </Popup>
            </CircleMarker>
          </span>
        ))}
      </MapContainer>
      <div className="absolute bottom-3 left-3 z-[500] rounded-xl bg-white/90 p-3 text-xs shadow backdrop-blur dark:bg-slate-950/90">
        <p className="mb-2 font-semibold">Projects</p>
        {projects.map((project) => (
          <div key={project.id} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: project.color }} />
            {project.name}
          </div>
        ))}
      </div>
    </div>
  );
}
function Overview() {
  const total = useMemo(() => projects.reduce((sum, project) => sum + project.trees, 0), []);
  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          icon={TreePine}
          label="Trees sponsored"
          value={total.toLocaleString()}
          detail="Across 3 active projects"
        />
        <Stat
          icon={Leaf}
          label="CO₂ captured"
          value="305.3 t"
          detail="Verified project estimates"
        />
        <Stat
          icon={MapPinned}
          label="Forest protected"
          value="134.1 ha"
          detail="Deforestation risk buffer"
        />
        <Stat icon={Star} label="Loyalty points" value="2,460" detail="Expires 18 Oct 2028" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Portfolio footprint</CardTitle>
            <CardDescription>
              Colour-coded projects, protection buffers, and drill-down access.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PortfolioMap />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Health alerts</CardTitle>
            <CardDescription>Push notifications are enabled for sponsor updates.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-3 rounded-xl bg-amber-50 p-4 text-sm dark:bg-amber-950/30">
              <Bell className="h-5 w-5 shrink-0 text-amber-600" />
              <p>
                <strong>Delta Mangrove Restoration</strong>
                <br />
                New satellite health update available.
              </p>
            </div>
            <div className="flex gap-3 rounded-xl bg-stellar-green/10 p-4 text-sm">
              <Smartphone className="h-5 w-5 shrink-0 text-stellar-green" />
              <p>Last cached tree data is available offline in the mobile app.</p>
            </div>
            <Link
              className="flex w-full items-center justify-center rounded-md bg-stellar-blue px-4 py-2 text-sm font-medium text-white hover:bg-stellar-blue/90"
              href="/dashboard/portfolio"
            >
              Open full portfolio <ChevronRight className="ml-2 h-4 w-4" />
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
function Rewards() {
  const [redeemed, setRedeemed] = useState<string | null>(null);
  return (
    <div className="space-y-6">
      <Card className="border-stellar-blue/20 bg-stellar-blue/5">
        <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Available balance</p>
            <p className="text-4xl font-black text-stellar-blue">
              2,460 <span className="text-base font-medium">points</span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Points expire after 2 years of inactivity · next expiry 18 Oct 2028
            </p>
          </div>
          <Gift className="h-12 w-12 text-stellar-blue" />
        </CardContent>
      </Card>
      <div className="grid gap-4 md:grid-cols-3">
        {rewards.map(({ id, name, cost, description, icon: Icon }) => (
          <Card key={id}>
            <CardContent className="flex h-full flex-col p-5">
              <Icon className="mb-4 h-7 w-7 text-stellar-green" />
              <h3 className="font-bold">{name}</h3>
              <p className="mt-2 flex-1 text-sm text-muted-foreground">{description}</p>
              <div className="mt-5 flex items-center justify-between">
                <span className="font-semibold">{cost.toLocaleString()} pts</span>
                <Button
                  size="sm"
                  disabled={redeemed === id || cost > 2460}
                  onClick={() => setRedeemed(id)}
                >
                  {redeemed === id ? 'Reserved' : 'Redeem'}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>How you earn points</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-3">
          <p>
            <TreePine className="mb-2 h-5 w-5 text-stellar-green" />
            <strong>1 point</strong> per tree sponsored
          </p>
          <p>
            <Users className="mb-2 h-5 w-5 text-stellar-green" />
            <strong>250 points</strong> per friend referral
          </p>
          <p>
            <Star className="mb-2 h-5 w-5 text-stellar-green" />
            <strong>50 points</strong> for reviews and events
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
function Portfolio() {
  const totals = projects.reduce(
    (acc, p) => ({
      trees: acc.trees + p.trees,
      co2: acc.co2 + p.co2Tonnes,
      species: acc.species + p.species,
      hectares: acc.hectares + p.protectedHectares,
    }),
    { trees: 0, co2: 0, species: 0, hectares: 0 }
  );
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-4">
        <Stat
          icon={TreePine}
          label="Trees"
          value={totals.trees.toLocaleString()}
          detail="Portfolio total"
        />
        <Stat
          icon={Leaf}
          label="CO₂ captured"
          value={`${totals.co2.toFixed(1)} t`}
          detail="Project-level aggregate"
        />
        <Stat
          icon={Star}
          label="Species"
          value={String(totals.species)}
          detail="Across all projects"
        />
        <Stat
          icon={MapPinned}
          label="Protected area"
          value={`${totals.hectares.toFixed(1)} ha`}
          detail="Buffer zones"
        />
      </div>
      <PortfolioMap />
      <div className="grid gap-4">
        {projects.map((project) => (
          <Link
            key={project.id}
            href={`/projects/${project.id}`}
            className="group rounded-2xl border bg-card p-5 transition hover:border-stellar-blue"
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: project.color }}
                  />
                  <h3 className="font-bold">{project.name}</h3>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {project.trees.toLocaleString()} trees · {project.species} species ·{' '}
                  {project.health}% health
                </p>
              </div>
              <div className="text-left sm:text-right">
                <p className="font-semibold">{project.protectedHectares} ha protected</p>
                <p className="text-sm text-muted-foreground">
                  {project.co2Tonnes} t CO₂{' '}
                  <ChevronRight className="inline h-4 w-4 transition group-hover:translate-x-1" />
                </p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
// TODO: replace with the authenticated sponsor once sponsor sessions exist.
const DEFAULT_SPONSOR_ADDRESS = mockAllTimeSponsors[0]?.address ?? '';

export function SponsorImpactHub({
  initialTab = 'overview',
  sponsorAddress = DEFAULT_SPONSOR_ADDRESS,
}: {
  initialTab?: Tab;
  sponsorAddress?: string;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-stellar-green">
          Sponsor centre
        </p>
        <h1 className="mt-2 text-4xl font-black tracking-tight">Your forest, in one view</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Track verified impact, earn rewards, and stay close to every tree you sponsor.
        </p>
      </div>
      <div className="flex flex-wrap gap-2 border-b pb-2">
        <Button
          variant={tab === 'overview' ? 'default' : 'ghost'}
          onClick={() => setTab('overview')}
        >
          Overview
        </Button>
        <Button
          variant={tab === 'portfolio' ? 'default' : 'ghost'}
          onClick={() => setTab('portfolio')}
        >
          Portfolio
        </Button>
        <Button variant={tab === 'rewards' ? 'default' : 'ghost'} onClick={() => setTab('rewards')}>
          Rewards
        </Button>
        <Button
          variant={tab === 'reports' ? 'default' : 'ghost'}
          onClick={() => setTab('reports')}
        >
          Impact Reports
        </Button>
      </div>
      {tab === 'overview' ? (
        <Overview />
      ) : tab === 'portfolio' ? (
        <Portfolio />
      ) : tab === 'reports' ? (
        <ImpactReportsTab sponsorAddress={sponsorAddress} />
      ) : (
        <Rewards />
      )}
    </div>
  );
}

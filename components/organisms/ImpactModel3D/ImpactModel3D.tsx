'use client';

/**
 * Impact visualization — 3D project model (Issue #1433)
 *
 * An explorable 3D model of an offset project plot. The forest grows as the
 * timeline advances, the soil cutaway underneath shows sequestered carbon
 * moving down through the 0–30 / 30–60 / 60–100 cm layers as roots deepen, and
 * the side panel tracks the emissions reduction rate year by year.
 *
 * The scene is built from CSS 3D transforms (no WebGL dependency), so it works
 * everywhere the app does, is cheap to render and stays crisp at any zoom.
 * Drag the scene to orbit it; the timeline can be played or scrubbed. All the
 * numbers come from `@/lib/impact/projectModel3d`.
 */

import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { Pause, Play, RotateCcw, Trees, Layers } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/molecules/Card';
import { Text } from '@/components/atoms/Text';
import {
  buildForestLayout,
  presetForProject,
  seedFrom,
  simulateProject,
  SOIL_LAYERS,
  type YearSnapshot,
} from '@/lib/impact/projectModel3d';
import type { CarbonProject } from '@/lib/types/carbon';

export interface ImpactModel3DProps {
  projects: readonly CarbonProject[];
  /** Years simulated on the timeline. */
  horizonYears?: number;
}

const PLOT_PX = 280;
const SOIL_DEPTH_PX = 90;
const DRAWN_TREES = 64;
const DEFAULT_VIEW = { pitch: 62, yaw: -35 };
const PLAY_INTERVAL_MS = 450;

const tonnes = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });

function formatT(value: number): string {
  return `${tonnes.format(value)} tCO₂e`;
}

function Tree({ heightPx, x, y }: { heightPx: number; x: number; y: number }) {
  const width = heightPx * 0.55;
  const plane = (spin: number) => (
    <div
      className="absolute bottom-0"
      style={{
        width,
        height: heightPx,
        left: -width / 2,
        transformOrigin: '50% 100%',
        transform: `rotateZ(${spin}deg) rotateX(-90deg)`,
      }}
    >
      <svg viewBox="0 0 20 36" width="100%" height="100%" preserveAspectRatio="none" aria-hidden>
        <rect x="8.5" y="24" width="3" height="12" className="fill-amber-800" />
        <path d="M10 0 L20 27 L0 27 Z" className="fill-emerald-600" />
      </svg>
    </div>
  );
  return (
    <div
      className="absolute"
      style={{
        left: ((x + 1) / 2) * PLOT_PX,
        top: ((y + 1) / 2) * PLOT_PX,
        transformStyle: 'preserve-3d',
      }}
    >
      {plane(0)}
      {plane(90)}
    </div>
  );
}

function SolarArray({ output }: { output: number }) {
  const rows = 6;
  return (
    <>
      {Array.from({ length: rows * rows }, (_, index) => {
        const column = index % rows;
        const row = Math.floor(index / rows);
        const cell = PLOT_PX / rows;
        return (
          <div
            key={index}
            className="absolute border border-sky-200/60 bg-sky-700"
            style={{
              left: column * cell + cell * 0.15,
              top: row * cell + cell * 0.2,
              width: cell * 0.7,
              height: cell * 0.5,
              opacity: 0.25 + 0.75 * output,
              transformOrigin: '50% 100%',
              transform: 'rotateX(-35deg)',
            }}
          />
        );
      })}
    </>
  );
}

/** One vertical face of the soil cutaway. `horizontal` lays layers left→right. */
function SoilFace({
  snapshot,
  maxLayerCarbon,
  style,
  horizontal,
}: {
  snapshot: YearSnapshot;
  maxLayerCarbon: number;
  style: CSSProperties;
  horizontal: boolean;
}) {
  const rootFraction = snapshot.rootDepthCm / 100;
  return (
    <div
      className={`absolute flex overflow-hidden ${horizontal ? 'flex-row' : 'flex-col'}`}
      style={style}
    >
      {snapshot.soilLayers.map((layer, index) => {
        const thickness = SOIL_LAYERS[index].bottomCm - SOIL_LAYERS[index].topCm;
        const density = maxLayerCarbon > 0 ? layer.carbonT / maxLayerCarbon : 0;
        return (
          <div
            key={layer.id}
            className="relative border-stone-900/30 bg-amber-900"
            style={{
              flexBasis: `${thickness}%`,
              borderWidth: horizontal ? '0 1px 0 0' : '0 0 1px 0',
            }}
          >
            <div
              className="absolute inset-0 bg-stone-950 transition-opacity duration-300"
              style={{ opacity: 0.1 + density * 0.75 }}
            />
          </div>
        );
      })}
      {rootFraction > 0 && (
        <div
          className="absolute border-dashed border-lime-300"
          style={
            horizontal
              ? { top: 0, bottom: 0, left: `${rootFraction * 100}%`, borderLeftWidth: 2 }
              : { left: 0, right: 0, top: `${rootFraction * 100}%`, borderTopWidth: 2 }
          }
        />
      )}
    </div>
  );
}

function ReductionChart({ snapshots, year }: { snapshots: YearSnapshot[]; year: number }) {
  const width = 300;
  const height = 80;
  const max = Math.max(1, ...snapshots.map((snapshot) => snapshot.reductionRateT));
  const x = (index: number) => (index / Math.max(1, snapshots.length - 1)) * width;
  const y = (value: number) => height - (value / max) * (height - 6) - 3;
  const points = snapshots.map((snapshot, index) => `${x(index)},${y(snapshot.reductionRateT)}`);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-20 w-full"
      role="img"
      aria-label={`Emissions reduction rate over ${snapshots.length - 1} years, peaking at ${formatT(max)} per year`}
    >
      <polygon
        points={`0,${height} ${points.join(' ')} ${width},${height}`}
        className="fill-emerald-500/15"
      />
      <polyline
        points={points.join(' ')}
        fill="none"
        className="stroke-emerald-600"
        strokeWidth={2}
      />
      <line
        x1={x(year)}
        x2={x(year)}
        y1={0}
        y2={height}
        className="stroke-foreground/50"
        strokeDasharray="3 3"
      />
      <circle
        cx={x(year)}
        cy={y(snapshots[year]?.reductionRateT ?? 0)}
        r={4}
        className="fill-emerald-600"
      />
    </svg>
  );
}

export function ImpactModel3D({ projects, horizonYears = 30 }: ImpactModel3DProps) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '');
  const [year, setYear] = useState(Math.min(10, horizonYears));
  const [playing, setPlaying] = useState(false);
  const [view, setView] = useState(DEFAULT_VIEW);
  const [showForest, setShowForest] = useState(true);
  const [showSoil, setShowSoil] = useState(true);
  const drag = useRef<{ x: number; y: number; pitch: number; yaw: number } | null>(null);

  const project = projects.find((candidate) => candidate.id === projectId) ?? projects[0];
  const params = useMemo(() => (project ? presetForProject(project) : null), [project]);
  const snapshots = useMemo(
    () => (params ? simulateProject(params, horizonYears) : []),
    [params, horizonYears]
  );
  const layout = useMemo(
    () =>
      buildForestLayout(
        params && params.treesPerHectare > 0 ? DRAWN_TREES : 0,
        seedFrom(projectId)
      ),
    [params, projectId]
  );
  const maxLayerCarbon = useMemo(
    () =>
      Math.max(
        0,
        ...snapshots.flatMap((snapshot) => snapshot.soilLayers.map((layer) => layer.carbonT))
      ),
    [snapshots]
  );

  useEffect(() => {
    if (!playing) return;
    if (year >= horizonYears) {
      setPlaying(false);
      return;
    }
    const timer = window.setTimeout(() => setYear((current) => current + 1), PLAY_INTERVAL_MS);
    return () => window.clearTimeout(timer);
  }, [playing, year, horizonYears]);

  if (!project || !params || snapshots.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Text variant="muted">No projects available to model.</Text>
        </CardContent>
      </Card>
    );
  }

  const snapshot = snapshots[Math.min(year, snapshots.length - 1)];
  const planted = snapshots[0].livingTrees;
  const livingShare = planted > 0 ? snapshot.livingTrees / planted : 0;
  const maxTreePx = Math.min(80, Math.max(30, params.matureHeightM * 3));
  const isEnergy = params.treesPerHectare === 0 && params.avoidedEmissionsPerYear > 0;

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, ...view };
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const { x, y, pitch, yaw } = drag.current;
    setView({
      yaw: yaw + (event.clientX - x) * 0.4,
      pitch: Math.min(85, Math.max(20, pitch - (event.clientY - y) * 0.3)),
    });
  };
  const endDrag = () => {
    drag.current = null;
  };

  const soilFaceBase = { width: PLOT_PX, height: SOIL_DEPTH_PX };
  const sceneLabel =
    `${project.name}, year ${snapshot.year}: ` +
    (isEnergy
      ? `solar array at ${Math.round(Math.min(1, snapshot.year / 2) * 100)}% output`
      : `${tonnes.format(snapshot.livingTrees)} living trees, canopy ${decimal.format(snapshot.canopyHeightM)} m`) +
    `, soil carbon ${formatT(snapshot.soilCo2T)} reaching ${Math.round(snapshot.rootDepthCm)} cm deep.`;

  return (
    <section className="space-y-6">
      <header className="flex flex-col gap-2">
        <Text variant="h1" className="text-foreground">
          3D project impact model
        </Text>
        <Text variant="muted" as="p" className="max-w-2xl">
          Step through a project&apos;s life: watch the forest grow, see carbon settle deeper into
          the soil as roots spread, and follow how many tonnes of emissions it removes each year.
          Drag the model to look around it.
        </Text>
      </header>

      <div className="flex flex-wrap items-end gap-4">
        <label className="text-sm font-medium">
          Project
          <select
            className="mt-1 block rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={project.id}
            onChange={(event) => {
              setProjectId(event.target.value);
              setPlaying(false);
            }}
          >
            {projects.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            aria-pressed={showForest}
            onClick={() => setShowForest((value) => !value)}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm hover:bg-muted"
          >
            <Trees className="h-4 w-4" aria-hidden /> {isEnergy ? 'Array' : 'Forest'}
          </button>
          <button
            type="button"
            aria-pressed={showSoil}
            onClick={() => setShowSoil((value) => !value)}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm hover:bg-muted"
          >
            <Layers className="h-4 w-4" aria-hidden /> Soil
          </button>
          <button
            type="button"
            onClick={() => setView(DEFAULT_VIEW)}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm hover:bg-muted"
          >
            <RotateCcw className="h-4 w-4" aria-hidden /> Reset view
          </button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <Card className="overflow-hidden">
          <div
            role="img"
            aria-label={sceneLabel}
            className="relative flex h-[26rem] cursor-grab touch-none select-none items-center justify-center bg-gradient-to-b from-sky-100 to-sky-50 active:cursor-grabbing dark:from-slate-900 dark:to-slate-800"
            style={{ perspective: 1100 }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            <div
              className="origin-center scale-75 sm:scale-100"
              style={{ transformStyle: 'preserve-3d' }}
            >
              <div
                className="relative"
                style={{
                  width: PLOT_PX,
                  height: PLOT_PX,
                  transformStyle: 'preserve-3d',
                  transform: `translateY(-20px) rotateX(${view.pitch}deg) rotateZ(${view.yaw}deg)`,
                }}
              >
                {/* Ground surface */}
                <div
                  className="absolute inset-0 border border-lime-900/30"
                  style={{
                    background: isEnergy
                      ? 'linear-gradient(135deg, #a8a29e, #d6d3d1)'
                      : `linear-gradient(135deg, #a16207, #65a30d ${Math.round(20 + snapshot.growth * 60)}%)`,
                  }}
                />

                {showSoil && (
                  <>
                    <SoilFace
                      snapshot={snapshot}
                      maxLayerCarbon={maxLayerCarbon}
                      horizontal={false}
                      style={{
                        ...soilFaceBase,
                        left: 0,
                        top: PLOT_PX,
                        transformOrigin: '50% 0',
                        transform: 'rotateX(-90deg)',
                      }}
                    />
                    <SoilFace
                      snapshot={snapshot}
                      maxLayerCarbon={maxLayerCarbon}
                      horizontal={false}
                      style={{
                        ...soilFaceBase,
                        left: 0,
                        top: 0,
                        transformOrigin: '50% 0',
                        transform: 'rotateX(-90deg)',
                      }}
                    />
                    <SoilFace
                      snapshot={snapshot}
                      maxLayerCarbon={maxLayerCarbon}
                      horizontal
                      style={{
                        width: SOIL_DEPTH_PX,
                        height: PLOT_PX,
                        left: PLOT_PX,
                        top: 0,
                        transformOrigin: '0 50%',
                        transform: 'rotateY(90deg)',
                      }}
                    />
                    <SoilFace
                      snapshot={snapshot}
                      maxLayerCarbon={maxLayerCarbon}
                      horizontal
                      style={{
                        width: SOIL_DEPTH_PX,
                        height: PLOT_PX,
                        left: 0,
                        top: 0,
                        transformOrigin: '0 50%',
                        transform: 'rotateY(90deg)',
                      }}
                    />
                  </>
                )}

                {showForest &&
                  (isEnergy ? (
                    <SolarArray output={Math.min(1, snapshot.year / 2)} />
                  ) : (
                    layout
                      .filter((tree) => tree.mortalityRank < livingShare)
                      .map((tree) => (
                        <Tree
                          key={tree.id}
                          x={tree.x}
                          y={tree.y}
                          heightPx={Math.max(3, maxTreePx * snapshot.growth * tree.scale)}
                        />
                      ))
                  ))}
              </div>
            </div>

            <div className="pointer-events-none absolute left-4 top-4 rounded-md bg-background/80 px-3 py-1.5 text-sm font-semibold backdrop-blur">
              Year {snapshot.year}
            </div>
            {showSoil && (
              <ul className="pointer-events-none absolute bottom-4 left-4 space-y-0.5 rounded-md bg-background/80 px-3 py-2 text-xs backdrop-blur">
                {snapshot.soilLayers.map((layer) => (
                  <li key={layer.id} className="flex justify-between gap-4">
                    <span>{layer.label}</span>
                    <span className="tabular-nums">{Math.round(layer.share * 100)}%</span>
                  </li>
                ))}
                <li className="flex items-center gap-1.5 pt-1 text-muted-foreground">
                  <span className="inline-block w-4 border-t-2 border-dashed border-lime-500" />{' '}
                  root front
                </li>
              </ul>
            )}
          </div>

          <CardContent className="flex items-center gap-4 pt-4">
            <button
              type="button"
              onClick={() => {
                if (year >= horizonYears) setYear(0);
                setPlaying((value) => !value);
              }}
              aria-label={playing ? 'Pause timeline' : 'Play timeline'}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-stellar-green text-white hover:opacity-90"
            >
              {playing ? (
                <Pause className="h-4 w-4" aria-hidden />
              ) : (
                <Play className="h-4 w-4" aria-hidden />
              )}
            </button>
            <label className="flex flex-1 items-center gap-3 text-sm">
              <span className="sr-only">Project year</span>
              <input
                type="range"
                min={0}
                max={horizonYears}
                value={snapshot.year}
                onChange={(event) => {
                  setPlaying(false);
                  setYear(Number(event.target.value));
                }}
                className="w-full accent-emerald-600"
              />
              <span className="w-16 text-right tabular-nums">
                {snapshot.year} / {horizonYears}
              </span>
            </label>
          </CardContent>
        </Card>

        <div className="space-y-4" aria-live="polite">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                {isEnergy ? 'Generation' : 'Forest growth'}
              </CardTitle>
              <CardDescription>
                {project.type} · {decimal.format(params.areaHectares)} ha
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 text-sm">
              {isEnergy ? (
                <div className="col-span-2">
                  <Text variant="label">Output</Text>
                  <p className="font-semibold">
                    {Math.round(Math.min(1, snapshot.year / 2) * 100)}% of capacity
                  </p>
                </div>
              ) : (
                <>
                  <div>
                    <Text variant="label">Canopy</Text>
                    <p className="font-semibold">{decimal.format(snapshot.canopyHeightM)} m</p>
                  </div>
                  <div>
                    <Text variant="label">Living trees</Text>
                    <p className="font-semibold">{tonnes.format(snapshot.livingTrees)}</p>
                  </div>
                  <div className="col-span-2">
                    <Text variant="label">Stored in biomass</Text>
                    <p className="font-semibold">{formatT(snapshot.biomassCo2T)}</p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Soil sequestration</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <Text variant="label">Soil carbon</Text>
                <p className="font-semibold">{formatT(snapshot.soilCo2T)}</p>
              </div>
              <div>
                <Text variant="label">Root depth</Text>
                <p className="font-semibold">{Math.round(snapshot.rootDepthCm)} cm</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Emissions reduction</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Text variant="label">This year</Text>
                  <p className="font-semibold text-stellar-green">
                    {formatT(snapshot.reductionRateT)}
                  </p>
                </div>
                <div>
                  <Text variant="label">Cumulative</Text>
                  <p className="font-semibold">{formatT(snapshot.cumulativeReductionT)}</p>
                </div>
              </div>
              <ReductionChart snapshots={snapshots} year={snapshot.year} />
            </CardContent>
          </Card>
        </div>
      </div>

      <Text variant="muted" as="p" className="text-xs">
        Modelled estimates from typical parameters for each project type, not verified issuance.
        Each drawn tree represents roughly{' '}
        {tonnes.format(Math.max(1, Math.round(planted / DRAWN_TREES)))} planted trees.
      </Text>
    </section>
  );
}

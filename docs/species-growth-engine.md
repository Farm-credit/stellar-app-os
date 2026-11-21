# Species growth rate calculation engine

Computes a species' expected CO2/biomass growth curve from planting through
maturity, optionally adjusted for a region's long-term rainfall and
temperature suitability.

## API

```http
GET /api/planting/growth-projection?speciesSlug=teak&lat=9.05&lon=7.49
GET /api/planting/growth-projection?speciesSlug=teak&years=30
GET /api/planting/growth-projection?treeRef=HRV-2024-0001
```

| Param | Required | Notes |
|---|---|---|
| `speciesSlug` | one of `speciesSlug`/`treeRef` | `species_catalogue.slug` |
| `treeRef` | one of `speciesSlug`/`treeRef` | Looks up an existing tree's species and lat/lng from `trees`; overrides `speciesSlug`/`lat`/`lon` if present |
| `lat`, `lon` | no | Region coordinates for climate adjustment. Omit to get a climate-neutral curve |
| `years` | no | Projection horizon; defaults to the species' `maturity_years` |

Response:

```json
{
  "species": { "slug": "teak", "commonName": "Teak", "biome": "Tropical dry forest", "co2KgPerYearAtMaturity": 22, "maturityYears": 20 },
  "climate": { "rainfallScore": 1, "temperatureScore": 1, "overallScore": 1, "climateFactor": 1.2 },
  "climateSource": "NASA POWER",
  "horizonYears": 20,
  "curve": [
    { "year": 0, "annualCo2RateKg": 0, "cumulativeCo2Kg": 0, "fractionOfMaturity": 0 },
    { "year": 1, "annualCo2RateKg": 1.62, "cumulativeCo2Kg": 0.81, "fractionOfMaturity": 0.0736 },
    "…",
    { "year": 20, "annualCo2RateKg": 25.08, "cumulativeCo2Kg": 271.44, "fractionOfMaturity": 0.95 }
  ]
}
```

`climate` is `null` when no coordinates were given, the biome has no known
climate envelope, or the climate API call failed — in every case the curve
is still returned, using a neutral 1.0 multiplier.

## Growth curve model

Annual CO2 sequestration rate is modelled with a **Chapman-Richards curve** —
a standard sigmoidal growth function from forestry biomass modelling —
bounded by the species' FAO Tier-1 mature-tree rate (`co2_kg_per_year` in
`species_catalogue`):

```
rate(t) = co2AtMaturity × climateFactor × (1 − e^(−k·t))²
```

`k` is solved so the curve reaches 95% of its ceiling at `maturity_years`.
Cumulative sequestration is the trapezoidal-rule integral of the annual rate
curve. This is a **projection**, not a guarantee — same framing as the
existing flat FAO/IPCC Tier-1 estimates already documented in the README's
Carbon Offset Methodology section.

## Climate suitability

Each biome present in `data/fao_co2_rates.csv` has a generalized rainfall
(mm/year) and temperature (°C) reference range in
`lib/growth/speciesGrowth.ts` (`BIOME_CLIMATE_ENVELOPES`), based on typical
FAO/Köppen-Geiger ecological-zone climate envelopes — a simplified reference,
not authoritative per-species data.

A region's rainfall and temperature normals (from the climate API) are each
scored 0–1 against the species' biome range (1.0 inside the range, decaying
linearly to 0 over a 30%-of-range margin outside it). The combined score is
their geometric mean, mapped to a `climateFactor` in **[0.6, 1.2]** that
scales the curve's ceiling — an ideal-climate region can modestly exceed the
FAO baseline; a poor match caps growth well below it.

## Climate data source

`lib/climate/climateClient.ts` calls [NASA POWER](https://power.larc.nasa.gov/)'s
climatology endpoint by default — free, no API key required, returns
long-term monthly/annual temperature and precipitation normals for any
lat/lon. The base URL, an optional bearer API key, and the request timeout
are configurable via `CLIMATE_API_BASE_URL` / `CLIMATE_API_KEY` /
`CLIMATE_API_TIMEOUT_MS` (see `.env.example`) so a different provider can be
swapped in without code changes.

## Failure handling

- **Climate API unavailable/slow/malformed** — `fetchClimateNormals` never
  throws; it returns `{ status: 'error', error }`, which the route logs
  (`lib/logger`) and treats as "no climate data" — the projection is still
  returned with a neutral 1.0 factor.
- **Unknown biome** — `scoreClimateSuitability` returns `null` rather than
  throwing; same climate-neutral fallback.
- **Unknown species / tree** — `404`. **Missing `speciesSlug`/`treeRef`** or
  an invalid `years` override — `400`. **Database failure** — `500` with a
  generic message (no internal detail leaked).

## Code layout

| File | Purpose |
|---|---|
| `lib/climate/climateTypes.ts` | `ClimateNormals`, `ClimateFetchResult` types |
| `lib/climate/climateClient.ts` | `fetchClimateNormals(lat, lon)` — NASA POWER client |
| `lib/growth/growthTypes.ts` | `SpeciesGrowthParams`, `GrowthCurvePoint`, `ClimateSuitability`, `GrowthProjection` types |
| `lib/growth/speciesGrowth.ts` | `calculateGrowthProjection`, `scoreClimateSuitability`, biome climate envelopes |
| `app/api/planting/growth-projection/route.ts` | The API route above |
| `lib/climate/__tests__/climateClient.test.ts` | Climate client tests: parsing, HTTP/network/timeout failures, env overrides |
| `lib/growth/__tests__/speciesGrowth.test.ts` | Growth curve tests: bounds, monotonicity, climate adjustment |
| `app/api/planting/growth-projection/route.test.ts` | Route tests: both lookup modes, 404/400/500 paths, climate-failure fallback |

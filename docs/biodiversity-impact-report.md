# Annual biodiversity impact report (issue [#1630](https://github.com/Farm-credit/stellar-app-os/issues/1630))

Status: **implemented** — `lib/biodiversity/impact-report.ts`, two API routes and the
`BiodiversityImpactReport` section on the project detail page.

## What it does

Every reforestation project gets one biodiversity impact report **per calendar
year**, showing:

* **Species diversity index** — Shannon H′ = −Σ pᵢ ln pᵢ with Pielou evenness
  J = H′ / ln S, plus species richness and individuals counted.
* **Wildlife sightings** — approved records grouped by taxonomic group, the
  species called out by name, and how many citizen-science records are still
  awaiting review.
* **Ecosystem recovery indicators** — tree survival rate, mean tree health,
  wildlife species recorded, habitat quality score, and the year-on-year
  movement of each, rolled up into a recovery band.
* **Field survey coverage** — which surveyors contributed, how many stems were
  counted, and the observation window, so a reader can see the report is backed
  by submissions rather than estimates.

The report is available on the project detail page and downloadable as a PDF.

## Where the data comes from (AC2)

The report never introduces a second source of truth. It is a projection over the
two pipelines the field teams already use:

| Source | Module | Feeds |
| ------ | ------ | ----- |
| Annual tree census (`POST /api/census/submit`) | `lib/census/service.ts` (`TreeCensusSubmission.speciesBreakdown`) | Shannon index, survival rate, mean tree health, stems counted |
| Wildlife sighting log (`POST /api/wildlife/sightings`) | `lib/wildlife/service.ts` | Wildlife section, habitat quality score, wildlife species richness |

Rules applied:

* Census rows count **living stems only** (`speciesBreakdown[].alive`), because
  dead stems say nothing about present diversity.
* Wildlife figures count **approved** sightings only — field-team records are
  auto-approved, citizen-scientist records after review. Pending records are
  reported separately so nothing is silently dropped.
* A year with sightings but no census falls back to sighting counts for the
  diversity index and labels the source (`diversity.source = 'wildlife'`), so the
  number is never presented as a census result.
* A year with no submissions still renders a report object, but with
  `sourceSubmissionCount: 0` and no invented index; the PDF route returns `404
  no_survey_data` instead of an empty document.
* The composite recovery band reuses the oracle thresholds already in
  `lib/biodiversity/recovery-score.ts` (degraded < 15, baseline < 35, early
  recovery < 60, recovering < 85, recovered ≥ 85) over a weighted mix of
  survival rate (0.5), habitat quality (0.3) and mean tree health (0.2),
  skipping any signal that was not measured.

## Annual cadence (AC3)

A year's report is `final` once the calendar year has ended (period end is
00:00 UTC on 1 January of the following year); the ongoing year is `in_progress`
and is recompiled on every request, so it stays current as submissions arrive.
`cadence.finalizationDate` tells the UI when the current year becomes final, and
`cadence.lastFinalYear` which year is the most recent closed one.

Nothing is persisted: reports are derived on read, so a re-download always
matches the submissions on file and there is no stale-copy problem. If a year's
report needs to be frozen for audit later, storing the generated PDF is enough —
the JSON body is reproducible from the same inputs.

## API

### `GET /api/projects/[id]/biodiversity-report`

Accepts a project id or slug. Optional `?year=YYYY` returns only that year.

```json
{
  "projectId": "proj-001",
  "cadence": {
    "currentReportYear": 2026,
    "lastFinalYear": 2025,
    "finalizationDate": "2027-01-01T00:00:00.000Z",
    "availableYears": [2026, 2025, 2024],
    "currentYearHasData": true
  },
  "reports": [ { "year": 2026, "diversity": { "shannonIndex": 0.85, "...": "..." }, "...": "..." } ],
  "methodology": ["One report per project per calendar year…"]
}
```

* `404 { error: 'Project not found' }` — unknown project id/slug.
* `400 { error, code: 'invalid_year' }` — year outside `2000..currentYear`.
* `404 { error, code: 'no_survey_data' }` — that year has no submissions.
* `Cache-Control: private, no-store` — reports are per-project data.

### `GET /api/projects/[id]/biodiversity-report/[year]/pdf`

Renders the same report as an A4 PDF (`@react-pdf/renderer`, the pattern used by
`app/api/certificates/[tree_id]`), `Content-Disposition: attachment;
filename="biodiversity-report-<projectId>-<year>.pdf"`. Same 400/404 cases as
above.

## UI

`components/organisms/BiodiversityImpactReport/BiodiversityImpactReport.tsx` is
rendered on the project detail page directly after the Wildlife Habitat Impact
section. It shows the cadence line ("2026 is still in progress and finalises on
1 Jan 2027"), one card per year with the headline metrics, wildlife group chips,
recovery indicators with trend arrows, survey coverage, a collapsible
methodology list, and a **Download PDF** button per year. Keyboard users get the
download as a normal link with `download`, and the methodology details are a
native `<details>` element.

## Tests

* `lib/biodiversity/impact-report.test.ts` — index maths, multi-submission
  aggregation, wildlife fallback, no-data behaviour, year filtering, recovery
  indicators and trends, final vs draft status, cadence, year validation.
* `app/api/projects/[id]/biodiversity-report/route.test.ts` — 200 shape, slug
  resolution, `?year` filtering, 400/404 cases, determinism.
* `app/api/projects/[id]/biodiversity-report/[year]/pdf/route.test.tsx` — PDF
  content type / filename, invalid year, missing data, unknown project (the
  renderer is mocked, as in the certificate route test).

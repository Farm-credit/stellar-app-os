# Multi-organisation project collaboration (Issue #1696)

Several partner organisations can co-manage one large forest project with
separate data-entry permissions and shared reporting.

Implementation: `lib/api/projectCollaboration.ts` (in-process store — swap
`store` for the Prisma/Postgres layer in production without changing routes or
components), wired through `app/api/projects/[id]/collaboration` and rendered
by `components/organisms/ProjectDetailView/ProjectCollaborationDashboard`.

## Roles

| Actor | Can do |
| --- | --- |
| **Project admin** | Add, assign zones to, and remove co-managing organisations; view everything; view the unified report |
| **Partner organisation** | See and submit planting data for **only its assigned zones** |

The project admin is recorded when the project's collaboration state is first
seeded (first `add_org` call) and is the only actor accepted for
`add_org`, `remove_org` and `assign_zones`.

## API

All endpoints live under `/api/projects/:projectId/collaboration`.

### `GET` — views

- `?orgId=<org>` → **org-scoped view** (AC2): that organisation's zones and
  entries only.
- `?adminAddress=<addr>` → **admin view** (AC1): all orgs, zones and entries,
  plus an `isProjectAdmin` flag.
- no query params → list of partner organisations.

### `GET /report` — unified report (AC3)

Aggregates every organisation's entries into `totals`, `byOrganisation` and
`byZone` breakdowns.

### `POST` — actions

| `action` | Actor | Effect |
| --- | --- | --- |
| `add_org` | project admin | Adds a co-managing org (`name`, optional `contactEmail`, `role`) |
| `remove_org` | project admin | Removes an org, releases its zones back to the pool, and discards its data-entry records (export the report first if they must be kept) |
| `assign_zones` | project admin | Assigns planting zones to an org (`orgId`, `zoneIds`) |
| `submit_entry` | any org | Records planting data (`orgId`, `zoneId`, `treesPlanted`, `areaHectares`, notes) — denied for zones the org is not assigned to |

Errors use `{ error, code }` with codes `project_not_found` (404),
`not_project_admin` (403), `org_not_found` / `invalid_zone` / `invalid_input`
(400) and `org_not_assigned_to_zone` (400).

## Acceptance criteria traceability

- **AC1 — project admin adds co-managing organisations**: `addPartnerOrg`,
  `removePartnerOrg`, `assignZones` (admin-gated).
- **AC2 — each organisation sees only its assigned planting zones**:
  `listZonesForOrg`, `getOrgScopedView`, `submitZoneEntry` (assignment-gated).
- **AC3 — unified project report aggregates data from all organisations**:
  `getUnifiedReport`.

## Testing

```bash
pnpm exec vitest run lib/api/__tests__/projectCollaboration.test.ts
```

The suite covers all three ACs plus permission, validation and removal edge
cases.

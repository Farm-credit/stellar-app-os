# Quarterly success-story curation (Issue #1717)

The success-story showcase is sourced from `lib/api/mock/farmerSuccessStories.ts` until an editorial CMS is available. Each public entry must have `editorialState: 'published'`, the quarter in which it was selected (`curatedQuarter`), a canonical project ID, measured restoration outcomes, accessible before/after image alt text, and a sponsor quote with attribution when approved. Draft, in-review, and archived records are excluded from the public list and story routes.

At each quarter boundary, the editorial team should review candidate project outcomes with field operations, verify impact figures and sponsor permissions, prepare or approve imagery, update the story records and set `curatedQuarter`, then publish the selected records by changing `editorialState` to `published`. To unpublish a record immediately, set its state to `archived`; the listing and detail route will stop serving it. Project IDs must exist in `lib/api/mock/carbonProjects.ts`, since the public project route renders those projects and includes matching story spotlights.

The current repository stores the showcase as a typed fixture and illustrations, not as a persistent editorial CMS. Moving curation to a database-backed workflow is a follow-on integration; this file documents the release procedure for the existing implementation.

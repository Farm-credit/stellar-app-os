# Tree sponsorship leaderboard

Issue #1636 adds `/leaderboard/tree-sponsors`, linked from `/leaderboard`.

## Setup

Apply `db/migrations/035_create_sponsor_leaderboard_preferences.sql` after the existing sponsorship-events migration (011), using the normal migration runner. Configure `DATABASE_URL` and a private `JWT_SECRET`; configure `REDIS_URL` for distributed wallet nonce consumption. No seed sponsors are published by this feature.

The leaderboard queries recorded `sponsorship_events.trees_funded`. Sponsorship ingestion remains the existing `recordSponsorship` flow. Future-dated and non-positive events are excluded. Monthly means the current UTC calendar month; all-time includes all events through the request time. Totals are partitioned by self-declared individual/corporate category. Ties use competition ranking (1, 1, 3); the result is capped at 100 entries with stable name/wallet ordering. Wallet addresses are never returned publicly.

## Privacy and authentication

In Settings / Leaderboard, connect Freighter, verify wallet ownership, choose a public display name/category, and explicitly opt in. The default is hidden. Homepage donor-wall consent remains independent. Freighter message signatures use SEP-53; the existing login endpoint accepts `scheme: "sep53"` alongside its backward-compatible raw signature mode. Access tokens are held only in component memory and discarded when the wallet changes or the settings component unmounts. Other wallet providers can use the authenticated API but the settings UI currently requires Freighter message signing.

GET/PUT `/api/leaderboard/preferences` require an access JWT from `/api/auth/login`; the authenticated subject determines the wallet. Refresh tokens and submitted wallet fields are rejected. PUT accepts `{ optedIn: boolean, displayName: string, sponsorType: "individual" | "corporate" }`.

GET `/api/leaderboard/tree-sponsors?period=monthly&type=individual` accepts `monthly|all-time` and `individual|corporate`. It has no public cache and evaluates current consent on every read. Visible pages refresh every five seconds and refresh immediately when returning to the tab; failed refreshes clear stale entries. Opting out takes effect on the next successful query and within five seconds on an active healthy client. This is polling, not a streaming subscription.

## Tests

Run `pnpm exec vitest run lib/leaderboard/treeSponsors.test.ts app/api/leaderboard/preferences/route.test.ts app/api/leaderboard/tree-sponsors/route.test.ts lib/auth/verifyWalletMessage.test.ts components/organisms/leaderboard/TreeSponsorLeaderboard.test.tsx components/organisms/settings/LeaderboardSection.test.tsx`.

The service tests run the migration and actual aggregation SQL using PGlite (PostgreSQL in WebAssembly), without production database access. They cover default privacy, UTC month boundaries, separate categories, ties, new events and opt-out. API tests cover ownership, input validation, refresh-token rejection and cache headers. Component tests cover filters, refreshes, stale-data removal, saving consent and wallet changes. Signature verification includes the official SEP-53 test vector: https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0053.md.

## Recorded component preview

[Watch the screen recording](recordings/tree-sponsor-leaderboard-1636.webm).

This is an isolated preview of the actual leaderboard and settings components with sample API data and a mock wallet. It demonstrates filters, opt-in, a new sponsorship appearing after polling, mobile layout and opt-out. It does **not** demonstrate a live wallet extension or production database. The repository's Next.js development shell currently reports `invariant expected layout router to be mounted` on both the existing `/leaderboard/sponsors` route and the new route in the local Windows environment. Database, authorization and signature behavior are covered separately by the regression tests.

The Freighter connection adapter uses the installed v6 `requestAccess` API and reads structured connection/network responses, so the settings flow no longer depends on the removed `getPublicKey` export. `lib/stellar/freighterConnection.test.ts` covers this adapter, and `app/api/auth/login/leaderboard-auth.test.ts` covers nonce-backed raw/SEP-53 login.

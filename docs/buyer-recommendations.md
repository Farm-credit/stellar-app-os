# Buyer project recommendations (Issue #1368)

The buyer recommendation experience is available at `/marketplace/recommendations`.
It lets a buyer describe their industry, company size, budget, preferred
co-benefits, and previously purchased projects, then ranks the available carbon
projects against those signals.

## How it works

`lib/marketplace/buyerRecommendations.ts` implements an explainable weighted
scorer. Each result includes a 0–100 score, per-signal breakdown, matching
co-benefits, a budget- and inventory-bounded tonnage suggestion, estimated cost,
and human-readable reasons. Projects that are out of stock or exceed the
one-tonne minimum budget are returned as exclusions instead of recommendations.

The page is rendered by `app/marketplace/recommendations/page.tsx` and
`components/organisms/BuyerRecommendations/BuyerRecommendations.tsx`. The
versioned `POST /api/v2/marketplace/recommendations` endpoint accepts the same
buyer profile and uses the same scoring module. Its current catalogue is the
sample data in `lib/api/mock/carbonProjects.ts`; connecting it to a live project
catalogue and buyer purchase history is a deployment/data-integration task.

## Verification

- `lib/marketplace/__tests__/buyerRecommendations.test.ts` covers all five
  ranking signals, stock and budget exclusions, suggested quantities, and
  input validation.
- `app/api/v2/marketplace/recommendations/route.test.ts` covers valid and
  invalid API requests and ranked responses.

This guide records the existing v1 implementation for
[Farm-credit/stellar-app-os#1368](https://github.com/Farm-credit/stellar-app-os/issues/1368).

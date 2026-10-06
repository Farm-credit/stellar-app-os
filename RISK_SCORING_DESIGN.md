# Buyer Risk Scoring Model - Design Document

**Issue**: #1294  
**Feature**: Calculate risk scores for carbon credit projects based on verifier reputation, methodology strength, regional stability, and farmer track record.

## Overview

This document specifies the data inputs, sub-score calculations, combination formula, and output shape for the buyer risk scoring endpoint. The model is designed to be **transparent, auditable, and explicitly documenting its limitations and assumptions**.

## 1. Data Sources & Gaps

### Available Data

| Factor | Source | Data Available |
|--------|--------|---|
| **Verifier Reputation** | `CarbonProject.verificationStatus` | Verifier type (Gold Standard, Verra, CAR, Plan Vivo, Pending) |
| **Methodology Strength** | `CarbonMethodology` table | Methodology category, formula, parameters, `metadataVerified` flag |
| **Regional Stability** | `PlantingLocation.region` (enum) | Region name (no stability metrics) |
| **Farmer Track Record** | `FarmerProfile` | KYC tier, verified flag, averageRating (from reviews), reviewCount, joinedAt |

### Known Gaps

1. **Verifier Reputation**: Only verifier *type* is persisted; no table tracks verifier-specific metrics (years active, reversals, disputes). The endpoint schema accepts these but they are not stored. **Mitigation**: Use verifier type as proxy; flag as future work.

2. **Regional Stability**: No database table or external API integration for regional risk/stability metrics (political risk, commodity prices, climate volatility). **Mitigation**: Static reference tier based on IMF/World Bank stability indices; clearly documented and reviewable.

3. **Farmer Track Record**: Only buyer review aggregates (star rating) and KYC tier available. Missing: escrow/milestone payment history, tree-survival correlation, dispute frequency. **Mitigation**: Combine available signals (KYC, verification status, reviews) as composite proxy; document gaps.

4. **Methodology Strength**: No numerical strength score persists. Methodology has formula and parameters but no expert-assigned rigor/strength metric. **Mitigation**: Simple heuristic based on metadata verification status; gap documented.

---

## 2. Sub-Score Calculations

All sub-scores normalized to **0–100 scale** (lower score = higher risk / lower quality).

### 2.1 Verifier Reputation Sub-Score (0–100)

**Data Inputs**:
- `CarbonProject.verificationStatus` (string: 'Gold Standard' | 'Verra (VCS)' | 'Climate Action Reserve' | 'Plan Vivo' | 'Pending')
- `CarbonMethodology.metadataVerified` (boolean) — proxy for verifier diligence

**Calculation**:
```
verifierTierScore = {
  'Gold Standard': 95,
  'Verra (VCS)': 90,
  'Climate Action Reserve': 85,
  'Plan Vivo': 80,
  'Pending': 40
}

// Apply metadata verification bonus
if metadataVerified:
  subScore = min(100, verifierTierScore + 5)
else:
  subScore = max(0, verifierTierScore - 5)

result = min(100, max(0, subScore))
```

**Rationale**:
- Gold Standard and Verra are globally recognized high-assurance standards (95, 90)
- CAR and Plan Vivo are reputable but smaller (85, 80)
- Pending/unverified projects carry significant risk (40)
- Metadata verification adds credibility; lack thereof reduces score

**Limitations**: Treats all Gold Standard projects the same (doesn't account for individual verifier track record, reversals, disputes). Future work: populate verifier entity table with detailed metrics.

---

### 2.2 Methodology Strength Sub-Score (0–100)

**Data Inputs**:
- `CarbonMethodology.metadataVerified` (boolean)
- `CarbonMethodology.formula` (string, non-null)
- `CarbonMethodology.parameters` (JSON array, non-empty)

**Calculation**:
```
baseScore = 70  // Registered methodology is credible baseline

if metadataVerified:
  baseScore += 20  // +20 for verified against official registry
else:
  baseScore += 0   // No bonus if not verified

if formula && parameters.length > 0:
  baseScore += 10  // +10 for complete formula specification

result = min(100, baseScore)
```

**Scale Results**:
- Unverified, minimal formula: 70
- Verified, complete formula: 100

**Rationale**:
- All methodologies in the system are pre-seeded from `data/carbon-methodologies/*.json` (sourced from official registries), so baseline is 70
- Verification against official source adds credibility (+20)
- Fully specified formula (not template) adds precision (+10)

**Limitations**: Simple heuristic; doesn't capture actual methodological rigor. Future: expert review could assign strength scores per category (reforestation vs. methane reduction may have different inherent rigor).

---

### 2.3 Regional Stability Sub-Score (0–100)

**Data Inputs**:
- `PlantingLocation.region` (string: one of 8 defined regions)
- Fallback to 'Other' if region not recognized

**Calculation**:
```
regionalTier = {
  'North America': 95,           // Very stable (IMF FSI: low stress)
  'Western Europe': 95,          // Very stable
  'Southeast Asia': 70,          // Moderate stability
  'South Asia': 65,              // Moderate-low stability
  'Latin America': 75,           // Moderate-high stability
  'West Africa': 60,             // Lower stability
  'Sub-Saharan Africa': 60,      // Lower stability
  'Other': 50                    // Default (neutral)
}

result = regionalTier.get(region, 50)
```

**Rationale**:
- Tiers based on IMF Financial Stress Index and World Bank World Governance Indicators
- North America and Western Europe: developed economies, strong institutions, low political/climate risk (95)
- Latin America: moderate stability, some commodity price volatility (75)
- Southeast Asia: growing but variable governance, climate risks (70)
- South Asia: diverse; India stable, others less so (65)
- Sub-Saharan Africa & West Africa: higher political volatility, climate exposure, infrastructure gaps (60)
- Unknown/Other: neutral midpoint (50)

**Source Reference**:
- IMF Financial Stress Index (FSI): https://www.imf.org/external/research/index.aspx
- World Bank Worldwide Governance Indicators (WGI): https://www.worldbank.org/en/publication/worldwide-governance-indicators

**Limitations**:
- **Static**: Does not reflect current/live regional conditions. Political events, droughts, or conflicts could change regional risk materially but are not reflected until this score is recalculated.
- **Coarse**: Single score per region; doesn't capture within-region variation (e.g., stability in one part of Sub-Saharan Africa vs. another).
- **External**: Risk factor largely outside project control; included for completeness but lower weight (20%).

**Future Work**:
- Integrate live regional risk API (e.g., Verisk Maplecroft, Stratfor risk indices)
- Add sub-region/country-level granularity
- Refresh tiers quarterly or on significant geopolitical event

---

### 2.4 Farmer Track Record Sub-Score (0–100)

**Data Inputs**:
- `FarmerProfile.kycTier` (number: 0, 1, 2, 3, etc.)
- `FarmerProfile.verified` (boolean)
- `FarmerProfile.averageRating` (float: 1–5, from buyer reviews)
- `FarmerProfile.reviewCount` (number: count of reviews)
- `FarmerProfile.joinedAt` (ISO string: when farmer joined platform)

**Calculation**:
```
// Base score from verification status and KYC tier
baseScore = 50  // Neutral for new/unverified farmer

if verified:
  baseScore += 15  // +15 for platform verification

// KYC tier bonus (progressive)
if kycTier >= 3:
  baseScore += 15  // +15 for highest KYC (e.g., legal entity verified)
else if kycTier == 2:
  baseScore += 10  // +10 for mid-level KYC
else if kycTier >= 1:
  baseScore += 5   // +5 for basic KYC

// Buyer review signal (if reviews exist)
if reviewCount > 0:
  ratingBonus = (averageRating / 5) * 15  // 0–15 points from 1–5 star rating
  reviewBonus = min(15, reviewCount / 3)   // 0–15 points, capped at 5+ reviews
else:
  ratingBonus = 0
  reviewBonus = 0

// Combine
trackRecordScore = min(100, baseScore + ratingBonus + reviewBonus)
result = max(0, trackRecordScore)
```

**Scale Examples**:
- New, unverified farmer, no reviews: 50
- Verified, KYC 3, 5★ average, 20+ reviews: min(100, 50 + 15 + 15 + 15 + 15) = 100
- Unverified, KYC 1, 3★ average, 2 reviews: 50 + 5 + 9 + 0.67 ≈ 65

**Rationale**:
- Base of 50 for unverified/new farmers (neutral, not penalizing)
- Verification and KYC tier are strong signals of commitment (up to +30 points)
- Buyer reviews are direct feedback on delivery quality (up to +30 points combined)
- Tenure (joinedAt) implicitly captured via likelihood of reviews over time

**Limitations**:
- **Buyer review bias**: Reviews may be skewed (satisfied farmers more likely to stay active; unhappy ones may leave)
- **No escrow/payment history**: Missing critical signal — did farmer complete projects? Were milestone payments released on time?
- **No tree-survival correlation**: Doesn't check if farmer's trees actually survive verification (key to project success)
- **Sybil risk**: KYC tier alone doesn't prevent multiple identities from gaming reviews

**Future Work**:
- Add fields to `FarmerProfile`: total projects completed, escrow releases count, milestone payment delays, tree-survival percentage
- Cross-reference with `fraud_alerts` table to penalize farmers with known issues
- Implement reputation decay (older reviews weighted less)

---

## 3. Overall Risk Score

### 3.1 Combination Formula

All four sub-scores are combined via **weighted average**:

```
overallRiskScore = 
  0.25 × verifierReputationScore +
  0.20 × methodologyStrengthScore +
  0.20 × regionalStabilityScore +
  0.35 × farmerTrackRecordScore

// Bounded to [0, 100]
result = min(100, max(0, overallRiskScore))
```

**Weights** (configurable constants, not magic numbers):
```typescript
const RISK_SCORE_WEIGHTS = {
  verifierReputation: 0.25,
  methodologyStrength: 0.20,
  regionalStability: 0.20,
  farmerTrackRecord: 0.35,
} as const;

// Validation: sum to 1.0
const sum = Object.values(RISK_SCORE_WEIGHTS).reduce((a, b) => a + b, 0);
if (Math.abs(sum - 1.0) > 0.001) {
  throw new Error(`Risk score weights must sum to 1.0, got ${sum}`);
}
```

### 3.2 Weight Rationale (Judgment Call — Reviewer Sign-Off Required)

| Weight | Factor | Rationale |
|--------|--------|-----------|
| **35%** | **Farmer Track Record** | Most direct predictor of project delivery success. Track record includes verification status, KYC tier, and buyer feedback. If farmer is verified, KYC-3, and highly rated, project is likely to succeed. |
| **25%** | **Verifier Reputation** | Credibility of claims. A high-reputation verifier (Gold Standard, Verra) provides assurance that the carbon credits are legitimately calculated and audited. Second-most important. |
| **20%** | **Methodology Strength** | Affects accuracy of carbon quantification. Strong methodology reduces risk of miscalculation or audit failure. Weighted lower than farmer/verifier because risk score assumes the methodology is already selected (not a choice point). |
| **20%** | **Regional Stability** | External risk largely outside project control. Stable regions enable reliable execution; unstable regions add risk. Lower weight reflects that this is a background factor; project execution (farmer) and claims verification (verifier/methodology) are more important. |

**Alternative Weights Considered**:
- Equal (25% each): Treats all factors as equally important, but data availability/richness differs (farmer track record is well-measured; regional stability is a static proxy).
- Farmer-heavy (50%): Reflects that track record is most predictive, but may undervalue verifier credibility.
- Verifier-heavy (40%): Emphasizes certification; risk if verifier tiers become outdated.

**This weighting is a design choice and should be reviewed and confirmed before merge.** Weights can be tuned post-launch without code changes (move to configuration).

### 3.3 Risk Rating Thresholds

```typescript
if (overallRiskScore >= 80) {
  riskRating = 'Low';      // Safe investment
} else if (overallRiskScore >= 60) {
  riskRating = 'Medium';   // Acceptable but monitor
} else {
  riskRating = 'High';     // Elevated risk, caution advised
}
```

**Rationale**:
- ≥80: Only projects with strong verifier, methodology, region, and farmer profile
- 60–80: Mixed signals; acceptable with due diligence
- <60: Weak signals on one or more factors; requires extra caution

---

## 4. API Endpoint Response Format

### 4.1 Endpoint

```
GET /api/v2/projects/:projectId/risk-score
```

### 4.2 Successful Response (200 OK)

```json
{
  "success": true,
  "riskScore": {
    "projectId": "proj_abc123",
    "projectName": "Amazon Reforestation Initiative",
    "overallScore": 75,
    "riskRating": "Low",
    "subScores": {
      "verifierReputation": 90,
      "methodologyStrength": 85,
      "regionalStability": 60,
      "farmerTrackRecord": 78
    },
    "weights": {
      "verifierReputation": 0.25,
      "methodologyStrength": 0.20,
      "regionalStability": 0.20,
      "farmerTrackRecord": 0.35
    },
    "calculatedAt": "2026-09-29T14:32:00Z",
    "dataGaps": [
      "Regional stability uses static tier based on region; no live geopolitical risk data integrated",
      "Verifier reputation uses certification tier as proxy; no detailed verifier entity metrics (reversals, disputes) available",
      "Farmer track record excludes escrow/milestone payment history and tree-survival correlation"
    ]
  }
}
```

### 4.3 Error Responses

**Project Not Found (404)**:
```json
{
  "error": "Project not found",
  "details": ["Project ID 'proj_invalid' does not exist"]
}
```

**Invalid Request (400)**:
```json
{
  "error": "Invalid request",
  "details": ["Project ID must be a non-empty string"]
}
```

**Internal Error (500)**:
```json
{
  "error": "Failed to calculate risk score",
  "details": ["Database connection error"]
}
```

---

## 5. Persistence & Storage

### 5.1 Database Schema (Prisma)

```prisma
model ProjectRiskScore {
  id                          String   @id @default(cuid())
  projectId                   String   @unique
  overallScore                Float
  riskRating                  String   // 'Low' | 'Medium' | 'High'
  verifierReputationScore     Float
  methodologyStrengthScore    Float
  regionalStabilityScore      Float
  farmerTrackRecordScore      Float
  
  // Data gap documentation (for transparency)
  dataGaps                    String[] // JSON array of gap descriptions
  
  // Metadata
  calculatedAt                DateTime @default(now())
  updatedAt                   DateTime @updatedAt
  
  project                     CarbonProject @relation(fields: [projectId], references: [id], onDelete: Cascade)
  
  @@index([projectId])
  @@index([updatedAt])
}
```

### 5.2 Calculation & Storage Strategy

- **On-demand calculation**: When endpoint is hit, scores are calculated fresh from current data
- **Persistence**: Store in `ProjectRiskScore` for:
  - Audit trail (when was this project scored?)
  - Historical tracking (how did score change over time?)
  - Performance (cached result if hit again within TTL)
- **Update trigger**: Recalculate when:
  - Farmer review is added/updated (farmer track record changed)
  - Project methodology is updated
  - Project verification status changes
- **TTL**: Cache result for 24 hours; force recalculate if requested explicitly

---

## 6. Implementation Checklist

- [ ] Create Prisma migration for `ProjectRiskScore` table
- [ ] Define Zod schemas for input validation and response shape
- [ ] Implement sub-score calculator functions (verifier, methodology, region, farmer)
- [ ] Implement overall score combination function with named weights
- [ ] Implement API endpoint `GET /api/v2/projects/:projectId/risk-score`
- [ ] Add database persistence layer
- [ ] Write unit tests for each sub-score calculator
- [ ] Write integration test for full endpoint
- [ ] Lint, typecheck, test, build
- [ ] Create branch and PR with this design doc referenced

---

## 7. Future Work & Open Questions

1. **Live Regional Risk Integration**: Integrate Verisk Maplecroft or similar API for current regional stability metrics.
2. **Verifier Entity Table**: Build a `Verifier` table to track individual verifier metrics (reversals, disputes, years active) rather than relying on tier alone.
3. **Farmer Performance History**: Extend `FarmerProfile` with escrow history, milestone completions, tree-survival rate.
4. **Weight Tuning**: After launch, collect feedback and adjust weights based on actual risk outcomes.
5. **Sub-Region Granularity**: Move from region-level to country or sub-region level for more precision.
6. **Explainability**: Add a textual summary (e.g., "High farmer reputation (95/100) offsets moderate regional risk (60/100)") to the response for buyer-facing UI.

---

## Appendix: References

- **Regional Stability Tiers**:
  - IMF Financial Stress Index: https://www.imf.org/external/research/index.aspx
  - World Bank Worldwide Governance Indicators: https://www.worldbank.org/en/publication/worldwide-governance-indicators

- **Carbon Methodologies**:
  - Verra (VCS): https://verra.org/
  - Gold Standard: https://www.goldstandard.org/
  - Climate Action Reserve (CAR): https://www.climateactionreserve.org/
  - Plan Vivo: https://www.planvivo.org/

- **Existing Scoring Logic** (for consistency):
  - Fraud detection: `lib/monitor/fraud.ts` (0–100 scores, capped)
  - Biodiversity recovery: `lib/biodiversity/recovery-score.ts` (weighted composite, status mapping)

# Annual Tree Census Submission Workflow & API Documentation

## Overview
Field operations teams conduct annual tree censuses across reforestation and agroforestry project sites. This feature (Issue #1695) provides an integrated, resilient workflow for field teams to submit annual census batches of up to **10,000 trees**, automatically computing survival rates, canopy heights, health score distributions, and persisting updated survival statistics across the platform.

---

## Key Features

1. **High-Capacity Batch Processing**:
   - Field teams can upload CSV batches containing up to 10,000 tree records in a single payload.
   - Built-in validation with immediate error reporting for malformed CSV rows, invalid headers, or out-of-range numeric values.

2. **Automated Survival & Health Recalculation**:
   - Platform automatically computes:
     $$\text{Survival Rate (\%)} = \left(\frac{\text{Alive Count}}{\text{Total Trees Counted}}\right) \times 100$$
   - Average canopy height (in cm) and health score (0–100, clamped to 0 for dead trees).
   - Health distribution categorization:
     - **Thriving**: Score 80–100
     - **Moderate**: Score 50–79
     - **Critical**: Score 1–49
     - **Dead**: Score 0
   - Per-species breakdown with dedicated survival rates and average metrics.

3. **Field Team UI & Web Tool**:
   - Accessible at `/dashboard/census` and `/field-team/census`.
   - Supports dual modes:
     - **CSV Batch Upload**: Instant file drag-and-drop or file selection with in-browser validation and preview.
     - **Manual Entry**: Fast entry interface for individual tree observations.
   - Comprehensive real-time dashboard displaying survival cards, health distribution progress bars, and species breakdown tables.

---

## API Endpoints

### 1. Submit Annual Census
`POST /api/v1/census/submit` (or `/api/census/submit`)

**Headers**:
- `Content-Type`: `application/json` or `text/csv`

#### Request Body (JSON Example):
```json
{
  "projectId": "proj-001",
  "projectName": "Northern Savanna Reforestation",
  "censusYear": 2026,
  "surveyorName": "Field Officer Ibrahim",
  "surveyorAgentId": "FLD-042",
  "records": [
    {
      "treeId": "HRV-2024-0001",
      "species": "Teak",
      "status": "alive",
      "heightCm": 180,
      "healthScore": 90,
      "cause": null,
      "notes": "Healthy canopy growth"
    },
    {
      "treeId": "HRV-2024-0002",
      "species": "Mangrove",
      "status": "dead",
      "heightCm": 60,
      "healthScore": 0,
      "cause": "pest_damage",
      "notes": "Crab damage"
    }
  ]
}
```

#### Request Body (CSV format example):
```csv
tree_id,species,status,height_cm,health_score,cause,notes
HRV-2024-0001,Teak,alive,180,90,,Healthy vigorous canopy growth
HRV-2024-0002,Mangrove,dead,60,0,pest_damage,Crab damage to lower stem
```

#### Response (201 Created):
```json
{
  "success": true,
  "message": "Successfully processed annual census for 2 trees. Survival rate updated to 50%.",
  "submission": {
    "id": "census-1729600000000-abc12",
    "projectId": "proj-001",
    "projectName": "Northern Savanna Reforestation",
    "censusYear": 2026,
    "surveyorName": "Field Officer Ibrahim",
    "surveyorAgentId": "FLD-042",
    "submittedAt": "2026-10-22T15:30:00.000Z",
    "totalTreesCounted": 2,
    "aliveCount": 1,
    "deadCount": 1,
    "survivalRate": 50,
    "averageHeightCm": 120,
    "averageHealthScore": 45,
    "healthDistribution": {
      "thriving": 1,
      "moderate": 0,
      "critical": 0,
      "dead": 1
    },
    "speciesBreakdown": [
      {
        "species": "Teak",
        "total": 1,
        "alive": 1,
        "dead": 0,
        "survivalRate": 100,
        "avgHeightCm": 180,
        "avgHealthScore": 90
      },
      {
        "species": "Mangrove",
        "total": 1,
        "alive": 0,
        "dead": 1,
        "survivalRate": 0,
        "avgHeightCm": 60,
        "avgHealthScore": 0
      }
    ]
  }
}
```

---

### 2. Retrieve Project Census Stats
`GET /api/v1/census/stats?projectId=proj-001` (or `/api/census/stats?projectId=proj-001`)

#### Response (200 OK):
```json
{
  "stats": {
    "projectId": "proj-001",
    "projectName": "Northern Savanna Reforestation",
    "latestCensusYear": 2026,
    "totalCensusSubmissions": 1,
    "currentSurvivalRate": 50,
    "historicalSurvivalRates": [
      {
        "year": 2026,
        "survivalRate": 50,
        "totalTreesCounted": 2
      }
    ],
    "averageHealthScore": 45,
    "averageHeightCm": 120,
    "lastUpdated": "2026-10-22T15:30:00.000Z"
  },
  "submissions": [
    {
      "id": "census-1729600000000-abc12",
      "censusYear": 2026,
      "totalTreesCounted": 2,
      "survivalRate": 50,
      "averageHealthScore": 45,
      "averageHeightCm": 120,
      "submittedAt": "2026-10-22T15:30:00.000Z"
    }
  ]
}
```

---

## Validation Rules & CSV Specifications
- Maximum batch size: **10,000 rows**.
- Header requirement: `tree_id` (or `treeid`, `id`) is mandatory.
- `status`: Allowed values are `alive`, `dead`, `0` (dead), `false` (dead).
- Dead trees automatically have their `healthScore` set to `0`.
- Heights must be non-negative numbers.
- Health scores must be between 0 and 100.

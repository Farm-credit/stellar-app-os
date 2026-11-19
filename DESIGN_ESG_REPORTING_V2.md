# ESG Reporting v2 - Design Document (Issue #1407)

## Overview
Extend existing ESG disclosure system (v1, Issue #1317) with a dedicated buyer-facing compliance report view featuring three data sections, time-period selection, and structured PDF/Excel exports.

## Architecture Changes

### Data Models (lib/esg-reporting-v2.ts)
New types for v2 report generation:

```
BuyerComplianceReport
├─ reportId: string
├─ generatedAt: string
├─ buyerId: string
├─ companyName: string
├─ period: { start: Date; end: Date; label: string } // "Q1 2026" or "Jan 2026"
├─ sections: ReportSection[]
│  ├─ carbonOffsets: CarbonOffsetsSection
│  │  ├─ totalTonnes: number
│  │  ├─ totalCostUsd: number
│  │  ├─ purchaseCount: number
│  │  ├─ lineItems: OffsetLineItem[] // per project
│  │  ├─ activeTonnes: number
│  │  └─ retiredTonnes: number
│  ├─ coBenefits: CoBenefitsSection
│  │  ├─ benefits: CoBenefitLine[] // name, projectCount, tonnes, %
│  │  └─ topBenefits: CoBenefitLine[] // top 5 by tonnes
│  └─ supplyChain: SupplyChainSection
│     ├─ projectCount: number
│     ├─ avgDaysToRetirement: number
│     ├─ retirementRate: number (%)
│     └─ projects: SupplyChainProject[] // from buyer-analytics
└─ disclaimers: string[] // No framework compliance claims

OffsetLineItem
├─ projectId: string
├─ projectName: string
├─ tonnes: number
├─ costUsd: number
├─ costPerTonUsd: number
├─ purchaseDate: string (ISO)
├─ status: 'active' | 'retired'
├─ retirementDate?: string (ISO)
└─ verification: string (e.g., 'Verra (VCS)', 'Gold Standard')
```

### API Endpoint (app/api/v2/buyer-esg-report/route.ts)

**GET /api/v2/buyer-esg-report**

Query params:
- `buyerId` (required): opaque buyer identifier
- `account` (optional): Stellar public key
- `from` (optional): ISO date, start of period
- `to` (optional): ISO date, end of period
- `interval` (optional): 'month' | 'quarter' (default: 'month')
- `format` (optional): 'json' | 'pdf' | 'xlsx' (default: 'json')

Response (JSON):
```
{
  "report": BuyerComplianceReport,
  "generated": "2026-09-01T14:30:00Z",
  "disclaimer": "This report shows your carbon offset purchases. No compliance standard (GHG Protocol, ISSB, CSRD) has been validated for this report."
}
```

If `format=pdf` or `format=xlsx`, returns binary with appropriate Content-Type.

### Frontend Pages & Components

**New Route: app/buyer-compliance-report/**

Two pages:
1. **page.tsx** - Buyer entry form
   - Buyer ID input
   - Period selection (start/end dates or preset buttons: "This Month", "This Quarter", "YTD", "Custom")
   - "Generate Report" button
   - Links to existing /esg-disclosure tool

2. **[reportId]/page.tsx** - Report detail view
   - Header: Company name, report ID, period, generated date
   - Three-section layout:
     * Carbon Offset Purchases (with table, totals, metrics)
     * Co-Benefits Achieved (bar chart concept, but start with list)
     * Supply Chain Impact (status timeline per project)
   - Export buttons (PDF, Excel)
   - Notes/disclaimers about data freshness and no compliance claims

**New Components: src/components/esg-report-v2/**
- `BuyerReportForm.tsx` - Buyer ID entry + period selection
- `CarbonOffsetsSection.tsx` - Offset purchases with table
- `CoBenefitsSection.tsx` - Co-benefits list + aggregates
- `SupplyChainSection.tsx` - Per-project chain of custody
- `ReportHeader.tsx` - Metadata (company, period, generated date)
- `ExportButtons.tsx` - PDF/Excel download triggers

### Export Utilities

**lib/esg-reporting/pdf-export-v2.ts**
- `generateBuyerComplianceReportPdf(report, options)` → Uint8Array
- Extends existing jsPDF patterns from lib/corporate.ts and lib/gift/giftCertificatePdf.ts
- Three sections with clear headers, data tables, totals
- Disclaimer footer

**lib/esg-reporting/excel-export-v2.ts** (NEW)
- `generateBuyerComplianceReportExcel(report, options)` → Uint8Array
- Uses xlsx library (to be added to package.json)
- Multiple sheets:
  * **Summary** - Totals, key metrics, period, company
  * **Carbon Offsets** - Line-by-line purchases (project, tonnes, cost, status, dates)
  * **Co-Benefits** - Benefit summaries (name, project count, tonnes, % of total)
  * **Supply Chain** - Per-project chain of custody (project, stage, status, detail)
  * **Disclaimer** - Data freshness note, no framework compliance claims

### Time Period Handling

Use buyer-analytics request filters:
- `from` and `to` (ISO date strings) map to start/end of period
- `interval` ('month' | 'quarter') for trend bucketing in analytics
- Frontend presets:
  * "This Month" → start of current month to today
  * "This Quarter" → start of current quarter to today
  * "YTD" → Jan 1 of current year to today
  * "Custom" → date picker

### Compliance Framework Decision

**No specific framework claimed** in this v2 (as instructed for issue #1407):
- Report title: "ESG Compliance Report" (generic, not tied to GHG Protocol, ISSB, CSRD)
- Exported documents include disclaimer: 
  > "This report aggregates your carbon offset purchases and verified co-benefits from partner projects. It is not validated against any specific compliance standard (GHG Protocol, ISSB, CSRD). For compliance attestation, consult your carbon verification partner."
- No "Scope 1/2/3" or "GHG Protocol verified" language

### Data Gaps & Decisions

**Gap 1: Co-benefits data**
- ✅ SOLVED: mockCarbonProjects already has coBenefits array
- buildCoBenefits aggregates by benefit name, project count, tonnes
- v2 displays top 5 + full list view

**Gap 2: Supply chain impact**
- ✅ SOLVED: BuyerAnalyticsSummary.supplyChain already has SupplyChainProject[] with stages[]
- Each stage (origination → verification → issuance → purchase → retirement) has status + detail
- v2 shows chain of custody per project

**Gap 3: Period selection**
- ✅ buyer-analytics already supports from/to filters
- Frontend form converts preset/custom selections to ISO dates
- API passes through to aggregateBuyerAnalytics

### v1 vs v2 Summary

| Feature | v1 (/esg-disclosure) | v2 (/buyer-compliance-report) |
|---------|-----|-----|
| Data input | Manual form entry | Auto-loaded from buyer ID |
| Period selection | Single text field | Date range picker + presets |
| Carbon offsets | Manual text area | Real purchase data, table format |
| Co-benefits | Not shown | Aggregated from projects, top 5 + full |
| Supply chain | Not shown | Per-project chain of custody with status |
| PDF export | ✅ jsPDF | ✅ jsPDF, improved layout |
| Excel export | ❌ | ✅ Multi-sheet structured export |
| Compliance framework | Generic title | Generic + explicit disclaimer |
| Share links | ✅ (URL params) | Share report ID link |

### Implementation Order

1. ✅ Task 1: Analyze existing code
2. ✅ Task 2: Design (this doc)
3. Task 3: Extend lib/esg-disclosure.ts with new types and helpers
4. Task 4: Add xlsx, create Excel export utility
5. Task 5: Create React components and page routes
6. Task 6: Create API endpoint
7. Task 7: Write tests
8. Task 8: CI verification
9. Task 9: PR submission

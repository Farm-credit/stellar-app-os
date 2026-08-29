# Compliance Report Generator

## Overview

The Compliance Report Generator provides scheduled export functionality for generating audit reports formatted for carbon registry standards (Verra, Gold Standard, Climate Action Reserve, Plan Vivo, CDM). It supports both CSV and JSON output formats.

## Features

- **Multiple Report Types**: Carbon credits, project registry, tree inventory, verification audits, issuance reports, retirement reports
- **Multiple Registries**: Verra (VCS), Gold Standard (GS), Climate Action Reserve (CAR), Plan Vivo, CDM, Generic
- **Multiple Formats**: CSV, JSON, or both
- **Flexible Filtering**: By project, sponsor, species, region, status, CO2 offset range, date range
- **Scheduled Exports**: Cron-based scheduled report generation
- **Webhook Notifications**: Optional webhook callbacks on export completion
- **Email Notifications**: Optional email notifications
- **File Retention**: Automatic cleanup of old export files

## Installation

The compliance report generator is included in the stellar-app-os monorepo. No additional installation required.

## API Endpoints

### GET /api/compliance/reports

Generate a compliance report on-demand.

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `type` | string | `carbon-credits` | Report type: `carbon-credits`, `project-registry`, `tree-inventory`, `verification-audit`, `issuance-report`, `retirement-report` |
| `format` | string | `json` | Output format: `csv`, `json`, `both` |
| `registry` | string | `verra` | Registry standard: `verra`, `gold-standard`, `car`, `plan-vivo`, `cdm`, `generic` |
| `startDate` | ISO 8601 | 30 days ago | Start date for filtering |
| `endDate` | ISO 8601 | now | End date for filtering |
| `projectIds` | comma-separated | - | Filter by project IDs |
| `sponsorAddresses` | comma-separated | - | Filter by sponsor addresses |
| `species` | comma-separated | - | Filter by tree species |
| `regions` | comma-separated | - | Filter by regions |
| `status` | comma-separated | - | Filter by tree status |
| `minCo2OffsetKg` | number | - | Minimum CO2 offset per tree (kg/year) |
| `maxCo2OffsetKg` | number | - | Maximum CO2 offset per tree (kg/year) |

**Response:**

- `format=csv`: Returns CSV file download
- `format=json`: Returns JSON with metadata and records
- `format=both`: Returns JSON with both CSV and JSON content

**Example:**

```bash
# Get carbon credits report in CSV format
curl "http://localhost:3000/api/compliance/reports?type=carbon-credits&format=csv&registry=verra&startDate=2024-01-01&endDate=2024-12-31"

# Get project registry report in JSON
curl "http://localhost:3000/api/compliance/reports?type=project-registry&format=json&registry=gold-standard"

# Get tree inventory with filters
curl "http://localhost:3000/api/compliance/reports?type=tree-inventory&format=json&species=Teak,Moringa&status=verified,planted"
```

### POST /api/compliance/reports

Generate a compliance report with complex filters via JSON body.

**Request Body:**

```json
{
  "type": "carbon-credits",
  "format": "json",
  "registry": "verra",
  "startDate": "2024-01-01T00:00:00Z",
  "endDate": "2024-12-31T23:59:59Z",
  "filters": {
    "projectIds": ["tree-001", "tree-002"],
    "sponsorAddresses": ["GTEST123..."],
    "status": ["verified"],
    "species": ["Teak"],
    "regions": ["Kano, Nigeria"],
    "minCo2OffsetKg": 10,
    "maxCo2OffsetKg": 30
  }
}
```

## Scheduled Exports

### CLI Usage

Run a one-time export:

```bash
npm run compliance:export:dry-run
```

Start the scheduled export daemon:

```bash
npm run compliance:export
```

### CLI Options

| Option | Short | Default | Description |
|--------|-------|---------|-------------|
| `--type` | `-t` | `carbon-credits` | Report type |
| `--format` | `-f` | `csv` | Output format: `csv`, `json`, `both` |
| `--registry` | `-r` | `verra` | Registry standard |
| `--output` | `-o` | `./exports/compliance` | Output directory |
| `--cron` | `-c` | `0 2 * * *` | Cron expression for scheduling |
| `--webhook` | `-w` | - | Webhook URL for notifications |
| `--email` | `-e` | - | Comma-separated email addresses |
| `--retention` | `-d` | `90` | Retention days for export files |
| `--dry-run` | | `false` | Run once without scheduling |

**Example:**

```bash
# Run scheduled export every day at 2 AM
npm run compliance:export -- --cron "0 2 * * *" --format both --registry verra --output ./exports/compliance --webhook https://my-webhook.com/compliance --email admin@example.com

# Run one-time export
npm run compliance:export:dry-run -- --type project-registry --format json --registry gold-standard
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `COMPLIANCE_EXPORT_ENABLED` | `false` | Enable scheduled exports |
| `COMPLIANCE_EXPORT_CRON` | `0 2 * * *` | Cron expression for scheduled exports |
| `COMPLIANCE_EXPORT_TYPE` | `carbon-credits` | Default report type |
| `COMPLIANCE_EXPORT_FORMAT` | `csv` | Default output format |
| `COMPLIANCE_EXPORT_REGISTRY` | `verra` | Default registry |
| `COMPLIANCE_EXPORT_OUTPUT_PATH` | `./exports/compliance` | Output directory |
| `COMPLIANCE_EXPORT_WEBHOOK_URL` | - | Webhook URL for notifications |
| `COMPLIANCE_EXPORT_EMAIL_RECIPIENTS` | - | Comma-separated email addresses |
| `COMPLIANCE_EXPORT_RETENTION_DAYS` | `90` | File retention period |

### Configuration Example (.env)

```bash
# Enable scheduled compliance exports
COMPLIANCE_EXPORT_ENABLED=true
COMPLIANCE_EXPORT_CRON="0 2 * * *"
COMPLIANCE_EXPORT_TYPE=carbon-credits
COMPLIANCE_EXPORT_FORMAT=csv
COMPLIANCE_EXPORT_REGISTRY=verra
COMPLIANCE_EXPORT_OUTPUT_PATH=./exports/compliance
COMPLIANCE_EXPORT_WEBHOOK_URL=https://my-webhook.com/compliance
COMPLIANCE_EXPORT_EMAIL_RECIPIENTS=admin@example.com,compliance@example.com
COMPLIANCE_EXPORT_RETENTION_DAYS=90
```

## Report Schemas

### Carbon Credits Report

| Field | Type | Description |
|-------|------|-------------|
| `creditId` | string | Unique credit identifier |
| `projectId` | string | Project identifier |
| `projectName` | string | Project name |
| `registry` | string | Registry standard |
| `vintageYear` | number | Vintage year |
| `quantityTonnes` | number | Quantity in tonnes CO2e |
| `serialNumber` | string | Serial number range |
| `issuanceDate` | ISO 8601 | Issuance date |
| `retirementDate` | ISO 8601 | Retirement date (if retired) |
| `retirementReason` | string | Reason for retirement |
| `status` | string | `issued`, `pending`, `retired`, `cancelled` |
| `sponsorAddress` | string | Sponsor Stellar address |
| `coBenefits` | string[] | Co-benefits list |

### Project Registry Report

| Field | Type | Description |
|-------|------|-------------|
| `projectId` | string | Project identifier |
| `projectName` | string | Project name |
| `registry` | string | Registry standard |
| `projectType` | string | Project type (e.g., Reforestation) |
| `location` | object | Country, region, coordinates |
| `verificationStandard` | string | Verification standard |
| `validationDate` | ISO 8601 | Validation date |
| `verificationDate` | ISO 8601 | Verification date |
| `verifierName` | string | Verifier name |
| `totalAreaHectares` | number | Total project area |
| `estimatedAnnualCo2Tonnes` | number | Estimated annual CO2 |
| `status` | string | Project status |
| `sponsorAddress` | string | Sponsor address |

### Tree Inventory Report

| Field | Type | Description |
|-------|------|-------------|
| `treeId` | string | Tree identifier (HRV-...) |
| `projectId` | string | Project identifier |
| `projectName` | string | Project name |
| `species` | string | Tree species |
| `region` | string | Region/location |
| `coordinates` | object | Latitude, longitude |
| `plantedAt` | ISO 8601 | Planting date |
| `status` | string | Tree status |
| `co2OffsetKgPerYear` | number | Annual CO2 offset |
| `totalCo2OffsetKg` | number | Total CO2 offset |
| `verificationStatus` | string | Verification status |
| `sponsorAddress` | string | Sponsor address |
| `vintageYear` | number | Vintage year |

### Verification Audit Report

| Field | Type | Description |
|-------|------|-------------|
| `auditId` | string | Audit identifier |
| `projectId` | string | Project identifier |
| `projectName` | string | Project name |
| `auditorName` | string | Auditor name |
| `auditDate` | ISO 8601 | Audit date |
| `auditType` | string | `validation`, `verification`, `surveillance` |
| `standard` | string | Verification standard |
| `findings` | string[] | Audit findings |
| `nonConformities` | number | Number of non-conformities |
| `status` | string | `passed`, `failed`, `conditional` |
| `nextAuditDue` | ISO 8601 | Next audit due date |

## Webhook Payload

When a scheduled export completes, a webhook is sent:

```json
{
  "jobId": "export-job-1234567890",
  "status": "completed",
  "startedAt": "2024-01-15T02:00:00.000Z",
  "completedAt": "2024-01-15T02:00:05.123Z",
  "reportId": "compliance-carbon-credits-verra-1234567890",
  "filePath": "./exports/compliance/compliance-carbon-credits-verra-2024-01-14-to-2024-01-15.csv",
  "recordsExported": 150
}
```

On failure:

```json
{
  "jobId": "export-job-1234567890",
  "status": "failed",
  "startedAt": "2024-01-15T02:00:00.000Z",
  "completedAt": "2024-01-15T02:00:01.456Z",
  "error": "Failed to generate report: ..."
}
```

## Programmatic Usage

```typescript
import { getComplianceReportGenerator } from '@/lib/compliance/report-generator';

const generator = getComplianceReportGenerator({
  reportType: 'carbon-credits',
  format: 'json',
  registry: 'verra',
  outputPath: './exports/compliance',
  webhookUrl: 'https://my-webhook.com/compliance',
  emailRecipients: ['admin@example.com'],
  retentionDays: 90,
});

// Generate a one-time report
const report = await generator.generateReport(
  'carbon-credits',
  'json',
  'verra',
  { startDate: new Date('2024-01-01'), endDate: new Date('2024-12-31') },
  {
    projectIds: ['tree-001'],
    sponsorAddresses: ['GTEST123...'],
    species: ['Teak'],
    regions: ['Kano, Nigeria'],
    status: ['verified'],
    minCo2OffsetKg: 10,
    maxCo2OffsetKg: 30,
  }
);

console.log(report.metadata);
console.log(report.data);
console.log(report.jsonContent);

// Run scheduled export
const jobResult = await generator.runScheduledExport();
console.log(jobResult);

// Get job history
const history = generator.getJobHistory();
console.log(history);
```

## Testing

Run the compliance tests:

```bash
npm run test -- lib/compliance/__tests__
npm run test -- app/api/compliance/reports/__tests__
```

## Architecture

```
lib/compliance/
├── types.ts           # TypeScript interfaces and types
├── report-generator.ts # Main generator class
├── index.ts           # Public exports
└── __tests__/
    └── report-generator.test.ts # Unit tests

app/api/compliance/reports/
├── route.ts           # GET/POST API handlers
└── __tests__/
    └── route.test.ts  # API integration tests

scripts/
└── compliance-export.ts # CLI for scheduled exports
```

## Extending Report Types

To add a new report type:

1. Add the type to `ComplianceReportType` in `types.ts`
2. Add the record interface (e.g., `NewReportRecord`)
3. Add the `generateNewReportRecords` method in `report-generator.ts`
4. Add CSV header and row generation in `generateCSV` and `recordToCSVRow`
5. Add the case in `fetchReportData` switch statement
6. Update API documentation

## License

Part of stellar-app-os. See LICENSE for details.
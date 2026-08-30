/**
 * OpenAPI Contract Validation Reporter
 *
 * Generates detailed reports on API contract validation against OpenAPI specification.
 * Provides insights into compliance, failures, and recommendations.
 */

import path from 'path';
import fs from 'fs';
import { loadOpenAPISpec, validateResponse } from './openapi-validator';

export interface ValidationReport {
  timestamp: string;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  compliancePercentage: number;
  endpoints: EndpointReport[];
  summary: string;
}

export interface EndpointReport {
  path: string;
  method: string;
  operationId?: string;
  tests: TestResult[];
  status: 'pass' | 'fail' | 'partial';
}

export interface TestResult {
  name: string;
  status: 'pass' | 'fail';
  statusCode: number;
  errors?: string[];
  timestamp: string;
}

class ValidationReporter {
  private reports: ValidationReport[] = [];
  private currentReport: ValidationReport | null = null;
  private reportsDir: string;

  constructor() {
    this.reportsDir = path.resolve(process.cwd(), '__tests__', 'pact', 'reports');
    this.ensureReportsDir();
  }

  private ensureReportsDir(): void {
    if (!fs.existsSync(this.reportsDir)) {
      fs.mkdirSync(this.reportsDir, { recursive: true });
    }
  }

  /**
   * Starts a new validation report
   */
  startReport(): void {
    this.currentReport = {
      timestamp: new Date().toISOString(),
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
      compliancePercentage: 0,
      endpoints: [],
      summary: 'Validation report started',
    };
  }

  /**
   * Adds a test result to the current report
   */
  addTestResult(
    path: string,
    method: string,
    testName: string,
    result: TestResult,
    operationId?: string
  ): void {
    if (!this.currentReport) {
      console.warn('No active report. Call startReport() first.');
      return;
    }

    let endpointReport = this.currentReport.endpoints.find(
      (e) => e.path === path && e.method === method.toUpperCase()
    );

    if (!endpointReport) {
      endpointReport = {
        path,
        method: method.toUpperCase(),
        operationId,
        tests: [],
        status: 'pass',
      };
      this.currentReport.endpoints.push(endpointReport);
    }

    endpointReport.tests.push(result);
    this.currentReport.totalTests++;

    if (result.status === 'pass') {
      this.currentReport.passedTests++;
    } else {
      this.currentReport.failedTests++;
      endpointReport.status = 'fail';
    }

    // Update compliance percentage
    this.currentReport.compliancePercentage = Math.round(
      (this.currentReport.passedTests / this.currentReport.totalTests) * 100
    );
  }

  /**
   * Completes and saves the current report
   */
  finishReport(): ValidationReport | null {
    if (!this.currentReport) {
      console.warn('No active report to finish.');
      return null;
    }

    // Generate summary
    this.currentReport.summary = this.generateSummary(this.currentReport);

    // Save report
    this.saveReport(this.currentReport);

    const report = this.currentReport;
    this.currentReport = null;
    this.reports.push(report);

    return report;
  }

  private generateSummary(report: ValidationReport): string {
    const compliance = `${report.compliancePercentage}%`;
    const details = `${report.passedTests}/${report.totalTests} tests passed`;
    const status = report.failedTests === 0 ? '✓ All tests passed' : `✗ ${report.failedTests} test(s) failed`;

    return `${status} - Compliance: ${compliance} (${details})`;
  }

  private saveReport(report: ValidationReport): void {
    const filename = `validation-report-${Date.now()}.json`;
    const filepath = path.join(this.reportsDir, filename);

    fs.writeFileSync(filepath, JSON.stringify(report, null, 2));
    console.log(`✓ Validation report saved to ${filepath}`);
  }

  /**
   * Generates an HTML report for visual inspection
   */
  generateHTMLReport(report: ValidationReport): string {
    const statusColor = report.failedTests === 0 ? 'green' : 'red';
    const html = `
<!DOCTYPE html>
<html>
<head>
  <title>API Contract Validation Report</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 20px; }
    .header { background: #f5f5f5; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
    .summary { display: flex; gap: 20px; margin-bottom: 20px; }
    .metric { background: #f0f0f0; padding: 15px; border-radius: 8px; flex: 1; }
    .metric-value { font-size: 2em; font-weight: bold; color: #333; }
    .metric-label { font-size: 0.9em; color: #666; margin-top: 5px; }
    .endpoint { background: #f9f9f9; border-left: 4px solid #ddd; padding: 15px; margin-bottom: 15px; border-radius: 4px; }
    .endpoint.pass { border-left-color: #4caf50; }
    .endpoint.fail { border-left-color: #f44336; }
    .method { display: inline-block; padding: 3px 10px; border-radius: 3px; font-weight: bold; margin-right: 10px; font-size: 0.9em; }
    .method.GET { background: #e3f2fd; color: #1976d2; }
    .method.POST { background: #f3e5f5; color: #7b1fa2; }
    .method.PUT { background: #fff3e0; color: #f57c00; }
    .method.DELETE { background: #ffebee; color: #c62828; }
    .test-list { margin-top: 10px; }
    .test-item { padding: 8px; margin: 5px 0; border-radius: 4px; font-size: 0.9em; }
    .test-item.pass { background: #c8e6c9; color: #2e7d32; }
    .test-item.fail { background: #ffcdd2; color: #c62828; }
    .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 0.9em; color: #666; }
    .compliance-bar { height: 20px; background: #e0e0e0; border-radius: 10px; overflow: hidden; margin-top: 10px; }
    .compliance-fill { height: 100%; background: ${statusColor}; width: ${report.compliancePercentage}%; }
  </style>
</head>
<body>
  <div class="header">
    <h1>API Contract Validation Report</h1>
    <p>Generated: ${new Date(report.timestamp).toLocaleString()}</p>
  </div>

  <div class="summary">
    <div class="metric">
      <div class="metric-value">${report.compliancePercentage}%</div>
      <div class="metric-label">Compliance</div>
      <div class="compliance-bar">
        <div class="compliance-fill"></div>
      </div>
    </div>
    <div class="metric">
      <div class="metric-value">${report.totalTests}</div>
      <div class="metric-label">Total Tests</div>
    </div>
    <div class="metric">
      <div class="metric-value" style="color: #4caf50;">${report.passedTests}</div>
      <div class="metric-label">Passed</div>
    </div>
    <div class="metric">
      <div class="metric-value" style="color: #f44336;">${report.failedTests}</div>
      <div class="metric-label">Failed</div>
    </div>
  </div>

  <h2>Endpoints</h2>
  ${report.endpoints.map((endpoint) => `
    <div class="endpoint ${endpoint.status}">
      <div>
        <span class="method ${endpoint.method}">${endpoint.method}</span>
        <strong>${endpoint.path}</strong>
        ${endpoint.operationId ? `<span style="color: #999; margin-left: 10px;">${endpoint.operationId}</span>` : ''}
      </div>
      <div class="test-list">
        ${endpoint.tests.map((test) => `
          <div class="test-item ${test.status}">
            ${test.status === 'pass' ? '✓' : '✗'} ${test.name}
            ${test.errors ? `<div style="margin-top: 5px; font-size: 0.9em;">${test.errors.join('; ')}</div>` : ''}
          </div>
        `).join('')}
      </div>
    </div>
  `).join('')}

  <div class="footer">
    <p>${report.summary}</p>
  </div>
</body>
</html>
    `;

    return html;
  }

  /**
   * Saves HTML report
   */
  saveHTMLReport(report: ValidationReport): void {
    const html = this.generateHTMLReport(report);
    const filename = `validation-report-${Date.now()}.html`;
    const filepath = path.join(this.reportsDir, filename);

    fs.writeFileSync(filepath, html);
    console.log(`✓ HTML report saved to ${filepath}`);
  }

  /**
   * Gets all reports
   */
  getReports(): ValidationReport[] {
    return this.reports;
  }

  /**
   * Gets the latest report
   */
  getLatestReport(): ValidationReport | null {
    return this.reports[this.reports.length - 1] || null;
  }
}

export const reporter = new ValidationReporter();

'use client';

import { Download } from 'lucide-react';
import { useState } from 'react';
import type { BuyerComplianceReport } from '@/lib/esg-reporting-v2';
import { generateBuyerComplianceReportPdf, getPdfFilename } from '@/lib/esg-reporting/pdf-export-v2';
import { generateBuyerComplianceReportExcel, getExcelFilename } from '@/lib/esg-reporting/excel-export-v2';

interface ExportButtonsProps {
  report: BuyerComplianceReport;
}

export function ExportButtons({ report }: ExportButtonsProps) {
  const [isExporting, setIsExporting] = useState<'pdf' | 'excel' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleExportPdf = async () => {
    setIsExporting('pdf');
    setError(null);
    try {
      const pdfBytes = generateBuyerComplianceReportPdf(report);
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = getPdfFilename(report);
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export PDF');
    } finally {
      setIsExporting(null);
    }
  };

  const handleExportExcel = async () => {
    setIsExporting('excel');
    setError(null);
    try {
      const excelBytes = generateBuyerComplianceReportExcel(report);
      const blob = new Blob([excelBytes], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = getExcelFilename(report);
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export Excel');
    } finally {
      setIsExporting(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        <button
          onClick={handleExportPdf}
          disabled={isExporting !== null}
          className="inline-flex items-center gap-2 rounded-lg bg-stellar-blue px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          <Download className="h-4 w-4" />
          {isExporting === 'pdf' ? 'Exporting PDF...' : 'Export PDF'}
        </button>
        <button
          onClick={handleExportExcel}
          disabled={isExporting !== null}
          className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-60"
        >
          <Download className="h-4 w-4" />
          {isExporting === 'excel' ? 'Exporting Excel...' : 'Export Excel'}
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

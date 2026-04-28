import jsPDF from 'jspdf';

export interface CorporateBranding {
  companyName: string;
  logoUrl?: string;
  primaryColor?: string;
}

export interface EsgReportData {
  companyName: string;
  totalTrees: number;
  totalCo2Offset: number;
  projectsSupported: string[];
  period: string;
  reportId: string;
}

export function generateEsgReport(data: EsgReportData): void {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  
  // Header
  doc.setFillColor(13, 11, 33); // Stellar Navy
  doc.rect(0, 0, pageWidth, 40, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.text('ESG IMPACT REPORT', pageWidth / 2, 25, { align: 'center' });
  
  // Content
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(12);
  let y = 55;
  
  doc.setFont('helvetica', 'bold');
  doc.text('Organization:', 20, y);
  doc.setFont('helvetica', 'normal');
  doc.text(data.companyName, 60, y);
  
  y += 10;
  doc.setFont('helvetica', 'bold');
  doc.text('Reporting Period:', 20, y);
  doc.setFont('helvetica', 'normal');
  doc.text(data.period, 60, y);
  
  y += 20;
  doc.setFontSize(16);
  doc.setTextColor(20, 182, 231); // Stellar Blue
  doc.text('Cumulative Impact Metrics', 20, y);
  
  y += 15;
  doc.setFillColor(241, 245, 249);
  doc.roundedRect(20, y, pageWidth - 40, 30, 3, 3, 'F');
  
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(12);
  doc.text('Total Trees Planted:', 30, y + 12);
  doc.setFontSize(14);
  doc.text(data.totalTrees.toLocaleString(), 120, y + 12);
  
  doc.setFontSize(12);
  doc.text('Total CO2 Sequestered:', 30, y + 22);
  doc.setFontSize(14);
  doc.text(`${data.totalCo2Offset.toLocaleString()} tCO2e`, 120, y + 22);
  
  y += 45;
  doc.setFontSize(16);
  doc.setTextColor(20, 182, 231);
  doc.text('Supported Restoration Projects', 20, y);
  
  y += 10;
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  data.projectsSupported.forEach((project, index) => {
    doc.text(`• ${project}`, 25, y + (index * 7));
  });
  
  // Footer
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text(`Report ID: ${data.reportId} | Verified via Stellar Blockchain`, pageWidth / 2, 280, { align: 'center' });
  
  doc.save(`esg-report-${data.companyName.replace(/\s+/g, '-').toLowerCase()}.pdf`);
}

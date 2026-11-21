/**
 * Types for B2B sponsor invoice generation (#1138)
 */

export type InvoiceCurrency = 'USD' | 'EUR' | 'GBP';

export type InvoiceStatus = 'draft' | 'issued' | 'paid' | 'overdue' | 'void';

export type PaymentTerms = 'net-7' | 'net-14' | 'net-30' | 'net-60' | 'due-on-receipt';

export interface InvoiceLineItem {
  /** Short description, e.g. "Tree Sponsorship – Teak (50 trees)" */
  description: string;
  /** Species common name, if applicable */
  species?: string;
  /** Region where planting occurs */
  region?: string;
  /** Unit cost in the invoice currency */
  unitPrice: number;
  quantity: number;
  /** Subtotal = unitPrice × quantity (no tax yet) */
  subtotal: number;
}

export interface InvoiceTaxLine {
  /** e.g. "VAT 20%", "GST 10%" */
  label: string;
  /** 0.20 = 20% */
  rate: number;
  /** Absolute tax amount in invoice currency */
  amount: number;
}

export interface InvoiceSponsor {
  companyName: string;
  contactName?: string;
  email: string;
  address?: string;
  taxId?: string; // VAT / EIN / GST number
}

export interface InvoiceIssuer {
  companyName: string;
  address: string;
  email: string;
  website?: string;
  taxId?: string;
}

export interface InvoiceGenerateRequest {
  /** Unique invoice reference, e.g. "INV-2026-0042" */
  invoiceNumber: string;
  issueDate: string; // ISO-8601
  paymentTerms: PaymentTerms;
  currency: InvoiceCurrency;
  sponsor: InvoiceSponsor;
  lineItems: InvoiceLineItem[];
  /** Optional tax lines applied after line-item subtotals */
  taxLines?: InvoiceTaxLine[];
  /** Free-form notes shown at the bottom of the invoice */
  notes?: string;
  /** Stellar transaction hash(es) backing this invoice */
  stellarTxHashes?: string[];
  /** If true, returns the PDF as base64 instead of binary */
  returnBase64?: boolean;
}

export interface InvoiceGenerateResponse {
  invoiceNumber: string;
  subtotal: number;
  taxTotal: number;
  grandTotal: number;
  currency: InvoiceCurrency;
  /** Populated when returnBase64 is true */
  base64Pdf?: string;
  /** Populated when returnBase64 is false (binary download) */
  pdfBytes?: Uint8Array;
  issuedAt: string; // ISO-8601
  dueDate: string; // ISO-8601
}

'use client';

import { useState, type FormEvent } from 'react';
import { AlertCircle, CheckCircle2, Loader2, Plus, Trash2, WalletCards } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export type FundingAsset = 'USDC' | 'XLM';
export interface FundingInstruction {
  id: string;
  asset: FundingAsset;
  amount: string;
  escrowAddress: string;
  memo: string;
}
export interface BatchFundingReceipt {
  batchId: string;
  transactionHashes: string[];
}

interface BatchWalletFundingModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onFund: (instructions: FundingInstruction[]) => Promise<BatchFundingReceipt>;
}

const EMPTY_ROW = (): FundingInstruction => ({
  id: `funding-${crypto.randomUUID()}`,
  asset: 'USDC',
  amount: '',
  escrowAddress: '',
  memo: '',
});

function validate(rows: FundingInstruction[]): string | null {
  if (rows.length === 0) return 'Add at least one endowment funding transaction.';
  for (const [index, row] of rows.entries()) {
    if (!row.escrowAddress.trim()) return `Enter an escrow address for transaction ${index + 1}.`;
    if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(row.amount) || Number(row.amount) <= 0) {
      return `Enter a positive amount for transaction ${index + 1}.`;
    }
    if (row.memo.length > 28) return `Memo ${index + 1} is longer than Stellar's 28-character limit.`;
  }
  return null;
}

export function BatchWalletFundingModal({ isOpen, onOpenChange, onFund }: BatchWalletFundingModalProps) {
  const [rows, setRows] = useState<FundingInstruction[]>([EMPTY_ROW]);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<BatchFundingReceipt | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function updateRow(id: string, patch: Partial<FundingInstruction>) {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const validationError = validate(rows);
    if (validationError) {
      setError(validationError);
      return;
    }
    setIsSubmitting(true);
    try {
      setReceipt(await onFund(rows));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Funding failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  function close(open: boolean) {
    if (isSubmitting) return;
    if (!open) {
      setRows([EMPTY_ROW]);
      setError(null);
      setReceipt(null);
    }
    onOpenChange(open);
  }

  return (
    <Dialog open={isOpen} onOpenChange={close}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><WalletCards className="h-5 w-5 text-emerald-700" /> Batch wallet funding</DialogTitle>
          <DialogDescription>
            Prepare separate USDC or XLM deposits for corporate endowment escrows. Each memo is
            retained with its transaction so finance teams can reconcile the batch.
          </DialogDescription>
        </DialogHeader>
        {receipt ? (
          <div className="space-y-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4" role="status">
            <CheckCircle2 className="h-7 w-7 text-emerald-700" aria-hidden="true" />
            <h3 className="font-semibold text-emerald-900">Funding batch submitted</h3>
            <p className="text-sm text-emerald-800">Batch {receipt.batchId} contains {receipt.transactionHashes.length} transaction(s).</p>
            <button type="button" className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white" onClick={() => close(false)}>Done</button>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={submit}>
            <div className="space-y-3" aria-label="Funding transactions">
              {rows.map((row, index) => (
                <div key={row.id} className="grid gap-3 rounded-lg border border-gray-200 p-3 md:grid-cols-[100px_1fr_1.5fr_1fr_auto]">
                  <label className="text-sm font-medium">Asset
                    <select aria-label={`Asset ${index + 1}`} value={row.asset} onChange={(event) => updateRow(row.id, { asset: event.target.value as FundingAsset })} className="mt-1 w-full rounded border p-2">
                      <option value="USDC">USDC</option><option value="XLM">XLM</option>
                    </select>
                  </label>
                  <label className="text-sm font-medium">Amount
                    <input aria-label={`Amount ${index + 1}`} inputMode="decimal" value={row.amount} onChange={(event) => updateRow(row.id, { amount: event.target.value })} className="mt-1 w-full rounded border p-2" placeholder="0.00" />
                  </label>
                  <label className="text-sm font-medium">Escrow address
                    <input aria-label={`Escrow address ${index + 1}`} value={row.escrowAddress} onChange={(event) => updateRow(row.id, { escrowAddress: event.target.value })} className="mt-1 w-full rounded border p-2 font-mono text-xs" placeholder="G... or C..." />
                  </label>
                  <label className="text-sm font-medium">Memo <span className="font-normal text-gray-500">({row.memo.length}/28)</span>
                    <input aria-label={`Memo ${index + 1}`} maxLength={28} value={row.memo} onChange={(event) => updateRow(row.id, { memo: event.target.value })} className="mt-1 w-full rounded border p-2" placeholder="Campaign reference" />
                  </label>
                  <button type="button" aria-label={`Remove transaction ${index + 1}`} disabled={rows.length === 1} onClick={() => setRows((current) => current.filter((candidate) => candidate.id !== row.id))} className="self-end rounded p-2 text-gray-500 hover:bg-gray-100 disabled:opacity-30"><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
            </div>
            {error && <div role="alert" className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
            <div className="flex flex-wrap justify-between gap-2">
              <button type="button" onClick={() => setRows((current) => [...current, EMPTY_ROW()])} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium"><Plus className="h-4 w-4" />Add transaction</button>
              <button type="submit" disabled={isSubmitting} className="inline-flex items-center gap-2 rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}{isSubmitting ? 'Submitting…' : 'Fund endowments'}</button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

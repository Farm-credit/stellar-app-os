'use client';

/**
 * TransactionHistoryModal — accessible dialog wrapper around the canonical
 * `TransactionHistory` organism. Built on the shadcn `Dialog` (radix) so it gets a
 * focus trap, ESC-to-close, scroll-lock, and proper ARIA wiring for free, and it
 * respects dark mode (unlike the legacy `components/ui/Modal`).
 */

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { TransactionHistory } from '@/components/organisms/TransactionHistory/TransactionHistory';

export interface TransactionHistoryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TransactionHistoryModal({ open, onOpenChange }: TransactionHistoryModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl gap-0 overflow-hidden rounded-3xl border-none bg-card/95 p-0 shadow-xl backdrop-blur-sm sm:max-w-2xl">
        <DialogHeader className="px-6 pt-6 pb-2 text-left">
          <DialogTitle className="text-2xl font-black tracking-tight">
            Transaction History
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground/70">
            Your recent on-chain activity, including Soroban contract calls.
          </DialogDescription>
        </DialogHeader>

        {/* Scrollable body: the organism renders its own card, so strip its outer
            padding visual weight by letting it size to content within the scroll area. */}
        <div className="max-h-[70vh] overflow-y-auto px-3 pb-4 sm:px-4">
          <TransactionHistory />
        </div>
      </DialogContent>
    </Dialog>
  );
}

TransactionHistoryModal.displayName = 'TransactionHistoryModal';

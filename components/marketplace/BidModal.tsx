'use client';

interface BidModalProps {
  isOpen: boolean;
  onClose: () => void;
  listingId: string;
  projectName: string;
  quantity: number;
  currentHighestBid: number;
  reservePrice: number;
  endTime: string | number | Date;
}

export function BidModal({
  isOpen,
  onClose,
  projectName,
  currentHighestBid,
  reservePrice,
}: BidModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-background p-6 shadow-xl">
        <h2 className="text-lg font-semibold">Place a bid</h2>
        <p className="mt-2 text-sm text-muted-foreground">{projectName}</p>
        <p className="mt-4 text-sm">
          Reserve price: {reservePrice.toLocaleString()} &middot; Highest bid:{' '}
          {currentHighestBid.toLocaleString()}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="mt-6 w-full rounded-lg bg-primary px-4 py-2 text-primary-foreground"
        >
          Close
        </button>
      </div>
    </div>
  );
}

import { Modal } from "./Modal";
import { TransactionHistory } from "./TransactionHistory";

interface TXModalProps {
  open: boolean;
  onClose: () => void;
}

export function TransactionHistoryModal({ open, onClose }: TXModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="Recent Transactions">
      <TransactionHistory />
    </Modal>
  );
}
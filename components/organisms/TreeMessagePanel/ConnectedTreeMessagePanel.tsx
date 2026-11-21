'use client';

import { useWalletContext } from '@/contexts/WalletContext';
import { useAppTranslation } from '@/hooks/useTranslation';
import { TreeMessagePanel } from './TreeMessagePanel';

/** Wires the panel to the connected wallet and the interface language. */
export function ConnectedTreeMessagePanel({ treeId }: { treeId: string }) {
  const { wallet } = useWalletContext();
  const { language } = useAppTranslation();

  return (
    <TreeMessagePanel
      treeId={treeId}
      sponsorId={wallet?.isConnected ? wallet.publicKey : null}
      language={language}
    />
  );
}

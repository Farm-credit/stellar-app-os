'use client';

import { useWalletContext } from '@/contexts/WalletContext';
import { TreeHealthAlertToggle } from './TreeHealthAlertToggle';

export function ConnectedTreeHealthAlertToggle() {
  const { wallet } = useWalletContext();
  return <TreeHealthAlertToggle sponsorId={wallet?.isConnected ? wallet.publicKey : null} />;
}

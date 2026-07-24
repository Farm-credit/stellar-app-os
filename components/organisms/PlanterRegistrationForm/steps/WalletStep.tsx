'use client';

import { useEffect } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { WalletConnectionStep } from '@/components/organisms/WalletConnectionStep/WalletConnectionStep';
import type { PlanterRegistrationFormData } from '@/lib/schemas/planter-registration';
import type { WalletConnection } from '@/lib/types/wallet';

interface WalletStepProps {
  form: UseFormReturn<PlanterRegistrationFormData>;
  onNext: () => void;
}

/**
 * Step 1 — Connect Wallet
 *
 * Re-uses the existing WalletConnectionStep organism and wires the
 * connected wallet's public key into the registration form state.
 * Automatically advances when a wallet is successfully connected.
 */
export function WalletStep({ form, onNext }: WalletStepProps) {
  const handleConnectionChange = (connection: WalletConnection | null) => {
    if (connection?.isConnected && connection.publicKey) {
      form.setValue('walletPublicKey', connection.publicKey, { shouldValidate: true });
    } else {
      form.setValue('walletPublicKey', '', { shouldValidate: false });
    }
  };

  // Auto-advance once the key is validated in the form
  const walletPublicKey = form.watch('walletPublicKey');
  useEffect(() => {
    if (walletPublicKey && !form.formState.errors.walletPublicKey) {
      // Small delay so the user can see the "connected" state
      const timer = setTimeout(onNext, 800);
      return () => clearTimeout(timer);
    }
  }, [walletPublicKey, form.formState.errors.walletPublicKey, onNext]);

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <p className="text-muted-foreground text-sm max-w-sm mx-auto">
          Your wallet address will be your unique identity on the platform — it receives your carbon
          credit payments directly.
        </p>
      </div>

      <WalletConnectionStep
        onConnectionChange={handleConnectionChange}
        title="Connect Your Wallet"
        description="Connect a Stellar wallet to identify yourself as a planter and receive payments."
        connectedTitle="Wallet Connected ✓"
        connectedDescription="Your Stellar wallet is connected. Advancing to the next step…"
      />

      {form.formState.errors.walletPublicKey && (
        <p className="text-xs text-destructive text-center" role="alert">
          {form.formState.errors.walletPublicKey.message}
        </p>
      )}
    </div>
  );
}

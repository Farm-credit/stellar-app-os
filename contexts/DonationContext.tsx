'use client';

import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react';
import {
  type DonationFlowState,
  type DonorInfo,
  DEFAULT_DONATION_FLOW_STATE,
} from '@/lib/types/donor';

interface DonationContextValue {
  state: DonationFlowState;
  setAmount: (amount: number) => void; // eslint-disable-line no-unused-vars
  setIsMonthly: (isMonthly: boolean) => void; // eslint-disable-line no-unused-vars
  setDonorInfo: (info: Partial<DonorInfo>) => void; // eslint-disable-line no-unused-vars
  resetFlow: () => void;
}

const DonationContext = createContext<DonationContextValue | undefined>(undefined);

export function DonationProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DonationFlowState>({
    ...DEFAULT_DONATION_FLOW_STATE,
  });

  const setAmount = useCallback((amount: number) => {
    setState((prev) => ({ ...prev, amount }));
  }, []);

  const setIsMonthly = useCallback((isMonthly: boolean) => {
    setState((prev) => ({ ...prev, isMonthly }));
  }, []);

  const setDonorInfo = useCallback((info: Partial<DonorInfo>) => {
    setState((prev) => ({
      ...prev,
      donorInfo: { ...prev.donorInfo, ...info },
    }));
  }, []);

  const resetFlow = useCallback(() => {
    setState({ ...DEFAULT_DONATION_FLOW_STATE });
  }, []);

  const value = useMemo(
    () => ({ state, setAmount, setIsMonthly, setDonorInfo, resetFlow }),
    [state, setAmount, setIsMonthly, setDonorInfo, resetFlow]
  );

  return <DonationContext.Provider value={value}>{children}</DonationContext.Provider>;
}

export function useDonationContext(): DonationContextValue {
  const context = useContext(DonationContext);
  if (context === undefined) {
    throw new Error('useDonationContext must be used within a DonationProvider');
  }
  return context;
}

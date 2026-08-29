'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useDebounce } from '@/hooks/useDebounce';
import type { DonationAsset } from '@/lib/types/donation-payment';

export interface SwapQuote {
  outputAmount: number;
  exchangeRate: number;
  minimumReceived: number;
  slippageTolerance: number;
  priceImpact: number;
  loading: boolean;
  error: string | null;
}

export interface UseSwapQuoteParams {
  inputAsset: DonationAsset;
  inputAmount: number;
  slippageTolerance: number;
  enabled?: boolean;
}

const CARBON_CREDIT_PRICE_USD = 45.0;
const MOCK_RATES: Record<DonationAsset, number> = {
  USDC: 1.0,
  USDT: 1.0,
  EURC: 1.0,
  XLM: 0.15,
};

function validateSlippage(value: number): number {
  if (isNaN(value) || value < 0) return 0;
  if (value > 0.5) return 0.5;
  return value;
}

function calculateQuote(inputAmount: number, inputAsset: DonationAsset, slippage: number) {
  if (inputAmount <= 0) {
    return {
      outputAmount: 0,
      exchangeRate: 0,
      minimumReceived: 0,
      slippageTolerance: slippage,
      priceImpact: 0,
    };
  }

  const rate = MOCK_RATES[inputAsset];
  const usdValue =
    inputAsset === 'USDC' || inputAsset === 'USDT' ? inputAmount : inputAmount * rate;
  const outputAmount = usdValue / CARBON_CREDIT_PRICE_USD;
  const exchangeRate = outputAmount > 0 ? usdValue / outputAmount : 0;
  const minimumReceived = outputAmount * (1 - slippage);
  const priceImpact = Math.min(0.5, inputAmount * 0.001);

  return {
    outputAmount,
    exchangeRate,
    minimumReceived,
    slippageTolerance: slippage,
    priceImpact,
  };
}

export function useSwapQuote(params: UseSwapQuoteParams): SwapQuote {
  const { inputAsset, inputAmount, slippageTolerance, enabled = true } = params;
  const debouncedAmount = useDebounce(inputAmount, 300);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validatedSlippage = useMemo(() => validateSlippage(slippageTolerance), [slippageTolerance]);

  const quote = useMemo<SwapQuote>(() => {
    if (!enabled || debouncedAmount <= 0) {
      return {
        ...calculateQuote(0, inputAsset, validatedSlippage),
        loading: false,
        error: null,
      };
    }

    return {
      ...calculateQuote(debouncedAmount, inputAsset, validatedSlippage),
      loading,
      error,
    };
  }, [enabled, debouncedAmount, inputAsset, validatedSlippage, loading, error]);

  const fetchQuote = useCallback(async () => {
    if (!enabled || debouncedAmount <= 0) return;

    setLoading(true);
    setError(null);

    try {
      await new Promise((resolve) => setTimeout(resolve, 150));
      setLoading(false);
    } catch (_err) {
      setError('Failed to fetch quote. Please try again.');
      setLoading(false);
    }
  }, [enabled, debouncedAmount]);

  useEffect(() => {
    void fetchQuote();
  }, [fetchQuote]);

  return {
    ...quote,
    loading,
    error,
  };
}

export function useSlippageValidation() {
  const validate = useCallback((value: string): string => {
    const num = parseFloat(value);
    if (isNaN(num)) return 'Please enter a valid number';
    if (num < 0) return 'Slippage cannot be negative';
    if (num > 0.5) return 'Slippage cannot exceed 50%';
    return '';
  }, []);

  const presetValues = [0.005, 0.01, 0.02];

  return { validate, presetValues };
}

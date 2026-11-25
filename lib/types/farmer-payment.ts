/**
 * Shared public types for farmer multi-currency payment processing — Issue #1276
 *
 * Re-exports the core domain types from the payment engine so callers
 * import from one canonical location rather than the internal service file.
 */

export type {
  CryptoAsset,
  FiatCurrency,
  PayoutCurrency,
  PayoutChannel,
  PayoutStatus,
  PaymentAppProvider,
  BankTransferRail,
  CryptoWalletDetails,
  BankTransferDetails,
  PaymentAppDetails,
  PayoutDestination,
  PayoutQuoteRequest,
  PayoutQuote,
  InitiatePayoutRequest,
  FarmerPayoutRecord,
} from '@/lib/farmers/paymentProcessing';

export {
  BASE_EXCHANGE_RATES,
  CHANNEL_FEES_BPS,
  getSupportedPaymentChannels,
  calculatePayoutQuote,
  processFarmerPayout,
  getFarmerPayoutById,
  listFarmerPayouts,
} from '@/lib/farmers/paymentProcessing';

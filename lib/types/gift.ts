export type GiftRecipientType = 'wallet' | 'email';

export interface GiftDetails {
  isGift: boolean;
  recipientType: GiftRecipientType;
  recipientWallet: string;
  recipientEmail: string;
  personalMessage: string;
}

export const DEFAULT_GIFT_DETAILS: GiftDetails = {
  isGift: false,
  recipientType: 'wallet',
  recipientWallet: '',
  recipientEmail: '',
  personalMessage: '',
};

export function isValidStellarAddress(address: string): boolean {
  return /^G[A-Z2-7]{55}$/.test(address.trim());
}

export function isValidGiftDetails(details: GiftDetails): boolean {
  if (!details.isGift) return true;
  if (details.recipientType === 'wallet') {
    return isValidStellarAddress(details.recipientWallet);
  }
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(details.recipientEmail.trim());
}

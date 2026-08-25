'use client';

import { Gift, Mail, Wallet } from 'lucide-react';
import { Text } from '@/components/atoms/Text';
import { Input } from '@/components/atoms/Input';
import { Badge } from '@/components/atoms/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/molecules/Card';
import { GiftNftPreview } from '@/components/organisms/GiftNftPreview/GiftNftPreview';
import type { GiftDetails } from '@/lib/types/gift';

interface GiftTreeFormProps {
  treeCount: number;
  gift: GiftDetails;
  onChange: (_gift: GiftDetails) => void;
}

/** Gift sponsorship UI — recipient wallet/email, message, NFT preview (#536). */
export function GiftTreeForm({ treeCount, gift, onChange }: GiftTreeFormProps) {
  const update = (partial: Partial<GiftDetails>) => onChange({ ...gift, ...partial });

  return (
    <section aria-labelledby="gift-tree-heading" className="space-y-6">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#3E1BDB]/10">
          <Gift className="h-5 w-5 text-[#3E1BDB]" aria-hidden />
        </div>
        <div>
          <Text id="gift-tree-heading" variant="h2" className="text-xl font-bold">
            Gift a tree
          </Text>
          <Text variant="muted" className="mt-1">
            Send the TREE NFT receipt and carbon credits to someone special.
          </Text>
        </div>
      </div>

      <label className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl border p-4">
        <input
          type="checkbox"
          checked={gift.isGift}
          onChange={(e) => update({ isGift: e.target.checked })}
          className="h-5 w-5 accent-stellar-green"
        />
        <span className="font-medium">This sponsorship is a gift for someone else</span>
      </label>

      {gift.isGift && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => update({ recipientType: 'wallet' })}
              aria-pressed={gift.recipientType === 'wallet'}
              className={`flex min-h-[44px] items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition-colors ${
                gift.recipientType === 'wallet'
                  ? 'border-stellar-green bg-stellar-green/10 text-stellar-green'
                  : 'border-border hover:border-stellar-green/50'
              }`}
            >
              <Wallet className="h-4 w-4" aria-hidden />
              Stellar wallet
            </button>
            <button
              type="button"
              onClick={() => update({ recipientType: 'email' })}
              aria-pressed={gift.recipientType === 'email'}
              className={`flex min-h-[44px] items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition-colors ${
                gift.recipientType === 'email'
                  ? 'border-stellar-green bg-stellar-green/10 text-stellar-green'
                  : 'border-border hover:border-stellar-green/50'
              }`}
            >
              <Mail className="h-4 w-4" aria-hidden />
              Email invite
            </button>
          </div>

          {gift.recipientType === 'wallet' ? (
            <div>
              <label htmlFor="gift-wallet" className="mb-2 block text-sm font-medium">
                Recipient Stellar address
              </label>
              <Input
                id="gift-wallet"
                placeholder="G..."
                value={gift.recipientWallet}
                onChange={(e) => update({ recipientWallet: e.target.value })}
                className="min-h-[44px] font-mono text-sm"
              />
            </div>
          ) : (
            <div>
              <label htmlFor="gift-email" className="mb-2 block text-sm font-medium">
                Recipient email
              </label>
              <Input
                id="gift-email"
                type="email"
                placeholder="friend@example.com"
                value={gift.recipientEmail}
                onChange={(e) => update({ recipientEmail: e.target.value })}
                className="min-h-[44px]"
              />
            </div>
          )}

          <div>
            <label htmlFor="gift-message" className="mb-2 block text-sm font-medium">
              Personal message (optional)
            </label>
            <textarea
              id="gift-message"
              rows={3}
              maxLength={280}
              value={gift.personalMessage}
              onChange={(e) => update({ personalMessage: e.target.value })}
              placeholder="Happy birthday! A forest grows because of you."
              className="w-full min-h-[88px] rounded-xl border border-input bg-background px-3 py-2 text-sm"
            />
            <Text variant="muted" className="mt-1 text-xs">
              {gift.personalMessage.length}/280 characters
            </Text>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                Gift NFT preview
                <Badge variant="secondary">Preview</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <GiftNftPreview
                treeCount={treeCount}
                recipientLabel={
                  gift.recipientType === 'wallet'
                    ? gift.recipientWallet || 'Recipient wallet'
                    : gift.recipientEmail || 'Recipient email'
                }
                personalMessage={gift.personalMessage}
              />
            </CardContent>
          </Card>
        </div>
      )}
    </section>
  );
}

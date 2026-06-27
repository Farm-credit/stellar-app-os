'use client';

import { TreePine } from 'lucide-react';
import { Text } from '@/components/atoms/Text';
import { Badge } from '@/components/atoms/Badge';

interface GiftNftPreviewProps {
  treeCount: number;
  recipientLabel: string;
  personalMessage: string;
}

/** Visual preview of the gift TREE NFT receipt (#536). */
export function GiftNftPreview({
  treeCount,
  recipientLabel,
  personalMessage,
}: GiftNftPreviewProps) {
  return (
    <div
      className="overflow-hidden rounded-xl border bg-gradient-to-br from-[#0B1F3A] to-[#1a3a5c] p-5 text-white shadow-lg sm:p-6"
      role="img"
      aria-label={`Gift NFT preview for ${treeCount} trees`}
    >
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <TreePine className="h-5 w-5 text-[#00B36B]" aria-hidden />
          <span className="font-semibold">FarmCredit Gift Tree</span>
        </div>
        <Badge className="bg-[#00B36B] text-white">NFT</Badge>
      </div>

      <Text className="text-3xl font-bold sm:text-4xl">{treeCount}</Text>
      <Text className="text-sm text-white/80">
        {treeCount === 1 ? 'tree' : 'trees'} sponsored
      </Text>

      <div className="mt-5 space-y-2 rounded-lg bg-white/10 p-3 text-sm">
        <p>
          <span className="text-white/70">Recipient: </span>
          <span className="break-all font-medium">{recipientLabel}</span>
        </p>
        {personalMessage && (
          <p className="italic text-white/90">&ldquo;{personalMessage}&rdquo;</p>
        )}
      </div>

      <p className="mt-4 text-xs text-white/60">
        TREE tokens and carbon credits will be minted to the recipient after verification.
      </p>
    </div>
  );
}

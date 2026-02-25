'use client';

import { JSX, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ComparisonTool } from '@/components/organisms/ComparisonTool/ComparisonTool';
import { mockCarbonProjects } from '@/lib/api/mock/carbonProjects';
import { Text } from '@/components/atoms/Text';
import { useAppTranslation } from '@/hooks/useTranslation';

export default function ComparePage(): JSX.Element {
  const router = useRouter();
  const { t } = useAppTranslation();

  const handleAddToCart = useCallback(
    (projectId: string): void => {
      router.push(`/credits/purchase?projectId=${projectId}`);
    },
    [router],
  );

  return (
    <main className="container mx-auto px-4 py-8 max-w-7xl">
      <header className="mb-8">
        <Text variant="h2" as="h1" className="mb-2">
          {t('purchase.compareTitle')}
        </Text>
        <Text variant="muted" as="p">
          {t('purchase.compareSubtitle')}
        </Text>
      </header>

      <ComparisonTool projects={mockCarbonProjects} onAddToCart={handleAddToCart} />
    </main>
  );
}
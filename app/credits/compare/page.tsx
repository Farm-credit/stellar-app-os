'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ComparisonTool } from '@/components/organisms/ComparisonTool/ComparisonTool';
import { mockCarbonProjects } from '@/lib/api/mock/carbonProjects';
import { Text } from '@/components/atoms/Text';

export default function ComparePage() {
  const router = useRouter();

  const handleAddToCart = useCallback(
    (projectId: string) => {
      console.log('Adding project to cart:', projectId);
      router.push(`/credits/purchase?projectId=${projectId}`);
    },
    [router]
  );

  return (
    <main className="container mx-auto px-4 py-8 max-w-7xl">
      <header className="mb-8">
        <Text variant="h2" as="h1" className="mb-2">
          Compare Carbon Credit Projects
        </Text>
        <Text variant="muted" as="p">
          Select up to 3 projects to compare their features, pricing, and benefits side-by-side
        </Text>
      </header>

      <ComparisonTool projects={mockCarbonProjects} onAddToCart={handleAddToCart} />
    </main>
  );
}

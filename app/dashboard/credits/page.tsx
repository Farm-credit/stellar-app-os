'use client';

import { Text } from '@/components/atoms/Text';
import { Button } from '@/components/atoms/Button';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/molecules/Card';
import Link from 'next/link';

export default function DashboardCreditsPage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="space-y-6">
        <div>
          <Text variant="h2" as="h1" className="mb-2">
            My Carbon Credits
          </Text>
          <Text variant="muted" as="p">
            View and manage your carbon credit portfolio.
          </Text>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Portfolio</CardTitle>
            <CardDescription>Your carbon credit holdings will appear here.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8">
              <Text variant="muted" as="p" className="mb-4">
                This is a placeholder for the portfolio view.
              </Text>
              <Button asChild stellar="primary">
                <Link href="/credits/purchase">Buy More Credits</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

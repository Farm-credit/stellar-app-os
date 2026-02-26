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
import { DonationsTable } from '@/components/organisms/DonationsTable';
import Link from 'next/link';
import { Heart } from 'lucide-react';

export default function DonationsDashboardPage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="space-y-6">
        {/* Header */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Heart className="h-6 w-6 text-stellar-green" />
            <Text variant="h2" as="h1">
              My Donations
            </Text>
          </div>
          <Text variant="muted" as="p">
            View and track all your contributions to environmental projects.
          </Text>
        </div>

        {/* Main Card */}
        <Card>
          <CardHeader>
            <CardTitle>Donation History</CardTitle>
            <CardDescription>
              Complete record of your donations with export and certificate options.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DonationsTable />
          </CardContent>
        </Card>

        {/* CTA Section */}
        <Card className="bg-gradient-to-r from-stellar-blue/10 to-stellar-green/10 border-stellar-blue/20">
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <Text variant="h4" className="mb-1">
                  Make Your Impact
                </Text>
                <Text variant="muted" as="p">
                  Help us plant more trees and create a sustainable future.
                </Text>
              </div>
              <Button asChild stellar="success" className="whitespace-nowrap">
                <Link href="/credits/purchase">Donate Now</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

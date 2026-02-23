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

export default function OfflinePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 p-8 bg-stellar-navy">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-stellar-blue/10">
            <svg
              className="h-8 w-8 text-stellar-blue"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3m8.293 8.293l1.414 1.414"
              />
            </svg>
          </div>
          <CardTitle>You&apos;re Offline</CardTitle>
          <CardDescription>
            No internet connection detected. Some features may be limited.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Text variant="muted" className="text-sm text-center">
            FarmCredit works offline with cached data. Connect to the internet to access the latest
            information and perform transactions.
          </Text>
          <Button
            variant="default"
            size="lg"
            className="w-full"
            onClick={() => window.location.reload()}
          >
            Try Again
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="w-full"
            onClick={() => (window.location.href = '/')}
          >
            Go to Home
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

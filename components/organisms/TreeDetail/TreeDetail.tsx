'use client';

import Link from 'next/link';
import { ArrowLeft, Leaf, MapPin, TreePine, Wind } from 'lucide-react';
import { Text } from '@/components/atoms/Text';
import { TreeStatusBadge } from '@/components/molecules/TreeStatusBadge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/molecules/Card';
import type { Tree } from '@/lib/types/tree';

interface TreeDetailProps {
  tree: Tree;
}

function fmtDate(iso?: string) {
  if (!iso) return 'Not yet planted';
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** Tree detail view for sponsors and map click-through (#532, #533). */
export function TreeDetail({ tree }: TreeDetailProps) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:py-10">
      <Link
        href="/impact"
        className="mb-6 inline-flex min-h-[44px] items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to live map
      </Link>

      <header className="mb-6 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <TreePine className="h-6 w-6 text-stellar-green" aria-hidden />
          <Text variant="h2" as="h1" className="text-2xl sm:text-3xl">
            {tree.treeId}
          </Text>
          <TreeStatusBadge status={tree.status} />
        </div>
        <Text variant="muted" as="p">
          {tree.projectName}
        </Text>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Leaf className="h-4 w-4 text-stellar-green" aria-hidden />
              Species
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Text className="text-lg font-semibold">{tree.species}</Text>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Wind className="h-4 w-4 text-[#14B6E7]" aria-hidden />
              CO₂ offset
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Text className="text-lg font-semibold">{tree.co2OffsetKgPerYear} kg / year</Text>
          </CardContent>
        </Card>

        <Card className="sm:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <MapPin className="h-4 w-4 text-[#3E1BDB]" aria-hidden />
              Location
            </CardTitle>
            <CardDescription>Fuzzed coordinates — exact GPS is never shown.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            <Text>{tree.region}</Text>
            <Text variant="muted" className="text-sm">
              {tree.lat.toFixed(2)}°, {tree.lng.toFixed(2)}°
            </Text>
          </CardContent>
        </Card>

        <Card className="sm:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Planting timeline</CardTitle>
          </CardHeader>
          <CardContent>
            <Text>{fmtDate(tree.plantedAt)}</Text>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

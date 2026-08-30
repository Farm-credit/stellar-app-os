'use client';

import Link from 'next/link';
import Image from 'next/image';
import { MapPin, TreePine, Users, UserPlus, UserCheck, ArrowRight } from 'lucide-react';
import { Card, CardContent } from '@/components/molecules/Card';
import { Badge } from '@/components/atoms/Badge';
import { Text } from '@/components/atoms/Text';
import { cn } from '@/lib/utils';
import { usePlanterConnections } from '@/hooks/usePlanterConnections';
import type { PlanterProfile } from '@/lib/types/planter';

interface PlanterCardProps {
  planter: PlanterProfile;
  className?: string;
}

/**
 * Compact card used in the planter directory. Shows a photo, role, location,
 * headline stats and a connect toggle, and links through to the full profile.
 */
export function PlanterCard({ planter, className }: PlanterCardProps) {
  const { isConnected, toggleConnection } = usePlanterConnections();
  const connected = isConnected(planter.id);

  return (
    <Card
      className={cn(
        'group relative overflow-hidden rounded-2xl border-stellar-blue/10 transition-all duration-300 hover:shadow-xl hover:border-stellar-blue/30',
        className
      )}
    >
      {/* Cover accent */}
      <div className="h-1 w-full bg-gradient-to-r from-stellar-green to-stellar-blue" />

      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-4">
            <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full ring-2 ring-stellar-blue/20">
              {planter.avatarUrl ? (
                <Image
                  src={planter.avatarUrl}
                  alt={planter.fullName}
                  fill
                  sizes="64px"
                  className="object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-muted text-lg font-bold text-muted-foreground">
                  {planter.fullName.charAt(0)}
                </div>
              )}
            </div>
            <div className="min-w-0">
              <Link
                href={`/planters/${planter.slug}`}
                className="block truncate font-bold hover:text-stellar-blue transition-colors"
              >
                {planter.fullName}
              </Link>
              <Text variant="small" className="text-stellar-blue font-medium">
                {planter.role}
              </Text>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="h-3 w-3" aria-hidden />
                {planter.location}
              </div>
            </div>
          </div>

          {planter.availableForConnections ? (
            <button
              type="button"
              onClick={() => toggleConnection(planter.id)}
              aria-pressed={connected}
              className={cn(
                'inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
                connected
                  ? 'bg-stellar-green/10 text-stellar-green'
                  : 'bg-muted text-muted-foreground hover:bg-stellar-green/10 hover:text-stellar-green'
              )}
            >
              {connected ? (
                <UserCheck className="h-3.5 w-3.5" />
              ) : (
                <UserPlus className="h-3.5 w-3.5" />
              )}
              {connected ? 'Connected' : 'Connect'}
            </button>
          ) : (
            <Badge variant="secondary" className="shrink-0">
              At capacity
            </Badge>
          )}
        </div>

        <Text variant="muted" as="p" className="mt-4 line-clamp-2 text-sm">
          {planter.tagline}
        </Text>

        <div className="mt-4 flex flex-wrap gap-1.5">
          {planter.expertise.slice(0, 3).map((item) => (
            <span
              key={item}
              className="rounded-full bg-muted/60 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground"
            >
              {item}
            </span>
          ))}
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2 border-t border-border pt-4 text-center">
          <div>
            <div className="flex items-center justify-center gap-1 text-sm font-bold text-stellar-green">
              <TreePine className="h-3.5 w-3.5" aria-hidden />
              {planter.stats.treesPlanted.toLocaleString()}
            </div>
            <Text variant="small" className="text-muted-foreground">
              Trees
            </Text>
          </div>
          <div>
            <div className="flex items-center justify-center gap-1 text-sm font-bold">
              <Users className="h-3.5 w-3.5 text-stellar-blue" aria-hidden />
              {planter.stats.projectsJoined}
            </div>
            <Text variant="small" className="text-muted-foreground">
              Projects
            </Text>
          </div>
          <div>
            <div className="text-sm font-bold">
              {planter.stats.survivalRate !== null ? `${planter.stats.survivalRate}%` : '—'}
            </div>
            <Text variant="small" className="text-muted-foreground">
              Survival
            </Text>
          </div>
        </div>

        <Link
          href={`/planters/${planter.slug}`}
          className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-stellar-blue transition-transform group-hover:translate-x-1"
        >
          View profile <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </CardContent>
    </Card>
  );
}

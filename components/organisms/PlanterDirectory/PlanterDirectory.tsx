'use client';

import { useEffect, useMemo, useState } from 'react';
import { Search, SlidersHorizontal } from 'lucide-react';
import { Input } from '@/components/atoms/Input';
import { Select } from '@/components/atoms/Select';
import { Text } from '@/components/atoms/Text';
import { Skeleton } from '@/components/atoms/Skeleton';
import { PlanterCard } from '@/components/molecules/PlanterCard';
import { getMockPlanters } from '@/lib/api/planters';
import type { PlanterProfile } from '@/lib/types/planter';

type AvailabilityFilter = 'all' | 'available' | 'featured';

/**
 * Directory of planter profiles with search over name/tagline/expertise and a
 * filter for connection availability. Backs the /planters page (Issue #1150).
 */
export function PlanterDirectory() {
  const [planters, setPlanters] = useState<PlanterProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [availability, setAvailability] = useState<AvailabilityFilter>('all');

  useEffect(() => {
    let active = true;
    getMockPlanters().then((data) => {
      if (active) {
        setPlanters(data);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return planters.filter((planter) => {
      if (availability === 'available' && !planter.availableForConnections) return false;
      if (availability === 'featured' && !planter.isFeatured) return false;
      if (!query) return true;
      const haystack = [
        planter.fullName,
        planter.role,
        planter.tagline,
        planter.location,
        ...planter.expertise,
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [planters, search, availability]);

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, skill or location…"
            className="pl-9"
            aria-label="Search planters"
          />
        </div>
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-muted-foreground" aria-hidden />
          <Select
            value={availability}
            onChange={(e) => setAvailability(e.target.value as AvailabilityFilter)}
            aria-label="Filter planters"
            className="w-52"
          >
            <option value="all">All planters</option>
            <option value="available">Available to connect</option>
            <option value="featured">Featured</option>
          </Select>
        </div>
      </div>

      <Text variant="muted" as="p" aria-live="polite">
        {loading
          ? 'Loading planters…'
          : filtered.length === 0
            ? 'No planters match your filters'
            : `Showing ${filtered.length} ${filtered.length === 1 ? 'planter' : 'planters'}`}
      </Text>

      {loading ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-72 w-full rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((planter) => (
            <PlanterCard key={planter.id} planter={planter} />
          ))}
        </div>
      )}
    </div>
  );
}

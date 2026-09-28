'use client';

import { useMemo, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Globe2,
  Leaf,
  Newspaper,
  Scale,
  Search,
  Users,
} from 'lucide-react';
import { Badge } from '@/components/atoms/Badge';
import { Text } from '@/components/atoms/Text';
import { Card, CardContent } from '@/components/molecules/Card';
import { MARKETPLACE_NEWS, MARKETPLACE_SNAPSHOTS } from '@/lib/api/mock/marketplaceNews';
import type { MarketplaceNewsCategory, MarketplaceNewsItem } from '@/lib/types/marketplace-news';
import { cn } from '@/lib/utils';

const CATEGORY_OPTIONS: Array<{ value: MarketplaceNewsCategory | 'all'; label: string }> = [
  { value: 'all', label: 'All updates' },
  { value: 'price-movements', label: 'Price movements' },
  { value: 'policy', label: 'Policy' },
  { value: 'new-projects', label: 'New projects' },
  { value: 'buyer-demand', label: 'Buyer demand' },
  { value: 'regional-insights', label: 'Regional insights' },
];

const CATEGORY_META: Record<MarketplaceNewsCategory, { label: string; icon: typeof BarChart3 }> = {
  'price-movements': { label: 'Price movements', icon: BarChart3 },
  policy: { label: 'Policy', icon: Scale },
  'new-projects': { label: 'New projects', icon: Leaf },
  'buyer-demand': { label: 'Buyer demand', icon: Users },
  'regional-insights': { label: 'Regional insights', icon: Globe2 },
};

function relativeDate(date: string): string {
  const days = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 86_400_000));
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return `${days} days ago`;
}

function ToneChange({ item }: { item: MarketplaceNewsItem }) {
  if (!item.metric) return null;
  const Icon = item.tone === 'caution' ? ArrowDownRight : ArrowUpRight;
  return (
    <div
      className={cn(
        'flex items-center gap-1 text-sm font-semibold',
        item.tone === 'positive' && 'text-emerald-600',
        item.tone === 'caution' && 'text-amber-600',
        item.tone === 'neutral' && 'text-muted-foreground'
      )}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      <span>{item.metric}</span>
      <span className="font-normal text-muted-foreground">{item.metricLabel}</span>
    </div>
  );
}

function NewsCard({ item }: { item: MarketplaceNewsItem }) {
  const { icon: Icon, label } = CATEGORY_META[item.category];
  return (
    <article className="rounded-2xl border border-border bg-background p-5 transition-shadow hover:shadow-md">
      <div className="mb-4 flex items-start justify-between gap-3">
        <Badge variant="outline" className="gap-1.5">
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
          {label}
        </Badge>
        <span className="text-xs text-muted-foreground">{relativeDate(item.publishedAt)}</span>
      </div>
      <h3 className="text-lg font-semibold leading-snug">{item.headline}</h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.summary}</p>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Globe2 className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{item.region}</span>
          <span aria-hidden="true">·</span>
          <span>{item.source}</span>
        </div>
        <ToneChange item={item} />
      </div>
    </article>
  );
}

export function MarketplaceNewsFeed() {
  const [category, setCategory] = useState<MarketplaceNewsCategory | 'all'>('all');
  const [query, setQuery] = useState('');

  const filteredNews = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return MARKETPLACE_NEWS.filter((item) => {
      const matchesCategory = category === 'all' || item.category === category;
      const searchable =
        `${item.headline} ${item.summary} ${item.region} ${item.source}`.toLowerCase();
      return matchesCategory && (!normalizedQuery || searchable.includes(normalizedQuery));
    });
  }, [category, query]);

  return (
    <section
      aria-labelledby="market-news-heading"
      className="mb-10 rounded-3xl border border-border bg-card p-6 shadow-sm md:p-8"
    >
      <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div className="max-w-2xl">
          <div className="mb-3 flex items-center gap-2 text-stellar-blue">
            <Newspaper className="h-5 w-5" aria-hidden="true" />
            <Text variant="label" as="span" className="text-stellar-blue">
              Market intelligence
            </Text>
          </div>
          <Text variant="h3" as="h2" id="market-news-heading">
            Carbon market news
          </Text>
          <Text variant="muted" as="p" className="mt-2">
            Track the signals shaping credit prices, project supply, buyer demand, and regional
            opportunity.
          </Text>
        </div>
        <label className="relative block w-full max-w-xs">
          <span className="sr-only">Search market news</span>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search news"
            className="h-10 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-sm outline-none transition focus:border-stellar-blue focus:ring-2 focus:ring-stellar-blue/20"
          />
        </label>
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-3">
        {MARKETPLACE_SNAPSHOTS.map((snapshot) => (
          <Card key={snapshot.label} className="border-border bg-background shadow-none">
            <CardContent className="p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {snapshot.label}
              </p>
              <div className="mt-2 flex items-end justify-between gap-2">
                <span className="text-2xl font-semibold">{snapshot.value}</span>
                <span
                  className={cn(
                    'text-sm font-semibold',
                    snapshot.tone === 'positive' ? 'text-emerald-600' : 'text-muted-foreground'
                  )}
                >
                  {snapshot.change}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{snapshot.context}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div
        className="mt-7 flex gap-2 overflow-x-auto pb-1"
        role="tablist"
        aria-label="Market news categories"
      >
        {CATEGORY_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={category === option.value}
            onClick={() => setCategory(option.value)}
            className={cn(
              'whitespace-nowrap rounded-full border px-4 py-2 text-sm font-medium transition-colors',
              category === option.value
                ? 'border-stellar-blue bg-stellar-blue text-white'
                : 'border-border bg-background text-muted-foreground hover:border-stellar-blue hover:text-foreground'
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2" aria-live="polite">
        {filteredNews.length > 0 ? (
          filteredNews.map((item) => <NewsCard item={item} key={item.id} />)
        ) : (
          <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground lg:col-span-2">
            No market updates match your search.
          </p>
        )}
      </div>
    </section>
  );
}

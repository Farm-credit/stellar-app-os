import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, Smartphone } from 'lucide-react';
import { TreeDetail } from '@/components/organisms/TreeDetail/TreeDetail';
import { getMockTrees } from '@/lib/api/mock/trees';

export function generateStaticParams() {
  return getMockTrees().map((tree) => ({ id: tree.id }));
}

export default async function TreeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tree = getMockTrees().find((t) => t.id === id || t.treeId === id);

  if (!tree) {
    notFound();
  }

  return (
    <>
      <TreeDetail tree={tree} />

      {/* WebAR 20-year growth view (Issue #1106) */}
      <div className="mx-auto -mt-4 max-w-3xl px-4 pb-10 sm:pb-12">
        <Link
          href={`/trees/${tree.id}/ar`}
          className="group flex min-h-[44px] items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:bg-muted"
        >
          <span className="flex items-center gap-3">
            <Smartphone className="h-5 w-5 text-stellar-green" aria-hidden />
            <span>
              <span className="block font-semibold">View in AR</span>
              <span className="block text-sm text-muted-foreground">
                See this tree at 20-year maturity overlaid on your surroundings.
              </span>
            </span>
          </span>
          <ArrowRight
            className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
            aria-hidden
          />
        </Link>
      </div>
    </>
  );
}

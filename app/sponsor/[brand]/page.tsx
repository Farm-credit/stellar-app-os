/* eslint-disable @next/next/no-img-element */
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import {
  CheckCircle2,
  ExternalLink,
  Globe2,
  Leaf,
  ShieldCheck,
  TreePine,
  Users,
  Wind,
} from 'lucide-react';
import {
  getBenefactorLandingPage,
  getAllPublishedBenefactorSlugs,
} from '@/lib/api/benefactor-landing';
import { Card, CardContent } from '@/components/molecules/Card';
import { Badge } from '@/components/atoms/Badge';

interface PageProps {
  params: Promise<{ brand: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { brand } = await params;
  const data = getBenefactorLandingPage(brand);
  if (!data) {
    return {
      title: 'Benefactor Not Found | FarmCredit',
    };
  }
  return {
    title: `${data.config.brandName} - Co-Branded CSR & Impact Showcase | FarmCredit`,
    description:
      data.config.description ||
      `CSR climate and community impact supported by ${data.config.brandName}.`,
  };
}

export function generateStaticParams() {
  const slugs = getAllPublishedBenefactorSlugs();
  return slugs.map((brand) => ({ brand }));
}

function roleBadge(role: string) {
  switch (role) {
    case 'farmer':
      return (
        <Badge
          variant="secondary"
          className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
        >
          Farmer
        </Badge>
      );
    case 'community_steward':
      return (
        <Badge
          variant="secondary"
          className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20"
        >
          Community Steward
        </Badge>
      );
    case 'urban_planter':
      return (
        <Badge
          variant="secondary"
          className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
        >
          Urban Planter
        </Badge>
      );
    default:
      return <Badge variant="outline">{role}</Badge>;
  }
}

export default async function BenefactorLandingPage({ params }: PageProps) {
  const { brand } = await params;
  const data = getBenefactorLandingPage(brand);

  if (!data) {
    notFound();
  }

  const { config, metrics, beneficiaries, projects } = data;

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-20 text-slate-900 dark:text-slate-100">
      {/* Cover / Banner Header */}
      <section className="relative w-full overflow-hidden bg-slate-900">
        <div className="relative h-64 md:h-80 w-full">
          {config.coverImageUrl ? (
            <img
              src={config.coverImageUrl}
              alt={`${config.brandName} Banner`}
              className="h-full w-full object-cover opacity-60"
            />
          ) : (
            <div className="h-full w-full bg-gradient-to-r from-emerald-900 via-teal-950 to-slate-900 opacity-90" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent" />
        </div>

        {/* Benefactor Header Content */}
        <div className="relative mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 -mt-24 pb-8">
          <div className="flex flex-col md:flex-row items-start md:items-end gap-6">
            {/* Logo */}
            <div className="relative h-28 w-28 md:h-36 md:md:w-36 shrink-0 rounded-2xl border-4 border-white dark:border-slate-900 bg-white dark:bg-slate-900 shadow-xl overflow-hidden flex items-center justify-center">
              {config.logoUrl ? (
                <img
                  src={config.logoUrl}
                  alt={config.brandName}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="text-3xl md:text-4xl font-black text-emerald-600">
                  {config.brandName.charAt(0)}
                </span>
              )}
            </div>

            {/* Brand Title & Details */}
            <div className="flex-1 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-500">
                  Verified Corporate Benefactor
                </span>
                <span className="flex items-center gap-1 text-xs text-slate-400">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                  Stellar On-Chain Verified
                </span>
              </div>
              <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-white">
                {config.brandName}
              </h1>
              <p className="max-w-2xl text-sm md:text-base text-slate-300">{config.description}</p>
            </div>

            {/* External Link if provided */}
            {config.websiteUrl && (
              <div className="shrink-0 pt-2 md:pt-0">
                <a
                  href={config.websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-xs font-semibold text-white backdrop-blur hover:bg-white/20 transition-colors"
                >
                  <Globe2 className="h-4 w-4" />
                  Visit Website
                  <ExternalLink className="h-3.5 w-3.5 opacity-70" />
                </a>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Main Content Body */}
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 mt-10 space-y-12">
        {/* Public-facing Introduction */}
        {config.introduction && (
          <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-6 sm:p-8 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2 flex items-center gap-2">
              <Leaf className="h-5 w-5 text-emerald-500" />
              Corporate CSR & Climate Commitment
            </h2>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed text-sm md:text-base">
              {config.introduction}
            </p>
          </section>
        )}

        {/* Impact Overview Stats */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                Verified CSR Impact
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Cumulative regenerative outcomes funded and stewarded by {config.brandName}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              <CardContent className="p-5 flex flex-col justify-between h-full">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Total Trees Funded
                  </span>
                  <div className="rounded-full bg-emerald-500/10 p-2 text-emerald-500">
                    <TreePine className="h-5 w-5" />
                  </div>
                </div>
                <div className="mt-4">
                  <span className="text-2xl font-bold text-slate-900 dark:text-white">
                    {metrics.totalTreesFunded.toLocaleString()}
                  </span>
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">
                    Verified alive & growing
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              <CardContent className="p-5 flex flex-col justify-between h-full">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    CO₂ Sequestered
                  </span>
                  <div className="rounded-full bg-cyan-500/10 p-2 text-cyan-500">
                    <Wind className="h-5 w-5" />
                  </div>
                </div>
                <div className="mt-4">
                  <span className="text-2xl font-bold text-slate-900 dark:text-white">
                    {metrics.totalCo2Tonnes.toLocaleString()}{' '}
                    <span className="text-sm font-normal text-slate-400">Tons</span>
                  </span>
                  <p className="text-xs text-cyan-600 dark:text-cyan-400 mt-0.5">
                    Standard verified credits
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              <CardContent className="p-5 flex flex-col justify-between h-full">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Supported Farmers
                  </span>
                  <div className="rounded-full bg-blue-500/10 p-2 text-blue-500">
                    <Users className="h-5 w-5" />
                  </div>
                </div>
                <div className="mt-4">
                  <span className="text-2xl font-bold text-slate-900 dark:text-white">
                    {metrics.supportedFarmersCount}{' '}
                    <span className="text-sm font-normal text-slate-400">Farmers</span>
                  </span>
                  <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">
                    Direct livelihoods uplift
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              <CardContent className="p-5 flex flex-col justify-between h-full">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Community Stewards
                  </span>
                  <div className="rounded-full bg-purple-500/10 p-2 text-purple-500">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                </div>
                <div className="mt-4">
                  <span className="text-2xl font-bold text-slate-900 dark:text-white">
                    {metrics.supportedStewardsCount}{' '}
                    <span className="text-sm font-normal text-slate-400">Stewards</span>
                  </span>
                  <p className="text-xs text-purple-600 dark:text-purple-400 mt-0.5">
                    Nurseries & verifiers
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Supported Beneficiaries (Farmers & Stewards) */}
        <section className="space-y-6">
          <div className="space-y-1">
            <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
              Supported Beneficiaries & Stewards
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Meet the smallholder farmers and community leaders supported on the ground by{' '}
              {config.brandName}&apos;s sponsorship.
            </p>
          </div>

          {beneficiaries.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 p-8 text-center text-slate-500">
              No beneficiary records currently linked.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {beneficiaries.map((b) => (
                <Card
                  key={b.id}
                  className="overflow-hidden border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 hover:shadow-md transition-shadow"
                >
                  <CardContent className="p-6">
                    <div className="flex items-start gap-4">
                      {/* Avatar */}
                      <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                        {b.avatarUrl ? (
                          <img
                            src={b.avatarUrl}
                            alt={b.name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center font-bold text-slate-400">
                            {b.name.charAt(0)}
                          </div>
                        )}
                      </div>

                      {/* Header details */}
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="font-semibold text-slate-900 dark:text-white text-base">
                            {b.name}
                          </h3>
                          {roleBadge(b.role)}
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{b.region}</p>
                        <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400 pt-0.5">
                          <TreePine className="h-3.5 w-3.5" />
                          <span>{b.treesSupported.toLocaleString()} trees under stewardship</span>
                        </div>
                      </div>
                    </div>

                    {/* Story / Impact */}
                    {b.story && (
                      <p className="mt-4 text-xs leading-relaxed text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-950/60 p-3 rounded-lg border border-slate-100 dark:border-slate-800/80">
                        &ldquo;{b.story}&rdquo;
                      </p>
                    )}

                    {/* Crops or Species */}
                    {b.cropsOrSpecies && b.cropsOrSpecies.length > 0 && (
                      <div className="mt-3 flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] text-slate-400 font-medium">Focus:</span>
                        {b.cropsOrSpecies.map((item, idx) => (
                          <span
                            key={idx}
                            className="inline-flex rounded bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[11px] text-slate-700 dark:text-slate-300"
                          >
                            {item}
                          </span>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>

        {/* Supported Projects */}
        <section className="space-y-6">
          <div className="space-y-1">
            <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
              Funded Agroforestry & Restoration Projects
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Verified nature-based carbon and community projects backed by {config.brandName}.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {projects.map((proj) => (
              <Card
                key={proj.id}
                className="overflow-hidden border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col"
              >
                {proj.imageUrl && (
                  <div className="relative h-44 w-full overflow-hidden bg-slate-100 dark:bg-slate-800">
                    <img
                      src={proj.imageUrl}
                      alt={proj.name}
                      className="h-full w-full object-cover transition-transform duration-300 hover:scale-105"
                    />
                    <div className="absolute top-3 right-3">
                      <Badge
                        variant="secondary"
                        className="bg-black/60 text-white backdrop-blur border-none text-[10px]"
                      >
                        {proj.category}
                      </Badge>
                    </div>
                  </div>
                )}
                <CardContent className="p-5 flex-1 flex flex-col justify-between">
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                      {proj.location}
                    </p>
                    <h3 className="font-bold text-slate-900 dark:text-white text-base line-clamp-1">
                      {proj.name}
                    </h3>
                    <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-3">
                      {proj.description}
                    </p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                    <span className="text-slate-500 dark:text-slate-400 font-mono text-[11px]">
                      {proj.standard}
                    </span>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                      {proj.co2Tonnes} tCO₂e
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Verification and Trust Footer */}
        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-gradient-to-r from-emerald-500/5 via-blue-500/5 to-purple-500/5 p-6 text-center space-y-2">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Immutable Verification
          </div>
          <h3 className="text-base font-semibold text-slate-900 dark:text-white">
            Audited & Recorded On-Chain
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xl mx-auto">
            All planting verifications, farmer stipends, and carbon retirement records associated
            with {config.brandName}&apos;s campaigns are sealed on the Stellar network.
          </p>
        </section>
      </div>
    </main>
  );
}

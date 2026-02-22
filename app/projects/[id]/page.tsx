import React, { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProject } from "@/lib/utils/project-data";
import { HeroSection } from "../components/HeroSection";
import { ImpactMetrics } from "../components/ImpactMetrics";
import { ProjectBody } from "../components/ProjectBody";
import { LocationMap } from "../components/LocationMap";
import { TimelineMilestones } from "../components/TimelineMilestones";
import { MRVSection } from "../components/MRVSection";
import { CTAPanel, StickyMobileCTA } from "../components/CTAPanel";
import { RelatedProjects } from "../components/RelatedProjects";

//  ISR static params

export async function generateStaticParams(): Promise<{ id: string }[]> {
  return [{ id: "proj_cerrado_001" }];
}

//  Dynamic metadata 

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const project = await getProject(id);

  if (!project) {
    return {
      title: "Project Not Found",
      description: "The requested project could not be found.",
    };
  }

  const ogImage =
    project.hero.kind === "image"
      ? project.hero.src
      : `/api/og?title=${encodeURIComponent(project.title)}&location=${encodeURIComponent(project.location.label)}`;

  return {
    title: `${project.title} | Carbon Projects`,
    description: project.excerpt,
    keywords: project.tags.join(", "),
    authors: [{ name: project.organisation.name }],
    openGraph: {
      title: project.title,
      description: project.excerpt,
      type: "website",
      locale: "en_US",
      images: [{ url: ogImage, width: 1200, height: 630, alt: project.hero.alt }],
    },
    twitter: {
      card: "summary_large_image",
      title: project.title,
      description: project.excerpt,
      images: [ogImage],
    },
    robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large" } },
    alternates: { canonical: `/projects/${project.slug}` },
  };
}


function ProjectJsonLd({ project }: { project: NonNullable<Awaited<ReturnType<typeof getProject>>> }) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Project",
    name: project.title,
    description: project.excerpt,
    url: `https://example.com/projects/${project.slug}`,
    image: project.hero.kind === "image" ? project.hero.src : undefined,
    location: {
      "@type": "Place",
      name: project.location.label,
      address: { "@type": "PostalAddress", addressCountry: project.location.country },
      geo: {
        "@type": "GeoCoordinates",
        latitude: project.location.coordinates.lat,
        longitude: project.location.coordinates.lng,
      },
    },
    member: {
      "@type": "Organization",
      name: project.organisation.name,
      url: project.organisation.website,
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}


function MapSkeleton() {
  return (
    <div className="py-20 px-6 border-t border-stone-800/60">
      <div className="max-w-7xl mx-auto">
        <div className="h-[480px] rounded-2xl bg-stone-900 animate-pulse border border-stone-800" />
      </div>
    </div>
  );
}

function CarouselSkeleton() {
  return (
    <div className="py-20 px-6 border-t border-stone-800/60">
      <div className="max-w-7xl mx-auto">
        <div className="h-8 w-48 bg-stone-800 rounded animate-pulse mb-6" />
        <div className="flex gap-4">
          {[1, 2, 3].map((n) => (
            <div key={n} className="flex-shrink-0 w-80 h-64 rounded-2xl bg-stone-900 animate-pulse border border-stone-800" />
          ))}
        </div>
      </div>
    </div>
  );
}


interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ProjectDetailPage({ params }: PageProps) {
  const { id } = await params;
  const project = await getProject(id);

  if (!project) notFound();

  return (
    <>
      <ProjectJsonLd project={project} />

      {/* Skip link */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:rounded-xl focus:bg-stellar-green focus:px-4 focus:py-2 focus:text-stone-950 focus:text-sm focus:font-bold"
      >
        Skip to main content
      </a>

      <div className="min-h-screen  text-cream">
        <HeroSection project={project} />

        {/* Two-column layout: content + sticky CTA sidebar */}
        <main id="main-content">
          <div className="max-w-[1480px] mx-auto lg:grid lg:grid-cols-[1fr_400px]">

            {/* ── Left: content ── */}
            <div className="min-w-0 border-stone-800/60">
              <ImpactMetrics metrics={project.metrics} progress={project.progress} />
              <ProjectBody project={project} />

              <Suspense fallback={<MapSkeleton />}>
                <LocationMap
                  coordinates={project.location.coordinates}
                  label={project.location.label}
                  country={project.location.country}
                />
              </Suspense>

              <TimelineMilestones milestones={project.milestones} />
              <MRVSection documents={project.mrvDocuments} />
            </div>

            {/* ── Right: sticky CTA (desktop) ── */}
            <aside
              className="hidden lg:block px-8 py-20 border-l border-stone-800/60"
              aria-label="Purchase sidebar"
            >
              <div className="sticky top-24">
                {/* Price header */}
                <div className="mb-6">
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="font-display text-4xl font-bold text-cream">${project.creditPriceUsd}</span>
                    <span className="text-stone-500 text-sm">/ carbon credit</span>
                  </div>
                  <p className="text-xs text-stone-600">Min. {project.minCredits} credit · Verified by Verra VCS</p>
                </div>

                <CTAPanel project={project} />

                {/* Trust signals */}
                <div className="mt-6 grid grid-cols-2 gap-2.5">
                  {[
                    { icon: "🔒", text: "Secure payment" },
                    { icon: "📜", text: "Instant certificate" },
                    { icon: "✅", text: "Verra verified" },
                    { icon: "🌍", text: "Real impact" },
                  ].map(({ icon, text }) => (
                    <div key={text} className="flex items-center gap-2 text-xs text-stone-600">
                      <span aria-hidden="true">{icon}</span>
                      {text}
                    </div>
                  ))}
                </div>
              </div>
            </aside>
          </div>

          {/* Related projects carousel (lazy) */}
          <Suspense fallback={<CarouselSkeleton />}>
            <RelatedProjects projects={project.relatedProjects} />
          </Suspense>
        </main>

        {/* Footer CTA strip */}
        <div className="border-t border-stone-800/60 bg-stone-950">
          <div className="max-w-7xl mx-auto px-6 py-10 flex flex-col md:flex-row items-center justify-between gap-6">
            <div>
              <h2 className="font-display text-xl font-bold text-cream mb-1">Ready to offset your footprint?</h2>
              <p className="text-stone-500 text-sm">Join thousands making measurable climate impact.</p>
            </div>
            <div className="flex gap-3 shrink-0">
              <a href={`/donate?project=${project.id}`} className="btn-stellar-blue-sm">Donate</a>
              <a href={`/checkout?project=${project.id}&credits=10`} className="btn-stellar-green-sm">Buy Carbon Credits →</a>
            </div>
          </div>
        </div>
      </div>

      <StickyMobileCTA project={project} />
    </>
  );
}

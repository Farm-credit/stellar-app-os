import React from "react";
import type { Project } from "@/lib/types/project";

interface ProjectBodyProps {
  project: Project;
}

export function ProjectBody({ project }: ProjectBodyProps) {
  return (
    <section className="py-20 px-6 md:px-10 border-t border-stone-800/60" aria-labelledby="body-heading">
      <div className="max-w-7xl mx-auto grid lg:grid-cols-[1fr_340px] gap-16 xl:gap-24">

        {/* Rich-text content */}
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="h-6 w-1 rounded-full bg-stellar-blue" aria-hidden="true" />
            <span className="text-xs font-semibold text-stellar-blue uppercase tracking-widest">Project Story</span>
          </div>
          <h2 id="body-heading" className="font-display text-3xl md:text-4xl font-bold text-cream mb-10">
            About This Project
          </h2>

          <div
            className="prose-stellar"
            dangerouslySetInnerHTML={{ __html: project.bodyHtml }}
          />
        </div>

        {/* Sidebar */}
        <aside className="space-y-6" aria-label="Project metadata">
          {/* Organisation card */}
          <div className="rounded-2xl border border-stone-800 bg-stone-900/50 p-6">
            <h3 className="font-mono text-xs text-stone-500 uppercase tracking-widest mb-4">Project Developer</h3>
            <div className="flex items-center gap-3 mb-5">
              <div
                className="h-10 w-10 rounded-xl bg-gradient-to-br from-stellar-green/30 to-stellar-blue/20 border border-stellar-green/20 flex items-center justify-center text-xl"
                aria-hidden="true"
              >
                🌿
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-semibold text-cream">{project.organisation.name}</span>
                  {project.organisation.verified && (
                    <svg className="w-4 h-4 text-stellar-blue" fill="currentColor" viewBox="0 0 24 24" aria-label="Verified organisation">
                      <path d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                    </svg>
                  )}
                </div>
                <span className="text-xs text-stone-500">Verified Developer</span>
              </div>
            </div>
            <a
              href={project.organisation.website}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-center gap-2 rounded-xl border border-stone-700 py-2.5 text-sm text-stone-400 hover:text-cream hover:border-stone-500 transition-all"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              Visit Website
            </a>
          </div>

          {/* Tags */}
          <div className="rounded-2xl border border-stone-800 bg-stone-900/50 p-6">
            <h3 className="font-mono text-xs text-stone-500 uppercase tracking-widest mb-4">Categories</h3>
            <div className="flex flex-wrap gap-2" role="list" aria-label="Project tags">
              {project.tags.map((tag) => (
                <span
                  key={tag}
                  role="listitem"
                  className="rounded-full px-3 py-1 text-xs font-medium bg-stellar-green/10 text-stellar-green border border-stellar-green/20"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>

          {/* Key dates */}
          <div className="rounded-2xl border border-stone-800 bg-stone-900/50 p-6">
            <h3 className="font-mono text-xs text-stone-500 uppercase tracking-widest mb-4">Key Dates</h3>
            <dl className="space-y-3">
              {[
                { term: "Published", value: new Date(project.publishedAt).toLocaleDateString("en-US", { year: "numeric", month: "long" }) },
                { term: "Last Updated", value: new Date(project.updatedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) },
                { term: "Region", value: project.location.region },
              ].map(({ term, value }) => (
                <div key={term} className="flex justify-between items-baseline gap-2">
                  <dt className="text-xs text-stone-500 shrink-0">{term}</dt>
                  <dd className="text-xs text-stone-300 font-mono text-right">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </aside>
      </div>
    </section>
  );
}

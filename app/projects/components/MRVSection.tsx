import React from "react";
import type { MRVDocument } from "@/lib/types/project";

const DOC_CONFIG: Record<MRVDocument["docType"], { label: string; color: string; bg: string }> = {
  verification: { label: "Verification", color: "text-stellar-green", bg: "bg-stellar-green/10 border-stellar-green/20" },
  audit:        { label: "Audit",         color: "text-sky-400",       bg: "bg-sky-500/10 border-sky-500/20" },
  report:       { label: "Report",        color: "text-amber-400",     bg: "bg-amber-500/10 border-amber-500/20" },
  certificate:  { label: "Certificate",   color: "text-violet-400",    bg: "bg-violet-500/10 border-violet-500/20" },
};

function DocCard({ doc }: { doc: MRVDocument }) {
  const cfg = DOC_CONFIG[doc.docType];
  const date = new Date(doc.issuedAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  const sizeMb = (doc.fileSizeKb / 1024).toFixed(1);

  return (
    <article className="group flex items-start gap-4 rounded-2xl border border-stone-800 bg-stone-900/40 p-5 hover:border-stone-700 hover:bg-stone-900/70 transition-all duration-200">
      <div className="h-11 w-11 shrink-0 rounded-xl border border-stone-700 bg-stone-800 flex items-center justify-center text-xl group-hover:scale-105 transition-transform" aria-hidden="true">
        📄
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-start gap-2 mb-1">
          <h3 className="text-sm font-semibold text-cream/90 group-hover:text-cream transition-colors leading-snug flex-1">
            {doc.title}
          </h3>
          <span className={`shrink-0 inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${cfg.bg} ${cfg.color}`}>
            {cfg.label}
          </span>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-xs text-stone-500">
          <span>{doc.issuer}</span>
          <span aria-hidden="true">·</span>
          <time dateTime={doc.issuedAt}>{date}</time>
          <span aria-hidden="true">·</span>
          <span>{sizeMb} MB</span>
        </div>
      </div>

      <a
        href={doc.href}
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 flex h-9 w-9 items-center justify-center rounded-xl border border-stone-700 text-stone-500 hover:text-cream hover:border-stone-500 transition-all"
        aria-label={`Download ${doc.title} (${sizeMb} MB)`}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
      </a>
    </article>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-stone-800 p-12 text-center" role="status" aria-label="No MRV documents yet">
      <div className="text-4xl mb-3" aria-hidden="true">🔍</div>
      <h3 className="font-semibold text-stone-400 mb-2">Documentation Pending</h3>
      <p className="text-sm text-stone-600 max-w-sm mx-auto">
        This project is in its early stages. Verification documents will appear here once the first audit cycle is complete.
      </p>
    </div>
  );
}

export function MRVSection({ documents }: { documents: MRVDocument[] }) {
  return (
    <section className="py-20 px-6 md:px-10 border-t border-stone-800/60" aria-labelledby="mrv-heading">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center gap-3 mb-2">
          <div className="h-6 w-1 rounded-full bg-violet-500" aria-hidden="true" />
          <span className="text-xs font-semibold text-violet-400 uppercase tracking-widest">Transparency</span>
        </div>
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
          <div>
            <h2 id="mrv-heading" className="font-display text-3xl md:text-4xl font-bold text-cream">
              MRV Documentation
            </h2>
            <p className="text-stone-400 mt-1 text-sm font-body">
              Monitoring, Reporting &amp; Verification — audited by independent third parties.
            </p>
          </div>
          {documents.length > 0 && (
            <span className="font-mono text-sm text-stone-500 shrink-0" aria-live="polite">
              {documents.length} document{documents.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {/* Standards trust bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          {["Verra VCS", "Gold Standard", "ISO 14064", "UNFCCC CDM"].map((std) => (
            <div key={std} className="flex items-center gap-2 rounded-xl border border-stone-800 bg-stone-900/40 px-4 py-3 text-xs text-stone-400">
              <svg className="w-3.5 h-3.5 text-stellar-green shrink-0" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              {std}
            </div>
          ))}
        </div>

        {documents.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid md:grid-cols-2 gap-3" role="list" aria-label="MRV documents">
            {documents.map((doc) => (
              <div key={doc.id} role="listitem">
                <DocCard doc={doc} />
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

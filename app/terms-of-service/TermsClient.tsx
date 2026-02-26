"use client";

import { useRef } from "react";
import { IoPrintOutline } from "react-icons/io5";
import { useTableOfContents } from "@/hooks/Usetableofcontents ";
import { TableOfContents } from "@/components/TableOfContents";

type TermsClientProps = {
  html: string;
  lastUpdated: string;
};

export function TermsClient({ html, lastUpdated }: TermsClientProps) {
  const contentRef = useRef<HTMLElement>(null);
  const { tocItems, activeId } = useTableOfContents(contentRef);

  return (
    <>
      {/* Skip-to-content link for keyboard users */}
      <a
        href="#terms-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-0 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-blue-600 focus:text-white focus:rounded-b-md focus:text-sm focus:font-semibold"
      >
        Skip to content
      </a>

      <div className="min-h-screen bg-white text-gray-900">
        {/* Page header */}
        <header className="bg-gray-50 border-b border-gray-200 px-6 py-10">
          <div className="max-w-5xl mx-auto">
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-gray-900 mb-2">
              Terms of Service
            </h1>
            <p className="text-sm text-gray-500">
              <time dateTime={lastUpdated}>Last updated: {lastUpdated}</time>
            </p>
          </div>
        </header>

        {/* Layout */}
        <div className="max-w-5xl mx-auto px-6 py-8 flex flex-col md:flex-row gap-8 items-start">

          {/* Sidebar TOC */}
          <aside
            aria-label="Page navigation"
            className="w-full md:w-64 shrink-0 order-first md:order-none"
          >
            <div className="md:sticky md:top-6">
              <TableOfContents items={tocItems} activeId={activeId} />

              {/* Print button — hidden when printing */}
              <button
                onClick={() => window.print()}
                aria-label="Print terms of service"
                className="print:hidden mt-4 w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-gray-500 border border-gray-200 rounded-md hover:text-gray-900 hover:border-gray-400 hover:bg-gray-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <IoPrintOutline className="w-4 h-4" aria-hidden="true" />
                Print
              </button>
            </div>
          </aside>

          {/* Main content */}
          <main
            id="terms-content"
            ref={contentRef}
            aria-label="Terms of Service content"
            className="min-w-0 flex-1 border-l border-gray-200 pl-8"
          >
            {/* prose styles are defined in globals.css under .tos-prose */}
            <div
              className="tos-prose"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          </main>
        </div>
      </div>
    </>
  );
}   
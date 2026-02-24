"use client";

import React, { useState, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { ResultHighlight } from "@/components/molecules/ResultHighlight";
import { Pagination } from "@/components/molecules/Pagination";
import { performSearch, type ContentType, type SearchResult } from "@/lib/search";
import { ArrowRight } from "lucide-react";

const RESULTS_PER_PAGE = 10;
const CONTENT_TYPES: ContentType[] = ["projects", "docs", "blog"];

const contentTypeLabels: Record<ContentType, string> = {
  projects: "Projects",
  docs: "Documentation",
  blog: "Blog Posts",
};

const contentTypeIcons: Record<ContentType, string> = {
  projects: "📦",
  docs: "📚",
  blog: "📝",
};

export default function SearchResultsPage(): React.ReactNode {
  const searchParams = useSearchParams();
  const query = searchParams.get("q") || "";

  const [selectedTypes, setSelectedTypes] = useState<ContentType[]>(CONTENT_TYPES);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Perform search with current filters
  const { results, total } = useMemo(() => {
    const offset = (currentPage - 1) * RESULTS_PER_PAGE;
    return performSearch({
      query,
      contentTypes: selectedTypes,
      limit: RESULTS_PER_PAGE,
      offset,
    });
  }, [query, selectedTypes, currentPage]);

  const totalPages = Math.ceil(total / RESULTS_PER_PAGE);

  const toggleContentType = (type: ContentType): void => {
    setSelectedTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
    setCurrentPage(1); // Reset to first page when filters change
  };

  const handlePageChange = (page: number): void => {
    setCurrentPage(page);
    // Scroll to top of results
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <main className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 py-8 md:px-8 md:py-12">
        {/* Header */}
        <section aria-labelledby="search-heading" className="mb-8">
          <h1 id="search-heading" className="text-3xl md:text-4xl font-bold mb-2 text-stellar-blue">
            Search Results
          </h1>
          {query && (
            <p className="text-lg text-muted-foreground">
              {total > 0
                ? `Found ${total} ${total === 1 ? "result" : "results"} for "${query}"`
                : `No results found for "${query}"`}
            </p>
          )}
        </section>

        {/* Filters */}
        <section aria-labelledby="filter-heading" className="mb-8 p-4 bg-card rounded-lg border border-border">
          <h2 id="filter-heading" className="text-lg font-semibold mb-4 text-foreground">
            Filter by Type
          </h2>
          <div className="flex flex-wrap gap-3">
            {CONTENT_TYPES.map((type) => (
              <button
                key={type}
                onClick={() => toggleContentType(type)}
                aria-pressed={selectedTypes.includes(type)}
                className={`px-4 py-2 rounded-lg font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stellar-blue ${
                  selectedTypes.includes(type)
                    ? "bg-stellar-blue text-white"
                    : "bg-background border border-border text-foreground hover:border-stellar-blue"
                }`}
              >
                <span className="mr-2">{contentTypeIcons[type]}</span>
                {contentTypeLabels[type]}
              </button>
            ))}
          </div>
        </section>

        {/* Results */}
        {results.length > 0 ? (
          <>
            <section aria-labelledby="results-heading" className="mb-8">
              <h2 id="results-heading" className="sr-only">
                Search results list
              </h2>
              <ul className="space-y-4">
                {results.map((result) => (
                  <li
                    key={result.id}
                    className="p-4 bg-card rounded-lg border border-border hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        {/* Type Badge */}
                        <span className="inline-block px-2 py-1 text-xs font-semibold rounded-md mb-2 bg-muted text-muted-foreground">
                          {contentTypeIcons[result.type]} {contentTypeLabels[result.type]}
                        </span>

                        {/* Title */}
                        <a
                          href={result.url}
                          className="block text-lg font-semibold text-stellar-blue hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stellar-blue rounded"
                        >
                          <ResultHighlight text={result.title} query={query} />
                        </a>

                        {/* Description */}
                        <p className="text-sm text-muted-foreground mt-2">
                          <ResultHighlight text={result.description} query={query} />
                        </p>

                        {/* Content snippet */}
                        <p className="text-sm text-foreground mt-2 line-clamp-2">
                          <ResultHighlight text={result.content} query={query} />
                        </p>

                        {/* Metadata */}
                        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground mt-3">
                          {result.author && <span>By {result.author}</span>}
                          {result.date && (
                            <span>
                              {new Date(result.date).toLocaleDateString("en-US", {
                                year: "numeric",
                                month: "short",
                                day: "numeric",
                              })}
                            </span>
                          )}
                          {result.tags && result.tags.length > 0 && (
                            <span>Tags: {result.tags.join(", ")}</span>
                          )}
                        </div>
                      </div>

                      {/* Arrow Icon */}
                      <span className="text-xl text-stellar-blue flex-shrink-0"><ArrowRight className="w-4 h-4" /></span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-10">
                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onPageChange={handlePageChange}
                />
              </div>
            )}
          </>
        ) : (
          // No results state
          <section aria-labelledby="no-results-heading" className="py-12 text-center">
            <h2 id="no-results-heading" className="text-2xl font-semibold text-foreground mb-4">
              No results found
            </h2>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              {query
                ? `We couldn't find anything matching "${query}". Try different keywords or browse our resources.`
                : "Enter a search query to find projects, documentation, and blog posts."}
            </p>

            {/* Suggestions */}
            {query && (
              <div className="bg-card rounded-lg border border-border p-6 max-w-md mx-auto text-left">
                <h3 className="font-semibold text-foreground mb-3">Tips for better search:</h3>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>✓ Try using fewer or different keywords</li>
                  <li>✓ Check the spelling of your search terms</li>
                  <li>✓ Try more general keywords</li>
                  <li>✓ Remove filters to broaden your search</li>
                </ul>
              </div>
            )}

            {/* Quick Links */}
            <div className="mt-8">
              <p className="text-muted-foreground mb-4">Or explore these popular sections:</p>
              <div className="flex flex-wrap gap-3 justify-center">
                <a
                  href="/docs"
                  className="px-4 py-2 rounded-lg bg-card border border-border text-foreground hover:border-stellar-blue transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stellar-blue"
                >
                  📚 Documentation
                </a>
                <a
                  href="/blog"
                  className="px-4 py-2 rounded-lg bg-card border border-border text-foreground hover:border-stellar-blue transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stellar-blue"
                >
                  📝 Blog
                </a>
                <a
                  href="/projects"
                  className="px-4 py-2 rounded-lg bg-card border border-border text-foreground hover:border-stellar-blue transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stellar-blue"
                >
                  📦 Projects
                </a>
              </div>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

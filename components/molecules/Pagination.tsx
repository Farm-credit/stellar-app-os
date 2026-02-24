import { ArrowLeft, ArrowRight } from "lucide-react";
import React from "react";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
}

export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  className = "",
}: PaginationProps): React.ReactNode {
  const canGoPrev = currentPage > 1;
  const canGoNext = currentPage < totalPages;

  const handlePrevClick = (): void => {
    if (canGoPrev) onPageChange(currentPage - 1);
  };

  const handleNextClick = (): void => {
    if (canGoNext) onPageChange(currentPage + 1);
  };

  // Generate page numbers to display
  const getPageNumbers = (): (number | string)[] => {
    const pages: (number | string)[] = [];
    const maxVisible = 5;

    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      pages.push(1);

      if (currentPage > 3) {
        pages.push("...");
      }

      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);

      for (let i = start; i <= end; i++) {
        pages.push(i);
      }

      if (currentPage < totalPages - 2) {
        pages.push("...");
      }

      pages.push(totalPages);
    }

    return pages;
  };

  const pageNumbers = getPageNumbers();

  return (
    <nav
      aria-label="Search results pagination"
      className={`flex items-center justify-center gap-2 ${className}`}
    >
      <button
        onClick={handlePrevClick}
        disabled={!canGoPrev}
        aria-label="Go to previous page"
        className="px-3 py-2 cursor-pointer rounded-lg border border-border text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stellar-blue"
      >
        <ArrowLeft className="w-4 h-4 inline-block ml-1" /> Previous
      </button>

      <div className="flex gap-1 flex-wrap justify-center">
        {pageNumbers.map((page, idx) => {
          if (page === "...") {
            return (
              <span key={`ellipsis-${idx}`} className="px-2 py-2 text-muted-foreground">
                ...
              </span>
            );
          }

          const pageNum = page as number;
          const isActive = pageNum === currentPage;

          return (
            <button
              key={pageNum}
              onClick={() => onPageChange(pageNum)}
              aria-label={`Go to page ${pageNum}`}
              aria-current={isActive ? "page" : undefined}
              className={`px-3 cursor-pointer py-2 rounded-lg border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stellar-blue ${
                isActive
                  ? "bg-stellar-blue text-white border-stellar-blue"
                  : "border-border text-foreground hover:bg-muted"
              }`}
            >
              {pageNum}
            </button>
          );
        })}
      </div>

      <button
        onClick={handleNextClick}
        disabled={!canGoNext}
        aria-label="Go to next page"
        className="px-3 py-2 cursor-pointer rounded-lg border border-border text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stellar-blue"
      >
        Next <ArrowRight className="w-4 h-4 inline-block ml-1" />
      </button>
    </nav>
  );
}

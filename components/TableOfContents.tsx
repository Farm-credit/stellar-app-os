"use client";

import { useCallback } from "react";
import type { TocItem } from "@/hooks/Usetableofcontents ";

type TableOfContentsProps = {
  items: TocItem[];
  activeId: string | null;
};

export function TableOfContents({ items, activeId }: TableOfContentsProps) {
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
      e.preventDefault();
      const target = document.getElementById(id);
      if (!target) return;

      target.scrollIntoView({ behavior: "smooth", block: "start" });
      window.history.pushState(null, "", `#${id}`);
      target.setAttribute("tabindex", "-1");
      target.focus({ preventScroll: true });
    },
    []
  );

  if (items.length === 0) return null;

  return (
    <nav aria-label="Table of contents">
      <p
        aria-hidden="true"
        className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3"
      >
        On this page
      </p>

      <ol role="list" className="border-l-2 border-gray-200 space-y-0.5">
        {items.map((item) => {
          const isActive = item.id === activeId;

          const indentClass =
            item.level === 1
              ? "pl-3 text-sm font-semibold"
              : item.level === 2
              ? "pl-3 text-sm"
              : item.level === 3
              ? "pl-6 text-xs"
              : "pl-9 text-xs";

          return (
            <li key={item.id} className="-ml-0.5">
              <a
                href={`#${item.id}`}
                onClick={(e) => handleClick(e, item.id)}
                aria-current={isActive ? "location" : undefined}
                className={[
                  "block py-1 leading-snug rounded-r transition-colors border-l-2 -ml-0.5",
                  indentClass,
                  isActive
                    ? "border-blue-600 text-blue-600 bg-blue-50 font-semibold"
                    : "border-transparent text-gray-500 hover:text-gray-900 hover:bg-gray-50",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
                ].join(" ")}
              >
                {item.text}
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
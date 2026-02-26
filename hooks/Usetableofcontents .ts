"use client";

import { useState, useEffect, useCallback } from "react";

export type TocItem = {
  id: string;
  text: string;
  level: number;
};

type UseTableOfContentsReturn = {
  activeId: string | null;
  tocItems: TocItem[];
};

/**
 * Extracts headings from rendered markdown content and tracks
 * which section is currently in view for TOC highlighting.
 */
export function useTableOfContents(
  contentRef: React.RefObject<HTMLElement | null>
): UseTableOfContentsReturn {
  const [tocItems, setTocItems] = useState<TocItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Extract heading elements from rendered content and build TOC
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    const headings = Array.from(
      el.querySelectorAll<HTMLHeadingElement>("h1, h2, h3, h4, h5, h6")
    );

    const items: TocItem[] = headings.map((heading) => {
      const level = parseInt(heading.tagName.replace("H", ""), 10);
      const text = heading.textContent ?? "";
      // Use existing id or generate a slug from text
      const id =
        heading.id ||
        text
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, "")
          .replace(/\s+/g, "-")
          .replace(/-+/g, "-")
          .trim();

      // Ensure the element has the id set for anchor linking
      if (!heading.id) {
        heading.id = id;
      }

      return { id, text, level };
    });

    setTocItems(items);
    if (items.length > 0) {
      setActiveId(items[0].id);
    }
  }, [contentRef]);

  // Track active section via IntersectionObserver
  const handleIntersection = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      // Find the topmost visible heading
      const visible = entries
        .filter((e) => e.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);

      if (visible.length > 0) {
        setActiveId(visible[0].target.id);
      }
    },
    []
  );

  useEffect(() => {
    const el = contentRef.current;
    if (!el || tocItems.length === 0) return;

    const observer = new IntersectionObserver(handleIntersection, {
      rootMargin: "-10% 0px -80% 0px",
      threshold: 0,
    });

    const headings = el.querySelectorAll<HTMLElement>(
      "h1, h2, h3, h4, h5, h6"
    );
    headings.forEach((h) => observer.observe(h));

    return () => observer.disconnect();
  }, [contentRef, tocItems, handleIntersection]);

  return { activeId, tocItems };
}
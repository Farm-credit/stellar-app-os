import React from "react";
import { highlightMatches } from "@/lib/search";

interface ResultHighlightProps {
  text: string;
  query: string;
  className?: string;
}

export function ResultHighlight({ text, query, className = "" }: ResultHighlightProps): React.ReactNode {
  const parts = highlightMatches(text, query);

  return (
    <span className={className}>
      {parts.map((part, idx) => (
        <React.Fragment key={idx}>
          {part.highlighted ? (
            <mark className="bg-yellow-200 dark:bg-yellow-700 font-semibold">{part.text}</mark>
          ) : (
            part.text
          )}
        </React.Fragment>
      ))}
    </span>
  );
}

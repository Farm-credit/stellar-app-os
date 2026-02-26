import React from 'react';
import Link from 'next/link';

type MarkdownRendererProps = {
  markdown: string;
  className?: string;
};

type Block =
  | { type: 'heading'; level: 1 | 2 | 3; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; items: string[] };

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function renderInline(text: string): React.ReactNode[] {
  // Links: [text](href)
  const parts: React.ReactNode[] = [];
  let remaining = text;
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/;

  while (remaining.length > 0) {
    const match = remaining.match(linkRegex);
    if (!match) {
      parts.push(applyEmphasis(remaining));
      break;
    }
    const [full, label, href] = match;
    const idx = match.index ?? 0;
    if (idx > 0) {
      parts.push(applyEmphasis(remaining.slice(0, idx)));
    }
    parts.push(
      <Link
        key={`${href}-${idx}`}
        href={href}
        className="text-sky-600 underline hover:no-underline"
      >
        {applyEmphasis(label)}
      </Link>
    );
    remaining = remaining.slice(idx + full.length);
  }
  return parts;
}

function applyEmphasis(text: string): React.ReactNode {
  // Bold: **text**, Italic: *text*
  const nodes: React.ReactNode[] = [];
  let rest = text;
  const boldOrItalic = /(\*\*[^*]+\*\*|\*[^*]+\*)/;

  while (rest.length > 0) {
    const match = rest.match(boldOrItalic);
    if (!match) {
      nodes.push(rest);
      break;
    }
    const seg = match[0];
    const idx = match.index ?? 0;
    if (idx > 0) nodes.push(rest.slice(0, idx));
    if (seg.startsWith('**')) {
      nodes.push(<strong key={`b-${idx}`}>{seg.slice(2, -2)}</strong>);
    } else {
      nodes.push(<em key={`i-${idx}`}>{seg.slice(1, -1)}</em>);
    }
    rest = rest.slice(idx + seg.length);
  }
  return <>{nodes}</>;
}

function parseMarkdown(md: string): Block[] {
  const lines = md.split(/\r?\n/);
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trimEnd();
    if (line.trim() === '') {
      i += 1;
      continue;
    }
    // Headings
    if (line.startsWith('### ')) {
      blocks.push({ type: 'heading', level: 3, text: line.slice(4).trim() });
      i += 1;
      continue;
    }
    if (line.startsWith('## ')) {
      blocks.push({ type: 'heading', level: 2, text: line.slice(3).trim() });
      i += 1;
      continue;
    }
    if (line.startsWith('# ')) {
      blocks.push({ type: 'heading', level: 1, text: line.slice(2).trim() });
      i += 1;
      continue;
    }
    // Unordered list
    if (line.match(/^[-*]\s+/)) {
      const items: string[] = [];
      let j = i;
      while (j < lines.length && lines[j].trim().match(/^[-*]\s+/)) {
        items.push(lines[j].trim().replace(/^[-*]\s+/, ''));
        j += 1;
      }
      blocks.push({ type: 'list', items });
      i = j;
      continue;
    }
    // Paragraph (merge consecutive non-empty, non-list, non-heading lines)
    const paragraphLines: string[] = [line];
    let k = i + 1;
    while (
      k < lines.length &&
      lines[k].trim() !== '' &&
      !lines[k].startsWith('#') &&
      !lines[k].trim().match(/^[-*]\s+/)
    ) {
      paragraphLines.push(lines[k].trimEnd());
      k += 1;
    }
    blocks.push({ type: 'paragraph', text: paragraphLines.join(' ') });
    i = k;
  }
  return blocks;
}

export function MarkdownRenderer({ markdown, className }: MarkdownRendererProps): React.ReactNode {
  const blocks = parseMarkdown(markdown);
  return (
    <div className={className}>
      {blocks.map((block, idx) => {
        if (block.type === 'heading') {
          const id = slugify(block.text);
          if (block.level === 1) {
            return (
              <h1 key={idx} id={id} className="text-3xl md:text-4xl font-bold mt-2 mb-6">
                {block.text}
              </h1>
            );
          }
          if (block.level === 2) {
            return (
              <h2 key={idx} id={id} className="text-2xl font-semibold mt-10 mb-4">
                {block.text}
              </h2>
            );
          }
          return (
            <h3 key={idx} id={id} className="text-xl font-semibold mt-6 mb-3">
              {block.text}
            </h3>
          );
        }
        if (block.type === 'list') {
          return (
            <ul key={idx} className="list-disc ms-5 space-y-2 my-4">
              {block.items.map((it, liIdx) => (
                <li key={liIdx} className="leading-7">
                  {renderInline(it)}
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={idx} className="text-base leading-7 my-4 text-foreground">
            {renderInline(block.text)}
          </p>
        );
      })}
    </div>
  );
}

export default MarkdownRenderer;

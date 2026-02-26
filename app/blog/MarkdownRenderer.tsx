import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';

interface MarkdownRendererProps {
  content: string;
}

function renderHeading(level: number, text: string, key: string) {
  const content = parseInlineMarkdown(text);
  if (level === 1) {
    return (
      <h1 key={key} className="text-3xl font-bold tracking-tight">
        {content}
      </h1>
    );
  }
  if (level === 2) {
    return (
      <h2 key={key} className="text-2xl font-semibold tracking-tight">
        {content}
      </h2>
    );
  }
  if (level === 3) {
    return (
      <h3 key={key} className="text-xl font-semibold">
        {content}
      </h3>
    );
  }
  if (level === 4) {
    return (
      <h4 key={key} className="text-lg font-semibold">
        {content}
      </h4>
    );
  }
  if (level === 5) {
    return (
      <h5 key={key} className="text-base font-semibold">
        {content}
      </h5>
    );
  }
  return (
    <h6
      key={key}
      className="text-sm font-semibold uppercase tracking-wide text-muted-foreground"
    >
      {content}
    </h6>
  );
}

function parseInlineMarkdown(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern =
    /\[([^\]]+)\]\((https?:\/\/[^)\s]+|\/[^)\s]*)\)|`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null = pattern.exec(text);

  while (match) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    if (match[1] && match[2]) {
      const href = match[2];
      const isExternal = href.startsWith('http://') || href.startsWith('https://');
      nodes.push(
        <Link
          key={`${href}-${match.index}`}
          href={href}
          target={isExternal ? '_blank' : undefined}
          rel={isExternal ? 'noopener noreferrer' : undefined}
          className="font-medium text-stellar-blue underline underline-offset-4 hover:opacity-90"
        >
          {match[1]}
        </Link>
      );
    } else if (match[3]) {
      nodes.push(
        <code
          key={`code-${match.index}`}
          className="rounded bg-muted px-1.5 py-0.5 text-sm text-foreground"
        >
          {match[3]}
        </code>
      );
    } else if (match[4]) {
      nodes.push(
        <strong key={`strong-${match.index}`} className="font-semibold">
          {match[4]}
        </strong>
      );
    } else if (match[5]) {
      nodes.push(
        <em key={`em-${match.index}`} className="italic">
          {match[5]}
        </em>
      );
    }

    lastIndex = pattern.lastIndex;
    match = pattern.exec(text);
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  const normalized = content.replace(/\r\n/g, '\n').trim();
  const lines = normalized.split('\n');
  const blocks: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index].trim();

    if (!line) {
      index += 1;
      continue;
    }

    if (line.startsWith('```')) {
      const codeLines: string[] = [];
      index += 1;

      while (index < lines.length && !lines[index].trim().startsWith('```')) {
        codeLines.push(lines[index]);
        index += 1;
      }

      index += 1;
      blocks.push(
        <pre key={`pre-${blocks.length}`} className="overflow-x-auto rounded-lg bg-muted p-4">
          <code className="text-sm leading-relaxed text-foreground">
            {codeLines.join('\n')}
          </code>
        </pre>
      );
      continue;
    }

    const imageMatch = line.match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/);
    if (imageMatch) {
      const [, alt, src] = imageMatch;
      blocks.push(
        <figure key={`img-${blocks.length}`} className="overflow-hidden rounded-xl border">
          <Image
            src={src}
            alt={alt || 'Blog post image'}
            width={1200}
            height={700}
            className="h-auto w-full object-cover"
          />
          {alt && (
            <figcaption className="border-t bg-muted px-3 py-2 text-sm text-muted-foreground">
              {alt}
            </figcaption>
          )}
        </figure>
      );
      index += 1;
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const headingText = headingMatch[2];
      blocks.push(renderHeading(level, headingText, `h-${blocks.length}`));
      index += 1;
      continue;
    }

    if (line.startsWith('>')) {
      const quoteLines: string[] = [];
      while (index < lines.length && lines[index].trim().startsWith('>')) {
        quoteLines.push(lines[index].trim().replace(/^>\s?/, ''));
        index += 1;
      }
      blocks.push(
        <blockquote
          key={`quote-${blocks.length}`}
          className="border-l-4 border-stellar-blue bg-secondary/40 px-4 py-2 text-muted-foreground"
        >
          {parseInlineMarkdown(quoteLines.join(' '))}
        </blockquote>
      );
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^[-*]\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^[-*]\s+/, ''));
        index += 1;
      }
      blocks.push(
        <ul key={`ul-${blocks.length}`} className="list-disc space-y-2 pl-6">
          {items.map((item, itemIndex) => (
            <li key={`ul-item-${itemIndex}`}>{parseInlineMarkdown(item)}</li>
          ))}
        </ul>
      );
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\d+\.\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^\d+\.\s+/, ''));
        index += 1;
      }
      blocks.push(
        <ol key={`ol-${blocks.length}`} className="list-decimal space-y-2 pl-6">
          {items.map((item, itemIndex) => (
            <li key={`ol-item-${itemIndex}`}>{parseInlineMarkdown(item)}</li>
          ))}
        </ol>
      );
      continue;
    }

    const paragraphLines: string[] = [];
    while (index < lines.length && lines[index].trim()) {
      const nextLine = lines[index].trim();
      if (
        nextLine.startsWith('```') ||
        /^!\[([^\]]*)\]\(([^)\s]+)\)$/.test(nextLine) ||
        /^(#{1,6})\s+/.test(nextLine) ||
        nextLine.startsWith('>') ||
        /^[-*]\s+/.test(nextLine) ||
        /^\d+\.\s+/.test(nextLine)
      ) {
        break;
      }
      paragraphLines.push(nextLine);
      index += 1;
    }

    if (paragraphLines.length > 0) {
      blocks.push(
        <p key={`p-${blocks.length}`} className="leading-8 text-foreground">
          {parseInlineMarkdown(paragraphLines.join(' '))}
        </p>
      );
      continue;
    }

    index += 1;
  }

  return (
    <div className="space-y-6 text-base" aria-label="Blog post content">
      {blocks}
    </div>
  );
}

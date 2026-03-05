/**
 * Minimal, dependency-free Markdown-to-HTML renderer.
 * Handles: headings, paragraphs, lists (ordered/unordered), bold,
 * italic, inline code, code blocks, blockquotes, horizontal rules,
 * links, and line breaks.
 *
 * All heading ids are generated as URL-safe slugs for TOC anchors.
 */

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderInline(text: string): string {
  return (
    text
      // Bold + italic
      .replace(/\*\*\*(.*?)\*\*\*/g, "<strong><em>$1</em></strong>")
      // Bold
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/__(.*?)__/g, "<strong>$1</strong>")
      // Italic
      .replace(/\*(.*?)\*/g, "<em>$1</em>")
      .replace(/_(.*?)_/g, "<em>$1</em>")
      // Inline code
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      // Links [text](url)
      .replace(
        /\[([^\]]+)\]\(([^)]+)\)/g,
        '<a href="$2" rel="noopener noreferrer">$1</a>'
      )
  );
}

type BlockToken =
  | { type: "heading"; level: number; text: string }
  | { type: "blockquote"; text: string }
  | { type: "code"; lang: string; text: string }
  | { type: "hr" }
  | { type: "ul"; items: string[][] }
  | { type: "ol"; items: string[][] }
  | { type: "paragraph"; text: string }
  | { type: "blank" };

function tokenize(markdown: string): BlockToken[] {
  // Strip frontmatter
  const stripped = markdown.replace(/^---[\s\S]*?---\n/, "");
  const lines = stripped.split("\n");
  const tokens: BlockToken[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Blank line
    if (line.trim() === "") {
      tokens.push({ type: "blank" });
      i++;
      continue;
    }

    // Fenced code block
    if (/^```/.test(line)) {
      const lang = line.replace(/^```/, "").trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // consume closing ```
      tokens.push({ type: "code", lang, text: codeLines.join("\n") });
      continue;
    }

    // ATX Heading
    const headingMatch = line.match(/^(#{1,6})\s+(.*)/);
    if (headingMatch) {
      tokens.push({
        type: "heading",
        level: headingMatch[1].length,
        text: headingMatch[2].trim(),
      });
      i++;
      continue;
    }

    // Horizontal rule
    if (/^(---|\*\*\*|___)\s*$/.test(line.trim())) {
      tokens.push({ type: "hr" });
      i++;
      continue;
    }

    // Blockquote
    if (/^>/.test(line)) {
      const quoteLines: string[] = [];
      while (i < lines.length && /^>/.test(lines[i])) {
        quoteLines.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      tokens.push({ type: "blockquote", text: quoteLines.join("\n") });
      continue;
    }

    // Unordered list
    if (/^[-*+]\s/.test(line)) {
      const items: string[][] = [];
      while (i < lines.length && /^[-*+]\s/.test(lines[i])) {
        const itemText = [lines[i].replace(/^[-*+]\s/, "")];
        i++;
        // Continuation lines (indented)
        while (i < lines.length && /^\s{2,}/.test(lines[i])) {
          itemText.push(lines[i].trim());
          i++;
        }
        items.push(itemText);
      }
      tokens.push({ type: "ul", items });
      continue;
    }

    // Ordered list
    if (/^\d+\.\s/.test(line)) {
      const items: string[][] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        const itemText = [lines[i].replace(/^\d+\.\s/, "")];
        i++;
        while (i < lines.length && /^\s{2,}/.test(lines[i])) {
          itemText.push(lines[i].trim());
          i++;
        }
        items.push(itemText);
      }
      tokens.push({ type: "ol", items });
      continue;
    }

    // Paragraph — collect until blank or block element
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^#{1,6}\s/.test(lines[i]) &&
      !/^[-*+]\s/.test(lines[i]) &&
      !/^\d+\.\s/.test(lines[i]) &&
      !/^>/.test(lines[i]) &&
      !/^```/.test(lines[i]) &&
      !/^(---|\*\*\*|___)\s*$/.test(lines[i].trim())
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      tokens.push({ type: "paragraph", text: paraLines.join(" ") });
    }
  }

  return tokens;
}

function renderTokens(tokens: BlockToken[]): string {
  const parts: string[] = [];

  for (const token of tokens) {
    switch (token.type) {
      case "blank":
        break;

      case "heading": {
        const id = slugify(token.text);
        const tag = `h${token.level}`;
        parts.push(
          `<${tag} id="${id}">${renderInline(escapeHtml(token.text))}</${tag}>`
        );
        break;
      }

      case "paragraph":
        parts.push(`<p>${renderInline(escapeHtml(token.text))}</p>`);
        break;

      case "blockquote":
        parts.push(
          `<blockquote><p>${renderInline(escapeHtml(token.text))}</p></blockquote>`
        );
        break;

      case "code":
        parts.push(
          `<pre><code class="language-${token.lang || "text"}">${escapeHtml(
            token.text
          )}</code></pre>`
        );
        break;

      case "hr":
        parts.push("<hr />");
        break;

      case "ul": {
        const listItems = token.items
          .map((lines) => `<li>${renderInline(escapeHtml(lines.join(" ")))}</li>`)
          .join("");
        parts.push(`<ul>${listItems}</ul>`);
        break;
      }

      case "ol": {
        const listItems = token.items
          .map((lines) => `<li>${renderInline(escapeHtml(lines.join(" ")))}</li>`)
          .join("");
        parts.push(`<ol>${listItems}</ol>`);
        break;
      }
    }
  }

  return parts.join("\n");
}

/**
 * Converts a Markdown string to an HTML string.
 * Safe for use with dangerouslySetInnerHTML on trusted content.
 */
export function markdownToHtml(markdown: string): string {
  const tokens = tokenize(markdown);
  return renderTokens(tokens);
}

/**
 * Extracts the lastUpdated frontmatter value if present.
 * Returns null if not found.
 */
export function extractLastUpdated(markdown: string): string | null {
  const match = markdown.match(/^---[\s\S]*?lastUpdated:\s*"?([^"\n]+)"?[\s\S]*?---/);
  return match ? match[1].trim() : null;
}
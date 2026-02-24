import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { Text } from '@/components/atoms/Text';

export const metadata: Metadata = {
  title: 'Privacy Policy | FarmCredit',
  description:
    'GDPR-compliant privacy policy explaining data collection, use, sharing, user rights, and cookies for FarmCredit.',
};

const LAST_UPDATED = 'February 24, 2026';

type InlineNode =
  | { kind: 'text'; value: string }
  | { kind: 'strong'; value: string }
  | { kind: 'em'; value: string }
  | { kind: 'link'; text: string; href: string };

type BlockNode =
  | { kind: 'heading'; level: number; text: string; id: string }
  | { kind: 'paragraph'; inlines: InlineNode[] }
  | { kind: 'ul'; items: InlineNode[][] }
  | { kind: 'ol'; items: InlineNode[][] };

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function parseInlines(text: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  let i = 0;
  while (i < text.length) {
    const linkMatch = text.slice(i).match(/^\[([^\]]+)\]\(([^)]+)\)/);
    if (linkMatch) {
      nodes.push({ kind: 'link', text: linkMatch[1], href: linkMatch[2] });
      i += linkMatch[0].length;
      continue;
    }
    const strongMatch = text.slice(i).match(/^\*\*([^*]+)\*\*/);
    if (strongMatch) {
      nodes.push({ kind: 'strong', value: strongMatch[1] });
      i += strongMatch[0].length;
      continue;
    }
    const emMatch = text.slice(i).match(/^\*([^*]+)\*/);
    if (emMatch) {
      nodes.push({ kind: 'em', value: emMatch[1] });
      i += emMatch[0].length;
      continue;
    }
    const nextSpecial = text.slice(i).search(/\[|\*{1,2}/);
    if (nextSpecial === -1) {
      nodes.push({ kind: 'text', value: text.slice(i) });
      break;
    } else {
      const segment = text.slice(i, i + nextSpecial);
      nodes.push({ kind: 'text', value: segment });
      i += nextSpecial;
    }
  }
  return nodes;
}

function tokenize(md: string): BlockNode[] {
  const lines = md.split(/\r?\n/);
  const blocks: BlockNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^\s*$/.test(line)) {
      i += 1;
      continue;
    }
    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = headingMatch[2].trim();
      blocks.push({ kind: 'heading', level, text, id: slugify(text) });
      i += 1;
      continue;
    }
    if (/^\s*-\s+/.test(line)) {
      const items: InlineNode[][] = [];
      // eslint-disable-next-line no-constant-condition
      while (i < lines.length && /^\s*-\s+/.test(lines[i])) {
        const itemText = lines[i].replace(/^\s*-\s+/, '').trim();
        items.push(parseInlines(itemText));
        i += 1;
      }
      blocks.push({ kind: 'ul', items });
      continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: InlineNode[][] = [];
      // eslint-disable-next-line no-constant-condition
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        const itemText = lines[i].replace(/^\s*\d+\.\s+/, '').trim();
        items.push(parseInlines(itemText));
        i += 1;
      }
      blocks.push({ kind: 'ol', items });
      continue;
    }
    const paraLines: string[] = [];
    // eslint-disable-next-line no-constant-condition
    while (i < lines.length && !/^\s*$/.test(lines[i]) && !/^(#{1,6})\s+/.test(lines[i]) && !/^\s*-\s+/.test(lines[i]) && !/^\s*\d+\.\s+/.test(lines[i])) {
      paraLines.push(lines[i].trim());
      i += 1;
    }
    const paraText = paraLines.join(' ');
    blocks.push({ kind: 'paragraph', inlines: parseInlines(paraText) });
  }
  return blocks;
}

function renderInlineNodes(nodes: InlineNode[], keyPrefix: string): ReactNode[] {
  return nodes.map((node, idx) => {
    const key = `${keyPrefix}-${idx}`;
    if (node.kind === 'text') {
      return node.value;
    }
    if (node.kind === 'strong') {
      return <strong key={key}>{node.value}</strong>;
    }
    if (node.kind === 'em') {
      return <em key={key}>{node.value}</em>;
    }
    return (
      <Link key={key} href={node.href} className="text-stellar-blue underline underline-offset-4 hover:no-underline">
        {node.text}
      </Link>
    );
  });
}

function Markdown({ source }: { source: string }): ReactNode {
  const blocks = tokenize(source);
  return (
    <div className="prose prose-slate max-w-none dark:prose-invert prose-headings:scroll-mt-24">
      {blocks.map((block, idx) => {
        if (block.kind === 'heading') {
          const level = block.level;
          const content = block.text;
          if (level === 1) {
            return (
              <Text key={block.id} as="h1" variant="h1" id={block.id} className="mb-4">
                {content}
              </Text>
            );
          }
          if (level === 2) {
            return (
              <Text key={block.id} as="h2" variant="h2" id={block.id} className="mt-8 mb-3">
                {content}
              </Text>
            );
          }
          if (level === 3) {
            return (
              <Text key={block.id} as="h3" variant="h3" id={block.id} className="mt-6 mb-2">
                {content}
              </Text>
            );
          }
          return (
            <Text key={block.id} as="h4" variant="h4" id={block.id} className="mt-4 mb-2">
              {content}
            </Text>
          );
        }
        if (block.kind === 'paragraph') {
          return (
            <Text key={idx} as="p" variant="body" className="mb-4">
              {renderInlineNodes(block.inlines, `p-${idx}`)}
            </Text>
          );
        }
        if (block.kind === 'ul') {
          return (
            <ul key={idx} className="list-disc ps-6 mb-4">
              {block.items.map((item, i) => (
                <li key={i} className="mb-1">
                  {renderInlineNodes(item, `ul-${idx}-${i}`)}
                </li>
              ))}
            </ul>
          );
        }
        return (
          <ol key={idx} className="list-decimal ps-6 mb-4">
            {block.items.map((item, i) => (
              <li key={i} className="mb-1">
                {renderInlineNodes(item, `ol-${idx}-${i}`)}
              </li>
            ))}
          </ol>
        );
      })}
    </div>
  );
}

const PRIVACY_MD = `# Privacy Policy

Last updated: ${LAST_UPDATED}

Welcome to FarmCredit. We respect your privacy and process personal data in compliance with the EU General Data Protection Regulation (GDPR).

## Data Controller
- FarmCredit
- Email: [privacy@farmcredit.com](mailto:privacy@farmcredit.com)

## Data We Collect {#data-collection}
- Account data (name, email)
- Wallet/public key and transaction metadata
- Usage data (device, browser, interactions)
- Support communications

## How We Use Your Data {#data-usage}
- Provide and improve our services
- Process transactions and fulfill requests
- Secure our platform and prevent fraud
- Communicate updates and respond to inquiries
- Comply with legal obligations

## Legal Bases for Processing
- Contract performance
- Legitimate interests (security, product improvement)
- Consent (where required)
- Legal obligations

## Sharing Your Data {#data-sharing}
- Service providers under strict data processing agreements
- Compliance with law and requests from competent authorities
- Business transfers in case of merger or acquisition
We do not sell personal data.

## International Transfers
Where transfers occur outside your jurisdiction, we rely on appropriate safeguards (e.g., Standard Contractual Clauses).

## Data Retention
We retain data only as long as necessary for the purposes described above or as required by law.

## Your Rights {#user-rights}
- Access, rectification, and erasure
- Restriction and objection to processing
- Data portability
- Withdrawal of consent (where applicable)
- Lodge a complaint with a supervisory authority
To exercise rights, email [privacy@farmcredit.com](mailto:privacy@farmcredit.com).

## Cookies and Similar Technologies {#cookies}
We use cookies to provide essential functionality, enhance performance, and analyze usage.

### Types of Cookies
- Strictly necessary: Required for core functionality
- Performance/analytics: Measure usage and improve the product
- Preference: Remember your settings

### Managing Cookies
You can manage cookies in your browser settings. Some features may not function without certain cookies.

## Security
We implement technical and organizational measures to protect personal data. No method of transmission is 100% secure.

## Children’s Privacy
Our services are not directed to children under the age of 16. We do not knowingly collect data from children.

## Changes to This Policy
We may update this Privacy Policy. Material changes will be communicated through the app or by email.

## Contact
For questions or requests regarding this policy, contact [privacy@farmcredit.com](mailto:privacy@farmcredit.com).`;

export default function PrivacyPage(): ReactNode {
  return (
    <main className="container mx-auto px-4 py-8 max-w-3xl">
      <header className="mb-6">
        <Text as="h1" variant="h2" className="mb-2">
          Privacy Policy
        </Text>
        <Text as="p" variant="muted">
          Last updated: {LAST_UPDATED}
        </Text>
      </header>
      <nav aria-label="On this page" className="mb-6">
        <ul className="flex flex-wrap gap-3 text-sm">
          <li>
            <Link href="#data-collection" className="text-stellar-blue underline underline-offset-4 hover:no-underline">
              Data collection
            </Link>
          </li>
          <li>
            <Link href="#data-usage" className="text-stellar-blue underline underline-offset-4 hover:no-underline">
              Usage
            </Link>
          </li>
          <li>
            <Link href="#data-sharing" className="text-stellar-blue underline underline-offset-4 hover:no-underline">
              Sharing
            </Link>
          </li>
          <li>
            <Link href="#user-rights" className="text-stellar-blue underline underline-offset-4 hover:no-underline">
              Your rights
            </Link>
          </li>
          <li>
            <Link href="#cookies" className="text-stellar-blue underline underline-offset-4 hover:no-underline">
              Cookie policy
            </Link>
          </li>
        </ul>
      </nav>
      <Markdown source={PRIVACY_MD} />
    </main>
  );
}


import type { ReactNode } from 'react';
import { type Metadata } from 'next';
import MarkdownRenderer from '@/components/molecules/MarkdownRenderer';

export const metadata: Metadata = {
  title: 'Privacy Policy | FarmCredit',
  description:
    'Learn how FarmCredit collects, uses, and protects your personal data, your rights under GDPR, and our cookie practices.',
};

const LAST_UPDATED = 'February 25, 2026';

const POLICY_MD = `# Privacy Policy

Last updated: ${LAST_UPDATED}

We value your privacy. This Privacy Policy explains how FarmCredit ("we", "our", "us") collects, uses, shares, and protects your information when you use our website and services.

## What Data We Collect
- Account information (e.g., name, email)
- Wallet and transaction metadata necessary to facilitate on-chain operations
- Usage data (pages viewed, actions taken, device and browser information)
- Cookies and similar technologies (see Cookies section)

## Legal Bases for Processing
- Consent (e.g., newsletter, certain analytics)
- Contractual necessity (providing requested services and features)
- Legitimate interests (security, fraud prevention, product improvement)
- Legal obligation (compliance with applicable laws)

## How We Use Your Data
- To provide and improve our services
- To process transactions and provide confirmations
- To communicate service updates and respond to inquiries
- To personalize content and measure performance
- To ensure security, prevent fraud, and maintain reliability

## How We Share Data
- Service providers that help operate our services (under contract and confidentiality)
- Compliance with legal requests, court orders, or to enforce our terms
- Business transfers (e.g., merger, acquisition) with appropriate safeguards
- We do not sell your personal data

## Data Retention
We retain personal data only as long as necessary for the purposes described above or as required by law. When no longer needed, data is securely deleted or anonymized.

## International Transfers
If personal data is transferred outside your jurisdiction, we implement appropriate safeguards (e.g., standard contractual clauses) to protect your information.

## Your Rights (GDPR)
- Access your personal data
- Rectify inaccurate or incomplete data
- Erase your data ("right to be forgotten")
- Restrict or object to processing
- Data portability
- Withdraw consent where processing is based on consent
- Lodge a complaint with your local supervisory authority

To exercise your rights, please contact us (see Contact section).

## Security
We implement technical and organizational measures to protect your information against unauthorized access, loss, or misuse. No system is 100% secure; please use strong passwords and keep your credentials safe.

## Cookies and Similar Technologies
We use cookies and similar technologies to:
- Remember your preferences and session state
- Enable core functionality (e.g., authentication flows)
- Analyze usage to improve the product (where consented)

Types of cookies:
- Strictly necessary: essential for core features
- Functional: enhance experience and preferences
- Analytics: help us understand usage trends (only with consent)

Controls:
- You can manage cookies in your browser settings
- Where required, we present consent controls to enable/disable non-essential cookies

## Contact Us
If you have questions, requests, or privacy-related inquiries, contact us at:
- Email: [privacy@farmcredit.io](mailto:privacy@farmcredit.io)

We will respond to your request in accordance with applicable laws.
`;

export default function PrivacyPage(): ReactNode {
  return (
    <main
      role="main"
      className="container mx-auto max-w-3xl px-4 py-10 sm:py-12"
      aria-labelledby="privacy-policy"
    >
      <MarkdownRenderer
        markdown={POLICY_MD}
        className="prose prose-neutral dark:prose-invert max-w-none"
      />
      <div className="mt-8 text-sm text-muted-foreground" aria-live="polite">
        Last updated: {LAST_UPDATED}
      </div>
    </main>
  );
}

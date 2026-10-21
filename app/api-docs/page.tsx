import type { Metadata } from 'next';
import Link from 'next/link';
import { ApiDocumentationClient } from '@/components/organisms/ApiDocumentation/ApiDocumentationClient';

export const metadata: Metadata = {
  title: 'API Documentation | FarmCredit',
  description:
    'FarmCredit API reference with endpoint details, including the farmer income prediction endpoint for carbon projects, blockchain-based tree ownership records on Stellar (transaction hashes, ownership history ledger, and on-chain sponsorship transfers), request/response examples, authentication guidance (OAuth2 and API key), and rate limits. Explore the versioned public v1 API for third-party integrations, download the OpenAPI 3.0 spec, and manage your quota via the dashboard.',
};

const publicApiLinks = [
  {
    href: '/api-docs/v1',
    label: 'Public API v1 Reference',
    description: 'Versioned REST API for third-party integrations: tree data, sponsorships, and webhooks.',
  },
  {
    href: '/api-docs/openapi.json',
    label: 'OpenAPI 3.0 Spec',
    description: 'Download the machine-readable OpenAPI specification for the public v1 API.',
  },
  {
    href: '/api-docs/quota',
    label: 'Quota Dashboard',
    description: 'Monitor your rate limits, usage, and remaining quota.',
  },
];

export default function ApiDocumentationPage() {
  return (
    <>
      <nav aria-label="Public API resources" className="mx-auto max-w-5xl px-4 pt-8">
        <ul className="grid gap-4 sm:grid-cols-3">
          {publicApiLinks.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className="block h-full rounded-lg border border-gray-200 p-4 transition hover:border-green-600 hover:shadow-sm"
              >
                <span className="block font-semibold text-green-700">{link.label}</span>
                <span className="mt-1 block text-sm text-gray-600">{link.description}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <ApiDocumentationClient />
    </>
  );
}
import type { Metadata } from 'next';
import { SwaggerUIClient } from '@/components/organisms/ApiDocumentation/SwaggerUIClient';

export const metadata: Metadata = {
  title: 'Interactive Swagger UI & Live API Console | FarmCredit',
  description:
    'Interactive Swagger UI for Stellar App OS REST API. Test endpoints live with full try-it-out request builder and OpenAPI spec viewer.',
};

export default function SwaggerDocsPage() {
  return <SwaggerUIClient />;
}

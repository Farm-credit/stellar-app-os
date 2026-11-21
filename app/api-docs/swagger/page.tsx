import type { Metadata } from 'next';
import { SwaggerUIClient } from '@/components/organisms/ApiDocumentation/SwaggerUIClient';
import { FarmerIncomePredictionClient } from '@/components/organisms/ApiDocumentation/FarmerIncomePredictionClient';
import { BuyerComplianceReportingClient } from '@/components/organisms/ApiDocumentation/BuyerComplianceReportingClient';

export const metadata: Metadata = {
  title: 'Interactive Swagger UI & Live API Console | FarmCredit',
  description:
    'Interactive Swagger UI for Stellar App OS REST API. Test endpoints live with full try-it-out request builder and OpenAPI spec viewer.',
};

const PUBLIC_V1_OPENAPI_SPEC_URL = '/api/public/v1/openapi.json';

export default function SwaggerDocsPage() {
  return (
    <>
      <SwaggerUIClient specUrl={PUBLIC_V1_OPENAPI_SPEC_URL} />
      <FarmerIncomePredictionClient />
      <BuyerComplianceReportingClient />
    </>
  );
}
import type { Metadata } from 'next';
import { PartnerCertificationForm } from '@/components/organisms/PartnerCertificationForm/PartnerCertificationForm';

export const metadata: Metadata = {
  title: 'Partner planting certification',
  description:
    'Apply for platform certification verifying your species selection, survival monitoring and reporting standards.',
};

export default function PartnerCertificationPage() {
  return (
    <main className="min-h-screen bg-background px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-3xl font-bold tracking-tight">Partner planting certification</h1>
        <p className="mb-8 mt-3 text-muted-foreground">
          Certified partners display a badge on their profile and projects. Applications are
          reviewed by the platform team against standards for species selection, survival monitoring
          and reporting.
        </p>
        <PartnerCertificationForm />
      </div>
    </main>
  );
}

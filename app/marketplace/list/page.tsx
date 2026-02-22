import type { Metadata } from 'next';
import { Text } from "@/components/atoms/Text";
import { ListCreditForm } from "@/components/organisms/ListCreditForm/ListCreditForm";

export const metadata: Metadata = {
  title: 'List Credits for Sale | Stellar Farm Credit',
  description: 'List your farm credits for sale in the marketplace',
};

export default function ListCreditPage() {
  return (
    <div className="min-h-screen bg-background py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <Text variant="h1" as="h1" className="mb-2">
            List Credits for Sale
          </Text>
          <Text variant="muted" as="p">
            Create a listing to sell your farm credits in the marketplace
          </Text>
        </div>
        
        <ListCreditForm />
      </div>
    </div>
  );
}
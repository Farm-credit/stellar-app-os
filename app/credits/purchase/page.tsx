"use client";

import { CreditSelectionStep } from "@/components/organisms/CreditSelectionStep/CreditSelectionStep";
import { mockCarbonProjects } from "@/lib/api/mock/carbonProjects";
import type { CreditSelectionState } from "@/lib/types/carbon";

export default function PurchasePage() {
  const handleSelectionChange = (selection: CreditSelectionState) => {
    console.log("Selection changed:", selection);
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <CreditSelectionStep
        projects={mockCarbonProjects}
        onSelectionChange={handleSelectionChange}
      />
    </div>
  );
}

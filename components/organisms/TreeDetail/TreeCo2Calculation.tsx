import { Calculator } from 'lucide-react';
import { Text } from '@/components/atoms/Text';
import { Co2MethodologyLink } from '@/components/molecules/Co2MethodologyLink';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/molecules/Card';
import type { TreeSequestration } from '@/lib/carbon/ipcc-tier1';

interface TreeCo2CalculationProps {
  sequestration: TreeSequestration;
}

/** Shows the inputs behind a tree's CO₂ figures: species, climate zone and age (#1699). */
export function TreeCo2Calculation({ sequestration }: TreeCo2CalculationProps) {
  const { inputs, parameters, size } = sequestration;
  const rows: Array<[string, string]> = [
    ['Species', inputs.species],
    ['Climate zone', inputs.climateZone],
    ['Age', inputs.plantedAt ? `${inputs.ageYears.toFixed(1)} years` : 'Not planted yet'],
    ['Wood density', `${parameters.woodDensity} g/cm³`],
    ['Estimated size', `${size.dbhCm.toFixed(1)} cm DBH, ${size.heightM.toFixed(1)} m tall`],
    ['Root-to-shoot ratio', String(parameters.rootToShootRatio)],
  ];

  return (
    <Card className="sm:col-span-2">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Calculator className="h-4 w-4 text-stellar-green" aria-hidden />
          CO₂ calculation
        </CardTitle>
        <CardDescription>
          IPCC Tier 1 estimate. It updates automatically as the tree ages.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Text variant="muted" className="text-sm">
              Next 12 months
            </Text>
            <Text className="text-lg font-semibold">
              {sequestration.annualCo2Kg.toFixed(1)} kg CO₂
            </Text>
          </div>
          <div>
            <Text variant="muted" className="text-sm">
              Stored to date
            </Text>
            <Text className="text-lg font-semibold">
              {sequestration.cumulativeCo2Kg.toFixed(1)} kg CO₂
            </Text>
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
          {rows.map(([label, value]) => (
            <div key={label}>
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="font-medium capitalize">{value}</dd>
            </div>
          ))}
        </dl>
        <Co2MethodologyLink />
      </CardContent>
    </Card>
  );
}

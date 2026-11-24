import type { Metadata } from 'next';
import Link from 'next/link';
import {
  CARBON_FRACTION,
  CHAVE_2014,
  CLIMATE_ZONES,
  ROOT_TO_SHOOT_RATIO,
  SPECIES_ALLOMETRY,
  annualSequestrationKg,
  cumulativeCo2Kg,
} from '@/lib/carbon/ipcc-tier1';
import { CLIMATE_FACTORS, TREE_SPECIES } from '@/lib/constants/species';

export const metadata: Metadata = {
  title: 'Tree CO₂ Sequestration Methodology (IPCC Tier 1) | Farm-credit',
  description:
    'How Farm-credit estimates the CO₂ stored by each tree: IPCC Tier 1 defaults with the Chave et al. (2014) allometric equation, by species, climate zone and age.',
};

const EXAMPLE_AGES = [1, 5, 10, 20];

export default function IpccTier1MethodologyPage() {
  return (
    <main className="container mx-auto max-w-4xl space-y-10 px-4 py-8 sm:px-6 lg:px-8">
      <header className="space-y-3">
        <Link href="/methodologies" className="text-sm text-muted-foreground hover:text-foreground">
          ← All methodologies
        </Link>
        <h1 className="text-3xl font-bold">Tree CO₂ sequestration: IPCC Tier 1</h1>
        <p className="text-muted-foreground">
          Every CO₂ figure shown for an individual tree is an estimate from the method below. It
          uses published equations and IPCC default factors, takes only the tree&apos;s species,
          climate zone and age as inputs, and is recalculated as the tree ages.
        </p>
      </header>

      <section aria-labelledby="steps" className="space-y-3">
        <h2 id="steps" className="text-xl font-semibold">
          How a figure is calculated
        </h2>
        <ol className="list-decimal space-y-2 pl-6">
          <li>
            <strong>Size at age.</strong> Diameter at breast height (D, cm) and height (H, m) grow
            towards the species&apos; mature size: <code>D = Dmax · (1 − e^(−k·t))²</code> and{' '}
            <code>H = Hmax · (1 − e^(−k·t))</code>, where <code>k = 3 / maturity years</code> and{' '}
            <code>t</code> is the tree&apos;s age multiplied by the climate zone growth factor.
          </li>
          <li>
            <strong>Above-ground biomass.</strong> Chave et al. (2014) pantropical equation:{' '}
            <code>
              AGB (kg) = {CHAVE_2014.a} · (ρ · D² · H)^{CHAVE_2014.b}
            </code>
            , with ρ the wood density in g/cm³.
          </li>
          <li>
            <strong>Total biomass.</strong> <code>AGB · (1 + R)</code>, where R is the IPCC
            root-to-shoot ratio for the climate zone.
          </li>
          <li>
            <strong>Carbon.</strong> Total biomass × {CARBON_FRACTION} (IPCC default carbon fraction
            of dry biomass).
          </li>
          <li>
            <strong>CO₂.</strong> Carbon × 44/12.
          </li>
        </ol>
        <p>
          The <em>next 12 months</em> figure is the CO₂ stored at age + 1 year minus the CO₂ stored
          at the current age, so it changes every year as the tree grows. The profile page is
          refreshed daily.
        </p>
      </section>

      <section aria-labelledby="zones" className="space-y-3">
        <h2 id="zones" className="text-xl font-semibold">
          Climate zones
        </h2>
        <p>
          A tree record can set its climate zone. When it does not, we infer it from latitude:
          mangroves are <em>coastal</em>; otherwise tropical up to 23.5°, subtropical up to 35° and
          temperate beyond.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b">
                <th className="py-2 pr-4">Zone</th>
                <th className="py-2 pr-4">Growth factor</th>
                <th className="py-2">Root-to-shoot ratio (R)</th>
              </tr>
            </thead>
            <tbody>
              {CLIMATE_ZONES.map((zone) => (
                <tr key={zone} className="border-b">
                  <td className="py-2 pr-4 capitalize">{zone}</td>
                  <td className="py-2 pr-4">{CLIMATE_FACTORS[zone]}</td>
                  <td className="py-2">{ROOT_TO_SHOOT_RATIO[zone]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="species" className="space-y-3">
        <h2 id="species" className="text-xl font-semibold">
          Species inputs and worked examples
        </h2>
        <p>
          Cumulative CO₂ per tree in kg for a tropical-zone tree at each age. Species sizes are
          conservative smallholder-plantation values, set so the average yearly rate over the
          maturity period matches the per-species rate we already publish.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b">
                <th className="py-2 pr-4">Species</th>
                <th className="py-2 pr-4">ρ (g/cm³)</th>
                <th className="py-2 pr-4">Dmax (cm)</th>
                <th className="py-2 pr-4">Hmax (m)</th>
                <th className="py-2 pr-4">Maturity (yr)</th>
                {EXAMPLE_AGES.map((age) => (
                  <th key={age} className="py-2 pr-4">
                    {age} yr
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {TREE_SPECIES.map((species) => {
                const a = SPECIES_ALLOMETRY[species.slug];
                return (
                  <tr key={species.slug} className="border-b">
                    <td className="py-2 pr-4">{species.name}</td>
                    <td className="py-2 pr-4">{a.woodDensity}</td>
                    <td className="py-2 pr-4">{a.dbhMaxCm}</td>
                    <td className="py-2 pr-4">{a.heightMaxM}</td>
                    <td className="py-2 pr-4">{species.maturityYears}</td>
                    {EXAMPLE_AGES.map((age) => (
                      <td key={age} className="py-2 pr-4">
                        {cumulativeCo2Kg(species.name, 'tropical', age).toFixed(1)}
                        <span className="text-muted-foreground">
                          {' '}
                          (+{annualSequestrationKg(species.name, 'tropical', age).toFixed(1)}/yr)
                        </span>
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="limits" className="space-y-3">
        <h2 id="limits" className="text-xl font-semibold">
          Limits of this estimate
        </h2>
        <ul className="list-disc space-y-2 pl-6">
          <li>
            Tier 1 uses default factors, not measurements of the individual tree, so figures are
            estimates and not verified carbon credits.
          </li>
          <li>
            The Chave et al. equation was fitted on pantropical trees. Bamboo and other
            non-woody-stem species are approximated with the same equation.
          </li>
          <li>
            Survival, pests, fire and harvest are not modelled. A tree marked failed stops counting
            once its status is updated.
          </li>
        </ul>
      </section>

      <section aria-labelledby="refs" className="space-y-3">
        <h2 id="refs" className="text-xl font-semibold">
          References
        </h2>
        <ul className="list-disc space-y-2 pl-6 text-sm">
          <li>
            Chave, J. et al. (2014). Improved allometric models to estimate the aboveground biomass
            of tropical trees. <em>Global Change Biology</em> 20(10), 3177–3190.
          </li>
          <li>
            IPCC (2006). <em>Guidelines for National Greenhouse Gas Inventories</em>, Volume 4
            (AFOLU), Chapter 4: Forest Land. Default carbon fraction and root-to-shoot ratios.
          </li>
          <li>Zanne, A. E. et al. (2009). Global wood density database. Dryad.</li>
        </ul>
      </section>
    </main>
  );
}

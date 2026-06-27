-- Migration: 002_create_species_catalogue.sql
-- Stores FAO/IPCC Tier-1 biomass CO₂ sequestration rates per tree species.
-- Populated by scripts/seed-species.mjs from data/fao_co2_rates.csv.

CREATE TABLE IF NOT EXISTS species_catalogue (
  -- Unique short identifier, e.g. 'teak', 'moringa' (matches CSV slug column)
  slug                TEXT        PRIMARY KEY,

  -- Human-readable common name, e.g. "Teak"
  common_name         TEXT        NOT NULL,

  -- Scientific / Latin name, e.g. "Tectona grandis"
  scientific_name     TEXT        NOT NULL,

  -- Average kg of CO₂ sequestered per tree per year (FAO Tier-1 estimate)
  co2_kg_per_year     NUMERIC(10, 2) NOT NULL CHECK (co2_kg_per_year > 0),

  -- Approximate years to reach biomass maturity
  maturity_years      INTEGER     NOT NULL CHECK (maturity_years > 0),

  -- Typical biome / planting region
  biome               TEXT        NOT NULL,

  -- ISO 3166-1 alpha-2 codes of primary planting countries (comma-separated)
  native_regions      TEXT        NOT NULL,

  -- Data source reference (e.g. "FAO FRA 2020", "IPCC 2006 Vol4 Ch4")
  source_ref          TEXT        NOT NULL DEFAULT 'FAO FRA 2020',

  -- Seeded / last updated timestamp
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Allow fast lookup by biome for regional filtering
CREATE INDEX IF NOT EXISTS idx_sc_biome ON species_catalogue (biome);

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

-- ---------------------------------------------------------------------------
-- Native plant seed distribution tracking module
-- Tracks collection, storage, and distribution of native plant seeds from
-- seed banks to nurseries to planting sites, ensuring provenance transparency.
-- ---------------------------------------------------------------------------

-- Seed banks operated by partner organisations
CREATE TABLE IF NOT EXISTS seed_banks (
  -- Unique identifier for the seed bank
  id                  BIGSERIAL   PRIMARY KEY,

  -- Partner organisation operating the seed bank
  partner_org         TEXT        NOT NULL,

  -- Human-readable seed bank name
  name                TEXT        NOT NULL,

  -- Location details
  location            TEXT        NOT NULL,
  country_code        CHAR(2)     NOT NULL,

  -- Storage capacity in kilograms of seed
  capacity_kg         NUMERIC(12, 2) NOT NULL CHECK (capacity_kg >= 0),

  -- Contact / reference details
  contact_email       TEXT,

  -- Lifecycle timestamps
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Allow fast lookup of seed banks by partner organisation and country
CREATE INDEX IF NOT EXISTS idx_sb_partner_org ON seed_banks (partner_org);
CREATE INDEX IF NOT EXISTS idx_sb_country ON seed_banks (country_code);

-- Seed batches tracked from collection through to planting
CREATE TABLE IF NOT EXISTS seed_batches (
  -- Unique identifier for the seed batch
  id                  BIGSERIAL   PRIMARY KEY,

  -- Species this batch belongs to (provenance link to species catalogue)
  species_slug        TEXT        NOT NULL REFERENCES species_catalogue (slug),

  -- Seed bank currently holding the batch
  seed_bank_id        BIGINT      NOT NULL REFERENCES seed_banks (id),

  -- Where the seed was collected (site / provenance origin)
  collection_site     TEXT        NOT NULL,

  -- When the seed was collected
  collected_at        TIMESTAMPTZ NOT NULL,

  -- Quantity of seed in the batch (kilograms)
  quantity_kg         NUMERIC(12, 3) NOT NULL CHECK (quantity_kg > 0),

  -- Physical storage location within the seed bank
  storage_location    TEXT,

  -- Lifecycle status: collection -> storage -> distribution -> planting
  status              TEXT        NOT NULL DEFAULT 'collection'
                      CHECK (status IN ('collection', 'storage', 'distribution', 'planting')),

  -- Lifecycle timestamps
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Allow fast lookup of batches by species, seed bank, and status
CREATE INDEX IF NOT EXISTS idx_sbat_species ON seed_batches (species_slug);
CREATE INDEX IF NOT EXISTS idx_sbat_seed_bank ON seed_batches (seed_bank_id);
CREATE INDEX IF NOT EXISTS idx_sbat_status ON seed_batches (status);

-- Distribution of seed batches from seed banks to nurseries / planting sites
CREATE TABLE IF NOT EXISTS seed_distributions (
  -- Unique identifier for the distribution record
  id                  BIGSERIAL   PRIMARY KEY,

  -- Seed batch being distributed
  batch_id            BIGINT      NOT NULL REFERENCES seed_batches (id),

  -- Receiving nursery
  nursery             TEXT        NOT NULL,

  -- Planting site where the seed (or resulting seedlings) will be planted
  planting_site       TEXT        NOT NULL,

  -- Quantity distributed (kilograms)
  quantity_kg         NUMERIC(12, 3) NOT NULL CHECK (quantity_kg > 0),

  -- When the seed was distributed to the nursery
  distributed_at      TIMESTAMPTZ NOT NULL,

  -- When the seed / seedlings were planted at the planting site
  planted_at          TIMESTAMPTZ,

  -- Lifecycle timestamps
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Allow fast lookup of distributions by batch and nursery
CREATE INDEX IF NOT EXISTS idx_sd_batch ON seed_distributions (batch_id);
CREATE INDEX IF NOT EXISTS idx_sd_nursery ON seed_distributions (nursery);
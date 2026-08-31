-- Migration 011: Research tables for climate impact study (Issue #1154)
-- Stores field measurements, satellite metrics, and correction factors
-- for comparing real-world CO2 sequestration against FAO/IPCC Tier-1 estimates.

BEGIN;

-- Research plot locations and conditions
CREATE TABLE IF NOT EXISTS research_plots (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plot_code     VARCHAR(20) NOT NULL UNIQUE,
  species_slug  VARCHAR(50) NOT NULL REFERENCES species_catalogue(slug),
  region        VARCHAR(100) NOT NULL,
  biome         VARCHAR(100) NOT NULL,
  lat           DOUBLE PRECISION NOT NULL,
  lon           DOUBLE PRECISION NOT NULL,
  elevation_m   REAL,
  soil_type     VARCHAR(50),
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- Individual tree samples within plots
CREATE TABLE IF NOT EXISTS research_samples (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plot_id           UUID NOT NULL REFERENCES research_plots(id),
  tree_id           UUID REFERENCES trees(id),
  sample_date       DATE NOT NULL,
  dbh_cm            REAL,
  height_m          REAL,
  crown_diameter_m  REAL,
  bark_thickness_mm REAL,
  wood_density_g_cm3 REAL,
  soil_moisture_pct REAL,
  biomass_kg        REAL,
  carbon_kg         REAL,
  co2_kg            REAL,
  measurement_method VARCHAR(20) CHECK (measurement_method IN ('allometric', 'destructive', 'satellite')),
  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT now()
);

-- Satellite-derived metrics per tree
CREATE TABLE IF NOT EXISTS research_satellite_metrics (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tree_id         UUID REFERENCES trees(id),
  capture_date    DATE NOT NULL,
  ndvi            REAL,
  evi             REAL,
  savi            REAL,
  sar_backscatter REAL,
  gedi_agb        REAL,
  source          VARCHAR(50) NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tree_id, capture_date, source)
);

-- Study-wide correction factors derived from analysis
CREATE TABLE IF NOT EXISTS research_correction_factors (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  species_slug              VARCHAR(50) NOT NULL REFERENCES species_catalogue(slug),
  region                    VARCHAR(100) NOT NULL,
  age_class                 VARCHAR(20) NOT NULL,
  tier1_co2_kg_yr           REAL NOT NULL,
  measured_co2_kg_yr        REAL NOT NULL,
  correction_factor         REAL NOT NULL,
  confidence_interval_lower REAL,
  confidence_interval_upper REAL,
  sample_size               INT NOT NULL,
  p_value                   REAL,
  study_phase               VARCHAR(20) NOT NULL CHECK (study_phase IN ('pilot', 'published', 'peer_reviewed')),
  published_at              TIMESTAMPTZ,
  created_at                TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_research_samples_plot ON research_samples(plot_id);
CREATE INDEX IF NOT EXISTS idx_research_samples_tree ON research_samples(tree_id);
CREATE INDEX IF NOT EXISTS idx_research_samples_date ON research_samples(sample_date);
CREATE INDEX IF NOT EXISTS idx_research_satellite_tree ON research_satellite_metrics(tree_id);
CREATE INDEX IF NOT EXISTS idx_research_satellite_date ON research_satellite_metrics(capture_date);
CREATE INDEX IF NOT EXISTS idx_research_correction_species ON research_correction_factors(species_slug, region);

COMMIT;

CREATE TABLE IF NOT EXISTS compliance_reports (
  id TEXT PRIMARY KEY,
  buyer_id TEXT NOT NULL,
  regime TEXT NOT NULL CHECK (regime IN ('SEC', 'EPA', 'CARBON_TAX')),
  reporting_period_start DATE NOT NULL,
  reporting_period_end DATE NOT NULL,
  emissions_tonnes NUMERIC(18,6) NOT NULL CHECK (emissions_tonnes >= 0),
  offsets_tonnes NUMERIC(18,6) NOT NULL CHECK (offsets_tonnes >= 0),
  net_emissions_tonnes NUMERIC(18,6) NOT NULL,
  coverage_percent NUMERIC(8,2) NOT NULL,
  offset_sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  jurisdiction TEXT,
  carbon_tax_due NUMERIC(18,2),
  methodology_version TEXT NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS compliance_reports_buyer_period_idx ON compliance_reports (buyer_id, reporting_period_end DESC);
CREATE TABLE IF NOT EXISTS farmer_credentials (
  id TEXT PRIMARY KEY,
  farmer_id TEXT NOT NULL,
  farmer_name TEXT NOT NULL,
  region TEXT NOT NULL,
  certifications TEXT[] NOT NULL,
  issued_at DATE NOT NULL,
  expires_at DATE,
  verifier TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'expired', 'pending'))
);
CREATE INDEX IF NOT EXISTS farmer_credentials_certifications_idx ON farmer_credentials USING GIN (certifications);

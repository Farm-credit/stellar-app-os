-- Migration: 024_create_planting_locations.sql
--
-- Sponsor-facing browseable planting sites shown on the interactive map.
-- Each row describes a single geographic location where a sponsor can fund
-- tree planting, including climate, supported species, and remaining
-- capacity.
--
-- Mirrors `PlantingLocation` in prisma/schema.prisma.

CREATE TABLE IF NOT EXISTS planting_locations (
  id                  SERIAL       PRIMARY KEY,
  name                VARCHAR(200) NOT NULL,
  description         TEXT         NOT NULL,
  latitude            DOUBLE PRECISION NOT NULL,
  longitude           DOUBLE PRECISION NOT NULL,
  region              VARCHAR(100) NOT NULL,   -- e.g. "Sub-Saharan Africa"
  climate             VARCHAR(50)  NOT NULL,   -- e.g. "Tropical", "Arid"
  species             TEXT[]       NOT NULL DEFAULT '{}',
  available_capacity  INTEGER      NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_planting_locations_region  ON planting_locations (region);
CREATE INDEX IF NOT EXISTS idx_planting_locations_climate ON planting_locations (climate);
CREATE INDEX IF NOT EXISTS idx_planting_locations_lat_lng ON planting_locations (latitude, longitude);

-- Trigger: keep updated_at fresh on every row update
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_planting_locations_updated_at') THEN
    CREATE TRIGGER trg_planting_locations_updated_at
    BEFORE UPDATE ON planting_locations
    FOR EACH ROW
    EXECUTE FUNCTION moddatetime('updated_at');
  END IF;
END $$;

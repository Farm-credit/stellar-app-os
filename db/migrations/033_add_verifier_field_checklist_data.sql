ALTER TABLE verifier_audits
  ADD COLUMN IF NOT EXISTS soil_moisture_percent SMALLINT
    CHECK (soil_moisture_percent BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS sapling_height_cm NUMERIC(8, 2)
    CHECK (sapling_height_cm BETWEEN 1 AND 5000),
  ADD COLUMN IF NOT EXISTS pest_presence TEXT
    CHECK (pest_presence IN ('none', 'mild', 'moderate', 'severe'));

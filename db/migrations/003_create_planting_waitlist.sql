-- Migration: 027_extend_planting_waitlist.sql
-- Extends planting_waitlist to support zone-based sponsorship waitlists.
-- Sponsors can join a waitlist for an oversubscribed planting zone and be
-- automatically assigned a tree when the next planting batch opens.

ALTER TABLE planting_waitlist
  ADD COLUMN IF NOT EXISTS sponsor_id           UUID,
  ADD COLUMN IF NOT EXISTS planting_location_id INT REFERENCES planting_locations(id),
  ADD COLUMN IF NOT EXISTS position             INT;

-- Prevent a sponsor from holding multiple active waitlist entries for the
-- same planting zone. Only 'waiting' rows are constrained so historical
-- (assigned/cancelled) entries are preserved.
CREATE UNIQUE INDEX IF NOT EXISTS idx_waitlist_sponsor_location_waiting
  ON planting_waitlist (sponsor_id, planting_location_id)
  WHERE status = 'waiting';

-- Support computing waitlist position per zone.
CREATE INDEX IF NOT EXISTS idx_waitlist_location_status
  ON planting_waitlist (planting_location_id, status, created_at);
</br>
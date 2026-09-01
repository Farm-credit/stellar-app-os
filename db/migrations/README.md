# Database Migrations

This directory contains SQL migration files for the Stellar App OS database.

## Migration Files

Migrations are numbered sequentially and should be named in the format: `XXX_description.sql`

- `000_create_schema_migrations.sql` - Tracks which migrations have been applied
- `001_create_indexed_transactions.sql` - Stores Stellar transactions
- `002_create_species_catalogue.sql` - Stores FAO/IPCC Tier-1 biomass CO₂ sequestration rates
- `003_create_species_proposals.sql` - Stores on-chain governance proposals for species
- `003_create_contract_events.sql` - Stores contract events
- `003_create_planters.sql` - Stores planter information
- `003_create_planting_regions.sql` - Stores planting regions
- `003_create_planting_waitlist.sql` - Stores planting waitlist
- `004_create_tree_map_points.sql` - Stores tree map points
- `004_create_trees.sql` - Stores tree information
- `005_create_progress_updates.sql` - Stores progress updates
- `006_create_disputes.sql` - Stores disputes
- `007_create_webhook_dispatch.sql` - Stores outbound webhook delivery attempts
- `007_create_photo_hashes.sql` - Stores perceptual hashes (pHash) of planting photos for duplicate detection (note: two migrations currently share number 007 — pre-existing, not introduced here)
- `008_create_carbon_offset_snapshots.sql` - Stores daily snapshots of total CO₂ sequestered across active trees (see `docs/carbon-offset-cron.md`)
- `009_create_referral_rewards.sql` - Stores referral codes, first-tree eligibility, and queued XLM rewards
- `010_create_sponsor_teams.sql` - Stores sponsor teams, invite membership, and shared tree links
- `011_create_sponsor_cohort_retention.sql` - Stores sponsor cohort data, sponsorship events, and monthly retention snapshots (#993)
- `012_create_school_partnerships.sql` - Stores school partnerships, student memberships, class project batches, and contributions (#1149)
- `013_create_daily_challenges.sql` - Stores daily challenge templates, sponsor progress, rewards, and streaks (#1158)
- `014_create_research_tables.sql` - Stores research plot locations, field measurements, satellite metrics, and correction factors for the climate impact study (see `docs/research/climate-impact-methodology.md`)
- `015_create_email_digests.sql` - Stores pending/sent/failed email digest jobs for the email digest worker (see `lib/workers/email-digest-worker.ts`)
- `018_add_tree_search_indexes.sql` - Adds indexes on trees (region, species_slug, planter_id) for search query optimization (#1175)

## Running Migrations

### Automated Migration Runner

The automated migration runner (`scripts/run-migrations.mjs`) will:

1. Check which migrations have already been applied (via `schema_migrations` table)
2. Calculate SHA256 checksums of migration files
3. Verify that applied migrations haven't been modified (checksum validation)
4. Apply pending migrations in order
5. Track execution time for each migration

### Commands

```bash
# Run all pending migrations
npm run db:migrate

# Check migration status (which are applied/pending)
npm run db:migrate:status

# Validate migration files (syntax check, no DB connection required)
npm run db:migrate:validate

# Seed species catalogue (after running migrations)
npm run seed:species
```

### Environment Variables

The migration runner requires `DATABASE_URL` to be set:

```bash
# Example DATABASE_URL format
DATABASE_URL=postgresql://user:password@host:port/database
```

## Adding New Migrations

1. Create a new SQL file in this directory with the next sequential number
2. Name it descriptively, e.g., `007_add_new_feature.sql`
3. Write your SQL migration (use `IF NOT EXISTS` where appropriate)
4. Run `npm run db:migrate` to apply it

## Rollback

Rollback scripts are named with `-rollback.sql` suffix. These are not automatically run by the migration runner and must be executed manually if needed.

## Safety Features

- **Checksum validation**: Prevents running migrations if files have been modified after being applied
- **Transactional**: Each migration runs in a transaction; failures are rolled back
- **Idempotent**: Migrations use `IF NOT EXISTS` to be safe to re-run
- **Execution tracking**: Records when each migration ran and how long it took

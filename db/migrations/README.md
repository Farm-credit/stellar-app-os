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

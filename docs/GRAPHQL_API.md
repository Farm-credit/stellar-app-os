# FarmCredit GraphQL API

The public GraphQL endpoint is available at `/api/graphql` and is read-only. It exposes tree, planter, configured contract, and analytics queries without changing database or on-chain state.

## Endpoint

- **URL:** `/api/graphql`
- **Methods:** `GET` and `POST`
- **Authentication:** none for the public read-only queries
- **Response:** standard GraphQL JSON (`data` and, when applicable, `errors`)

## Example request

```bash
curl -X POST https://<host>/api/graphql \
  -H 'content-type: application/json' \
  --data-binary '{
    "query": "query Trees($region: String, $limit: Int, $offset: Int) { trees(region: $region, limit: $limit, offset: $offset) { id treeRef species region status plantedAt latitude longitude co2OffsetKgPerYear projectName } }",
    "variables": { "region": "Ashanti", "limit": 25, "offset": 0 }
  }'
```

The route also accepts a GraphQL query in the `query` URL parameter for `GET` requests. `POST` is recommended for production clients because it avoids URL-length limits and keeps variables separate from the URL.

## Query groups

### Trees

- `trees(region, species, status, search, limit, offset)` returns a bounded, paginated list.
- `tree(id)` returns one tree or `null` when the ID is unknown.

The default list limit is 50. Clients should use `limit` and `offset` for pagination rather than requesting an unbounded list.

### Planters

- `planters(limit, offset)` returns the public planter-profile list.
- `planter(id)` returns one planter or `null` when the ID is unknown.

The resolver clamps pagination to a maximum page size of 200.

### Contracts

- `contracts` lists configured public contract identifiers and their network.
- `contract(id)` returns one configured contract or `null` when it is not configured.

Only contracts configured through the public contract environment variables are returned.

### Analytics

The following query names are supported:

- `treeRegistryAnalytics(region, species)`
- `aggregateMetrics(region, species)`
- `metricsByRegion(region)`
- `metricsBySpecies(species)`

The aggregate queries return totals plus regional and species breakdowns. Filters are optional and can be combined where supported.

## Validation and error handling

The endpoint uses standard GraphQL validation and introspection. Unknown fields, malformed queries, and invalid arguments return a GraphQL error response instead of silently returning partial resource data. Clients should check the `errors` array before consuming `data`.

## Verification checklist

When reviewing changes to this endpoint:

1. Run the focused route tests:

   ```bash
   npx vitest run app/api/graphql/__tests__/route.test.ts --no-file-parallelism
   ```

2. Confirm an introspection query succeeds.
3. Confirm a valid tree or analytics query returns JSON data.
4. Confirm an unknown field returns a standard GraphQL validation error.
5. Run `git diff --check` before submitting the change.

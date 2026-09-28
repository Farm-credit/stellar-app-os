# Carbon Offset Website Embed

Companies can embed a branded carbon-offset purchase widget on an e-commerce site. The widget loads only active projects owned by the company, displays project pricing, and redirects customers to Stripe Checkout. Paid sessions update project credit inventory through a signed Stripe webhook.

## Configure

Set these server-side environment variables:

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only database access |
| `DATABASE_URL` | PostgreSQL connection used by migrations |
| `NEXT_PUBLIC_APP_URL` | Public URL of this Harvesta deployment |
| `STRIPE_SECRET_KEY` | Stripe Checkout session creation |
| `STRIPE_EMBED_WEBHOOK_SECRET` | Signing secret for the embed webhook endpoint |

Apply the embed schema with `pnpm db:migrate`. The company must have active carbon projects with `company_id`, `price_per_ton`, `currency`, and `available_credits` populated.

Create a key while authenticated as a company user:

```http
POST /api/embed/keys
Content-Type: application/json

{
  "name": "Storefront",
  "allowedDomains": ["shop.example.com", "checkout.example.com"],
  "theme": "light",
  "primaryColor": "#15803d",
  "currency": "USD",
  "widgetTitle": "Offset this order",
  "brandName": "Example Store",
  "showBranding": false
}
```

The response contains the `fc_live_...` key once. Store it in the site integration settings; the database stores only its SHA-256 hash. Authenticated `GET /api/embed/keys` lists non-secret key settings. Revoke a key with authenticated `DELETE /api/embed/keys/{keyId}`. Allowed domains match exact hostnames only; add each storefront subdomain separately. HTTPS is required except for localhost development.

## Embed

```html
<div id="carbon-offset"></div>
<script
  async
  src="https://app.example.com/api/embed/script?key=fc_live_YOUR_PUBLIC_EMBED_KEY"
  data-config='{"key":"fc_live_YOUR_PUBLIC_EMBED_KEY","containerId":"carbon-offset","mode":"widget"}'
></script>
```

Replace the app URL and key with the values for the deployment. The key is a public embed credential, not a server secret; its allowed-domain list limits where it works. Branding, project selector visibility, default project/amount, currency, theme, title, and attribution are configured when the key is created. The widget collects a customer email and sends the buyer to Stripe Checkout.

Optional `returnUrl` and `cancelUrl` values can be supplied in `data-config`; both must use an allowlisted domain. By default, the customer returns to the embedding site with `carbon_offset=success` and a Stripe session ID in the query string.

## API

All browser endpoints require `Authorization: Bearer <embed-key>` and an allowlisted `Origin`:

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/embed/projects` | GET | List this company’s active projects and public widget configuration |
| `/api/embed/purchase` | POST | Create a hosted Stripe Checkout session |
| `/api/embed/purchase/{sessionId}` | GET | Read status for a session created with this key |

Purchase request fields are `projectId`, positive numeric `amount` in tonnes, `currency`, and `customerEmail`. Optional metadata (up to 20 string fields) and allowlisted return/cancel URLs may also be sent; metadata is attached to the Stripe session for order reconciliation. The server checks company ownership, project availability, and currency before creating checkout.

To display a verified result after redirect, read the `session_id` query parameter and call the status endpoint with the same bearer key. A session reserves project credits when checkout is created. It becomes `completed` after Stripe's signed `checkout.session.completed` event is verified; expired or failed sessions release their reservations through Stripe webhooks.

In Stripe, register `https://app.example.com/api/webhooks/stripe-embed` for `checkout.session.completed`, `checkout.session.expired`, and `checkout.session.async_payment_failed`, then set `STRIPE_EMBED_WEBHOOK_SECRET` to that endpoint's signing secret. Stripe retries failed webhook deliveries; fulfillment and reservation release are idempotent.

This embed checkout charges through Stripe and updates the project's off-chain `available_credits` inventory. It does not mint a Stellar token or carbon-credit NFT.
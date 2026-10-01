# Carbon Offset Website Embed

## Summary

Adds a merchant dashboard for configuring and managing Carbon Offset embeds, plus an embeddable JavaScript SDK experience that lets storefront visitors choose a carbon project and offset amount before continuing to hosted checkout.

## Related Issue

Closes #1415

## What Changed

- Adds `/dashboard/embeds`, where merchants can create integrations scoped to allowed website domains and configure the widget title, brand name, accent color, theme, currency, and Farm-credit attribution.
- Shows a one-time install snippet after integration creation and provides a copy action. Active integrations can be revoked; existing integrations display their status, allowed domains, theme, currency, and creation date.
- Adds a Carbon embed link to the corporate dashboard.
- Updates the embed SDK widget to load available projects, display project-specific pricing, accept a customer email and offset amount, and redirect visitors to hosted checkout.
- Supports inline/widget and button entry points, project selection, preset amounts, light/dark/automatic themes, and optional success, cancel, and error callbacks.
- Serves the SDK from `/api/embed/script`; a supplied invalid key returns `401`, and successful responses include JavaScript content type, public caching, and cross-origin access headers.

## Example Install

Create an integration in the dashboard, then add its generated snippet to the allowed storefront domain:

```html
<div id="farm-credit-offset"></div>
<script src="https://YOUR_APP_HOST/api/embed/script?key=YOUR_PUBLIC_EMBED_KEY"></script>
<script>
  FarmCreditOffset.init({
    key: 'YOUR_PUBLIC_EMBED_KEY',
    mode: 'widget',
    containerId: 'farm-credit-offset',
  });
</script>
```

The embed key is public and must remain domain-restricted. Payment details are entered through hosted checkout.

## How to Test

1. Sign in and open `/dashboard/embeds`.
2. Create an integration with a name and one or more allowed hostnames; set the widget appearance and currency.
3. Confirm the generated install snippet is shown, can be copied, and the integration appears in the list.
4. Install the snippet on an allowed domain. Verify projects load, selecting a project and amount updates the price, and a valid email enables checkout.
5. Continue to checkout and confirm the browser is redirected to the hosted checkout URL.
6. Revoke the integration and confirm it is marked revoked and can no longer be used for purchases.
7. Request `/api/embed/script?key=INVALID_KEY` and confirm it returns `401`; request without a key and confirm the SDK JavaScript is served.

## Validation

- `git diff --check origin/main...HEAD` passed.
- Automated lint, typecheck, build, and test commands were not run for this documentation update.

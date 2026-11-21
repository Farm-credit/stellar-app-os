// Temporary route used to verify Sentry's onRequestError wiring. Delete after.
export function GET() {
  throw new Error('TMP_SENTRY_ROUTE_CHECK boom');
}

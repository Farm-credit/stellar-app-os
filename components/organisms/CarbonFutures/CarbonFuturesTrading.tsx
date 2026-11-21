'use client';

import { useMemo, useState } from 'react';
import { CalendarClock, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/atoms/Button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/molecules/Card';
import { mockCarbonProjects } from '@/lib/api/mock/carbonProjects';
import {
  getDeliveryYears,
  quoteFuturesOrder,
  validateFuturesOrder,
  type FuturesQuote,
} from '@/lib/carbon/futures';

const CURRENT_YEAR = new Date().getUTCFullYear();

export function CarbonFuturesTrading() {
  const [projectId, setProjectId] = useState(mockCarbonProjects[0]?.id ?? '');
  const [quantity, setQuantity] = useState('100');
  const [deliveryYear, setDeliveryYear] = useState(String(CURRENT_YEAR + 1));
  const [quote, setQuote] = useState<FuturesQuote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const project = mockCarbonProjects.find((item) => item.id === projectId);
  const deliveryYears = useMemo(() => getDeliveryYears(CURRENT_YEAR), []);

  function requestQuote() {
    setSubmitted(false);
    const input = {
      projectId,
      quantity: Number(quantity),
      spotPricePerTon: project?.pricePerTon ?? 0,
      deliveryYear: Number(deliveryYear),
      currentYear: CURRENT_YEAR,
    };
    const validationError = validateFuturesOrder(input);
    if (validationError) {
      setError(validationError);
      setQuote(null);
      return;
    }
    setError(null);
    setQuote(quoteFuturesOrder(input));
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <p className="mb-2 flex items-center gap-2 text-sm font-medium text-stellar-blue">
          <CalendarClock className="h-4 w-4" /> Carbon derivatives
        </p>
        <h1 className="text-3xl font-bold text-foreground">
          Lock in next season&apos;s carbon price
        </h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Use a carbon futures contract to agree today&apos;s price for verified credits delivered
          in a future year. Buyers can plan costs while farmers get predictable demand.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle>Build a contract</CardTitle>
            <CardDescription>
              Quotes use a transparent 5% annual carry estimate. Final settlement requires
              verification.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <label className="block space-y-2 text-sm font-medium">
              Project
              <select
                value={projectId}
                onChange={(event) => setProjectId(event.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2"
              >
                {mockCarbonProjects
                  .filter((item) => !item.isOutOfStock)
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} — ${item.pricePerTon.toFixed(2)}/t
                    </option>
                  ))}
              </select>
            </label>
            <label className="block space-y-2 text-sm font-medium">
              Quantity (tonnes CO₂e)
              <input
                type="number"
                min="1"
                step="1"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2"
              />
            </label>
            <label className="block space-y-2 text-sm font-medium">
              Delivery year
              <select
                value={deliveryYear}
                onChange={(event) => setDeliveryYear(event.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2"
              >
                {deliveryYears.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </label>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            {submitted && (
              <p className="text-sm text-stellar-green">
                Contract request recorded for maintainer review.
              </p>
            )}
            <Button type="button" stellar="primary" width="full" onClick={requestQuote}>
              Calculate locked price
            </Button>
          </CardContent>
        </Card>

        <Card className="border-stellar-blue/30">
          <CardHeader>
            <CardTitle>{quote ? 'Indicative contract terms' : 'Your price lock'}</CardTitle>
            <CardDescription>
              {quote
                ? 'Review the hedge before submitting a request.'
                : 'Choose a project and delivery year to see a quote.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {quote ? (
              <>
                <div className="rounded-lg bg-stellar-blue/10 p-4">
                  <p className="text-sm text-muted-foreground">Locked price per tonne</p>
                  <p className="text-3xl font-bold text-foreground">
                    ${quote.lockedPricePerTon.toFixed(2)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Delivery in {quote.yearsToDelivery} year{quote.yearsToDelivery === 1 ? '' : 's'}
                  </p>
                </div>
                <dl className="space-y-3 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Quantity</dt>
                    <dd>{quote.quantity.toLocaleString()} tCO₂e</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Delivery</dt>
                    <dd>{quote.deliveryYear}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Notional value</dt>
                    <dd>
                      ${quote.notionalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </dd>
                  </div>
                </dl>
                <Button
                  type="button"
                  stellar="success"
                  width="full"
                  onClick={() => setSubmitted(true)}
                >
                  Request this contract
                </Button>
              </>
            ) : (
              <div className="flex min-h-48 flex-col items-center justify-center text-center text-muted-foreground">
                <ShieldCheck className="mb-3 h-10 w-10 text-stellar-blue" />
                <p>Price and delivery terms will appear here.</p>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Futures are forward commitments, not spot purchases. This indicative quote is not
              financial advice and is subject to project verification, liquidity, and settlement
              terms.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

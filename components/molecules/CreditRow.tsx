import { Button } from '@/components/atoms/Button';
import { CreditStatusBadge } from '@/components/atoms/CreditStatusBadge';
import { Text } from '@/components/atoms/Text';
import type { CreditHolding } from '@/lib/types/credits';

interface CreditRowProps {
  credit: CreditHolding;
  onTrade: (credit: CreditHolding) => void;
  onRetire: (credit: CreditHolding) => void;
}

export function CreditRow({ credit, onTrade, onRetire }: CreditRowProps) {
  return (
    <div className="flex flex-col gap-4 border-b border-gray-200 px-4 py-4 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex-1 space-y-1">
        <h3 className="font-semibold text-foreground">{credit.projectName}</h3>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
          <Text variant="small" as="p" className="text-muted-foreground">
            Vintage: {credit.vintage}
          </Text>
          <CreditStatusBadge status={credit.status} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:flex sm:items-center sm:gap-6">
        <div className="text-right">
          <Text variant="small" as="p" className="mb-0.5 text-muted-foreground">
            Quantity
          </Text>
          <Text variant="body" as="p" className="font-semibold">
            {credit.quantity.toLocaleString('en-US', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
            <span className="text-sm font-normal text-muted-foreground"> tons</span>
          </Text>
        </div>

        <div className="text-right">
          <Text variant="small" as="p" className="mb-0.5 text-muted-foreground">
            Price
          </Text>
          <Text variant="body" as="p" className="font-semibold">
            ${credit.pricePerTon.toFixed(2)}
            <span className="text-sm font-normal text-muted-foreground">/ton</span>
          </Text>
        </div>

        <div className="text-right">
          <Text variant="small" as="p" className="mb-0.5 text-muted-foreground">
            Total Value
          </Text>
          <Text variant="body" as="p" className="font-semibold text-stellar-blue">
            $
            {credit.totalValue.toLocaleString('en-US', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </Text>
        </div>

        <div className="col-span-2 flex gap-2 sm:col-span-1">
          {credit.status === 'active' && (
            <>
              <Button
                stellar="primary"
                size="sm"
                onClick={() => onTrade(credit)}
                className="flex-1 sm:flex-none"
                aria-label={`Trade ${credit.projectName}`}
              >
                Trade
              </Button>
              <Button
                stellar="accent"
                size="sm"
                variant="outline"
                onClick={() => onRetire(credit)}
                className="flex-1 sm:flex-none"
                aria-label={`Retire ${credit.projectName}`}
              >
                Retire
              </Button>
            </>
          )}
          {credit.status === 'retired' && (
            <Text variant="small" as="span" className="text-muted-foreground">
              Retired
            </Text>
          )}
        </div>
      </div>
    </div>
  );
}

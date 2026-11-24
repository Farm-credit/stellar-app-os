import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';

type SettingsCardProps = {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  variant?: 'default' | 'danger' | 'glass';
};

export function SettingsCard({
  title,
  description,
  children,
  className,
  variant = 'default',
}: SettingsCardProps) {
  return (
    <div
      className={cn(
        'rounded-2xl p-6 shadow-sm',
        variant === 'glass' && 'glass-surface',
        variant === 'default' && 'border border-border bg-card',
        variant === 'danger' && 'border border-destructive/30 bg-destructive/5',
        className
      )}
    >
      <div className="mb-6">
        <h2
          className={cn(
            'text-base font-semibold',
            variant === 'danger' ? 'text-destructive' : 'text-foreground'
          )}
        >
          {title}
        </h2>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </div>
  );
}

SettingsCard.displayName = 'SettingsCard';

type SettingsToggleRowProps = {
  title: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
  className?: string;
};

export function SettingsToggleRow({
  title,
  description,
  checked,
  onCheckedChange,
  disabled,
  id,
  className,
}: SettingsToggleRowProps) {
  const descriptionId = id ? `${id}-description` : undefined;

  return (
    <div
      className={cn(
        'flex items-start justify-between gap-4 py-3',
        className
      )}
    >
      <div className="min-w-0">
        <label
          htmlFor={id}
          className="text-sm font-medium text-foreground"
        >
          {title}
        </label>
        {description && (
          <p id={descriptionId} className="mt-1 text-sm text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        aria-describedby={descriptionId}
        className="mt-0.5 shrink-0"
      />
    </div>
  );
}

SettingsToggleRow.displayName = 'SettingsToggleRow';
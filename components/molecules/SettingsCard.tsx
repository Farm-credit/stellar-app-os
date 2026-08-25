import { cn } from '@/lib/utils';

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

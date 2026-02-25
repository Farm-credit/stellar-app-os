import { type HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
import { Text } from '@/components/atoms/Text';

interface CertificateFieldProps extends HTMLAttributes<HTMLDivElement> {
  label: string;
  value: string;
  mono?: boolean;
  truncated?: boolean;
}

function CertificateField({
  label,
  value,
  mono = false,
  truncated = false,
  className,
  ...props
}: CertificateFieldProps) {
  return (
    <div className={cn('flex flex-col gap-1', className)} {...props}>
      <Text
        variant="muted"
        as="span"
        className="text-xs font-semibold uppercase tracking-widest text-muted-foreground"
      >
        {label}
      </Text>
      <Text
        variant="small"
        as="span"
        className={cn(
          'rounded-md bg-muted px-3 py-2 text-foreground',
          mono && 'break-all font-mono text-xs',
          truncated && 'truncate'
        )}
        title={value}
      >
        {value}
      </Text>
    </div>
  );
}

export { CertificateField };
export type { CertificateFieldProps };

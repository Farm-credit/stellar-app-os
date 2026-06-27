import { forwardRef, useId, type ComponentProps, type ReactNode } from 'react';
import { Input, type InputProps } from '@/components/atoms/Input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

type FormFieldProps = Omit<InputProps, 'id'> & {
  id?: string;
  label: ReactNode;
  helperText?: ReactNode;
  errorMessage?: ReactNode;
  containerClassName?: string;
  helperClassName?: string;
  errorClassName?: string;
  labelProps?: Omit<ComponentProps<typeof Label>, 'children' | 'htmlFor'>;
};

const FormField = forwardRef<HTMLInputElement, FormFieldProps>(
  (
    {
      id,
      label,
      helperText,
      errorMessage,
      containerClassName,
      helperClassName,
      errorClassName,
      labelProps,
      variant,
      className,
      'aria-describedby': ariaDescribedBy,
      'aria-invalid': ariaInvalid,
      ...inputProps
    },
    ref
  ) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const helperId = helperText ? `${inputId}-helper` : undefined;
    const errorId = errorMessage ? `${inputId}-error` : undefined;
    const describedBy = [ariaDescribedBy, helperId, errorId].filter(Boolean).join(' ') || undefined;
    const hasError = Boolean(errorMessage || ariaInvalid === true || ariaInvalid === 'true');
    const { className: labelClassName, ...restLabelProps } = labelProps ?? {};

    return (
      <div className={cn('space-y-2', containerClassName)}>
        <Label
          htmlFor={inputId}
          className={cn(hasError && 'text-destructive', labelClassName)}
          {...restLabelProps}
        >
          {label}
        </Label>

        <Input
          ref={ref}
          id={inputId}
          variant={hasError ? 'destructive' : variant}
          className={className}
          aria-invalid={hasError ? true : ariaInvalid}
          aria-describedby={describedBy}
          {...inputProps}
        />

        {helperText ? (
          <p id={helperId} className={cn('text-xs text-muted-foreground', helperClassName)}>
            {helperText}
          </p>
        ) : null}

        {errorMessage ? (
          <p id={errorId} className={cn('text-xs text-destructive', errorClassName)}>
            {errorMessage}
          </p>
        ) : null}
      </div>
    );
  }
);

FormField.displayName = 'FormField';

export { FormField };
export type { FormFieldProps };

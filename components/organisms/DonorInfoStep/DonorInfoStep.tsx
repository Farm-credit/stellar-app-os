'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, ArrowRight, UserX, Mail, User, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/atoms/Button';
import { Text } from '@/components/atoms/Text';
import { Input } from '@/components/atoms/Input';
import { Checkbox } from '@/components/atoms/Checkbox';
import { ProgressStepper } from '@/components/molecules/ProgressStepper/ProgressStepper';
import { useDonationContext } from '@/contexts/DonationContext';
import { donorInfoSchema, type DonorInfoFormData } from '@/lib/schemas/donor';

const steps = [
  { id: 'amount', label: 'AMOUNT', path: '/donate', status: 'completed' as const },
  { id: 'info', label: 'YOUR INFO', path: '/donate/info', status: 'current' as const },
  { id: 'payment', label: 'PAYMENT', path: '/donate/payment', status: 'upcoming' as const },
  { id: 'success', label: 'SUCCESS', path: '/donate/success', status: 'upcoming' as const },
];

export function DonorInfoStep() {
  const router = useRouter();
  const { state, setDonorInfo } = useDonationContext();

  const {
    register,
    handleSubmit,
    formState: { errors, isValid },
    setValue,
  } = useForm<DonorInfoFormData>({
    resolver: zodResolver(donorInfoSchema),
    defaultValues: {
      email: state.donorInfo.email,
      name: state.donorInfo.name,
      privacyAccepted: state.donorInfo.privacyAccepted || undefined,
    },
    mode: 'onChange',
  });

  const [privacyChecked, setPrivacyChecked] = useState(() => state.donorInfo.privacyAccepted);

  const onSubmit = useCallback(
    (data: DonorInfoFormData) => {
      setDonorInfo({
        email: data.email,
        name: data.name || '',
        anonymous: false,
        privacyAccepted: true,
      });
      router.push('/donate/payment');
    },
    [setDonorInfo, router]
  );

  const handleAnonymous = useCallback(() => {
    setDonorInfo({
      email: '',
      name: '',
      anonymous: true,
      privacyAccepted: true,
    });
    router.push('/donate/payment');
  }, [setDonorInfo, router]);

  const handleBack = useCallback(() => {
    router.push('/donate');
  }, [router]);

  return (
    <div className="w-full max-w-3xl mx-auto px-4 py-8">
      {/* Progress Stepper */}
      <div className="mb-12">
        <ProgressStepper steps={steps} />
      </div>

      <div className="space-y-8">
        {/* Header */}
        <div className="text-center">
          <Text variant="h1" className="text-3xl sm:text-4xl font-bold mb-3">
            Tell us about you
          </Text>
          <Text variant="muted" className="text-base sm:text-lg max-w-md mx-auto">
            We&apos;ll send your tax receipt and impact updates to your email.
          </Text>
        </div>

        {/* Form Card */}
        <div className="rounded-2xl border border-border bg-card p-6 sm:p-8 shadow-sm">
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">
            {/* Email Field */}
            <div className="space-y-2">
              <label htmlFor="donor-email" className="flex items-center gap-2 text-sm font-medium">
                <Mail className="h-4 w-4 text-stellar-blue" aria-hidden="true" />
                Email address
                <span className="text-destructive" aria-hidden="true">
                  *
                </span>
              </label>
              <Input
                id="donor-email"
                type="email"
                variant="primary"
                inputSize="lg"
                placeholder="you@example.com"
                autoComplete="email"
                aria-required="true"
                aria-invalid={!!errors.email}
                aria-describedby={errors.email ? 'email-error' : undefined}
                {...register('email')}
              />
              {errors.email && (
                <Text id="email-error" variant="small" className="text-destructive" role="alert">
                  {errors.email.message}
                </Text>
              )}
            </div>

            {/* Name Field */}
            <div className="space-y-2">
              <label htmlFor="donor-name" className="flex items-center gap-2 text-sm font-medium">
                <User className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                Full name
                <span className="text-muted-foreground text-xs">(optional)</span>
              </label>
              <Input
                id="donor-name"
                type="text"
                inputSize="lg"
                placeholder="Jane Doe"
                autoComplete="name"
                aria-required="false"
                {...register('name')}
              />
            </div>

            {/* Privacy Policy Checkbox */}
            <div className="space-y-2">
              <div className="flex items-start gap-3 p-4 rounded-lg border border-border bg-muted/30">
                <div className="pt-0.5">
                  <Checkbox
                    id="privacy-policy"
                    checked={privacyChecked}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setPrivacyChecked(checked);
                      setValue('privacyAccepted', checked as true, {
                        shouldValidate: true,
                      });
                    }}
                    aria-required="true"
                    aria-invalid={!!errors.privacyAccepted}
                    aria-describedby={errors.privacyAccepted ? 'privacy-error' : undefined}
                  />
                </div>
                <label htmlFor="privacy-policy" className="text-sm leading-relaxed cursor-pointer">
                  <ShieldCheck
                    className="inline-block h-4 w-4 mr-1 text-stellar-green"
                    aria-hidden="true"
                  />
                  I agree to the{' '}
                  <a
                    href="/privacy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-stellar-blue underline hover:text-stellar-blue/80 focus:outline-none focus:ring-2 focus:ring-stellar-blue/50 rounded"
                  >
                    Privacy Policy
                  </a>{' '}
                  and consent to my data being processed for this donation.
                </label>
              </div>
              {errors.privacyAccepted && (
                <Text id="privacy-error" variant="small" className="text-destructive" role="alert">
                  {errors.privacyAccepted.message}
                </Text>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="sm:flex-1"
                onClick={handleBack}
                aria-label="Go back to amount selection"
              >
                <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
                Back
              </Button>

              <Button
                type="submit"
                size="lg"
                stellar="primary"
                className="sm:flex-[2]"
                disabled={!isValid}
                aria-label="Continue to payment step"
              >
                Continue to Payment
                <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </form>

          {/* Divider */}
          <div className="relative my-8">
            <div className="absolute inset-0 flex items-center" aria-hidden="true">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-card px-4 text-sm text-muted-foreground">or</span>
            </div>
          </div>

          {/* Anonymous Option */}
          <Button
            type="button"
            variant="outline"
            size="lg"
            width="full"
            onClick={handleAnonymous}
            aria-label="Skip donor information and donate anonymously"
          >
            <UserX className="mr-2 h-5 w-5 text-muted-foreground" aria-hidden="true" />
            Donate Anonymously
          </Button>
          <Text variant="muted" className="text-center mt-3 text-xs">
            You won&apos;t receive a tax receipt or impact updates.
          </Text>
        </div>
      </div>
    </div>
  );
}

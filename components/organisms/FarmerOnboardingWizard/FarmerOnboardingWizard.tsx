'use client';

import React, { useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { CheckCircle2, ChevronLeft, ChevronRight, Loader2, ShieldCheck, Sprout } from 'lucide-react';
import { Button } from '@/components/atoms/Button';
import { Input } from '@/components/atoms/Input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/molecules/Card';

interface FormValues {
  fullName: string;
  nationalId: string;
  phoneNumber: string;
  village: string;
  plotSize: string;
  cropType: string;
  soilType: string;
  gpsCoordinates: string;
  farmingGoal: string;
  consent: boolean;
}

interface FormErrors {
  fullName?: string;
  nationalId?: string;
  phoneNumber?: string;
  village?: string;
  plotSize?: string;
  cropType?: string;
  soilType?: string;
  gpsCoordinates?: string;
  farmingGoal?: string;
  consent?: string;
}

const steps = [
  {
    id: 'identity',
    title: 'Identity details',
    description: 'Share the farmer’s profile details for baseline verification.',
  },
  {
    id: 'land',
    title: 'Land details',
    description: 'Capture the plot information and geolocation for review.',
  },
  {
    id: 'review',
    title: 'Review & consent',
    description: 'Double check the information and confirm the onboarding request.',
  },
] as const;

const initialValues: FormValues = {
  fullName: '',
  nationalId: '',
  phoneNumber: '',
  village: '',
  plotSize: '',
  cropType: '',
  soilType: '',
  gpsCoordinates: '',
  farmingGoal: '',
  consent: false,
};

function validateStep(stepIndex: number, values: FormValues): FormErrors {
  const errors: FormErrors = {};

  if (stepIndex === 0) {
    if (!values.fullName.trim()) {
      errors.fullName = 'Please enter the farmer’s full name.';
    }
    if (!values.nationalId.trim()) {
      errors.nationalId = 'A national ID is required for verification.';
    }
    if (!values.phoneNumber.trim()) {
      errors.phoneNumber = 'Please provide a phone number for follow-up.';
    }
    if (!values.village.trim()) {
      errors.village = 'Please share the village or ward.';
    }
  }

  if (stepIndex === 1) {
    if (!values.plotSize.trim()) {
      errors.plotSize = 'Please enter the plot size.';
    }
    if (!values.cropType.trim()) {
      errors.cropType = 'Please enter the main crop type.';
    }
    if (!values.soilType.trim()) {
      errors.soilType = 'Please select or describe the soil type.';
    }
    if (!values.gpsCoordinates.trim()) {
      errors.gpsCoordinates = 'A GPS coordinate helps verify the land boundary.';
    }
  }

  if (stepIndex === 2) {
    if (!values.farmingGoal.trim()) {
      errors.farmingGoal = 'Please describe the farming goal.';
    }
    if (!values.consent) {
      errors.consent = 'Consent is required to proceed with onboarding.';
    }
  }

  return errors;
}

class WizardErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardHeader>
            <CardTitle>We hit a snag while preparing the onboarding flow.</CardTitle>
            <CardDescription>
              Please refresh the page and try again. If the issue continues, contact support.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{this.state.error?.message}</p>
          </CardContent>
        </Card>
      );
    }

    return this.props.children;
  }
}

export function FarmerOnboardingWizard() {
  const [stepIndex, setStepIndex] = useState(0);
  const [values, setValues] = useState<FormValues>(initialValues);
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  const activeStep = steps[stepIndex];
  const progressPercent = useMemo(() => ((stepIndex + 1) / steps.length) * 100, [stepIndex]);

  function handleFieldChange(field: keyof FormValues, value: string | boolean) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setStatusMessage('');
  }

  function handleNext() {
    const nextErrors = validateStep(stepIndex, values);
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      setStatusMessage('Please complete the highlighted fields before continuing.');
      return;
    }

    if (stepIndex < steps.length - 1) {
      setStepIndex((current) => current + 1);
      setStatusMessage('');
      return;
    }

    setStatusMessage('');
  }

  function handleBack() {
    if (stepIndex > 0) {
      setStepIndex((current) => current - 1);
      setStatusMessage('');
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validateStep(stepIndex, values);

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      setStatusMessage('Please resolve the highlighted fields before submitting.');
      return;
    }

    setIsSubmitting(true);
    setStatusMessage('Preparing your profile for review...');

    try {
      await new Promise((resolve) => window.setTimeout(resolve, 900));
      setIsComplete(true);
      setStatusMessage('Profile ready for review');
    } catch {
      setStatusMessage('We could not save the onboarding request. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  function renderIdentityStep() {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2 md:col-span-2">
          <label htmlFor="fullName" className="text-sm font-medium text-foreground">
            Full name
          </label>
          <Input
            id="fullName"
            name="fullName"
            autoComplete="name"
            value={values.fullName}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              handleFieldChange('fullName', event.target.value)
            }
            placeholder="Amina Hassan"
            aria-invalid={Boolean(errors.fullName)}
            aria-describedby={errors.fullName ? 'fullName-error' : undefined}
            variant={errors.fullName ? 'destructive' : 'primary'}
          />
          {errors.fullName ? <p id="fullName-error" className="text-sm text-destructive">{errors.fullName}</p> : null}
        </div>

        <div className="space-y-2">
          <label htmlFor="nationalId" className="text-sm font-medium text-foreground">
            National ID
          </label>
          <Input
            id="nationalId"
            name="nationalId"
            autoComplete="off"
            value={values.nationalId}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              handleFieldChange('nationalId', event.target.value)
            }
            placeholder="12345678"
            aria-invalid={Boolean(errors.nationalId)}
            aria-describedby={errors.nationalId ? 'nationalId-error' : undefined}
            variant={errors.nationalId ? 'destructive' : 'primary'}
          />
          {errors.nationalId ? <p id="nationalId-error" className="text-sm text-destructive">{errors.nationalId}</p> : null}
        </div>

        <div className="space-y-2">
          <label htmlFor="phoneNumber" className="text-sm font-medium text-foreground">
            Phone number
          </label>
          <Input
            id="phoneNumber"
            name="phoneNumber"
            type="tel"
            autoComplete="tel"
            value={values.phoneNumber}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              handleFieldChange('phoneNumber', event.target.value)
            }
            placeholder="254712345678"
            aria-invalid={Boolean(errors.phoneNumber)}
            aria-describedby={errors.phoneNumber ? 'phoneNumber-error' : undefined}
            variant={errors.phoneNumber ? 'destructive' : 'primary'}
          />
          {errors.phoneNumber ? <p id="phoneNumber-error" className="text-sm text-destructive">{errors.phoneNumber}</p> : null}
        </div>

        <div className="space-y-2 md:col-span-2">
          <label htmlFor="village" className="text-sm font-medium text-foreground">
            Village or ward
          </label>
          <Input
            id="village"
            name="village"
            autoComplete="address-level2"
            value={values.village}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              handleFieldChange('village', event.target.value)
            }
            placeholder="Nakuru East"
            aria-invalid={Boolean(errors.village)}
            aria-describedby={errors.village ? 'village-error' : undefined}
            variant={errors.village ? 'destructive' : 'primary'}
          />
          {errors.village ? <p id="village-error" className="text-sm text-destructive">{errors.village}</p> : null}
        </div>
      </div>
    );
  }

  function renderLandStep() {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor="plotSize" className="text-sm font-medium text-foreground">
            Plot size
          </label>
          <Input
            id="plotSize"
            name="plotSize"
            value={values.plotSize}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              handleFieldChange('plotSize', event.target.value)
            }
            placeholder="3.2"
            aria-invalid={Boolean(errors.plotSize)}
            aria-describedby={errors.plotSize ? 'plotSize-error' : undefined}
            variant={errors.plotSize ? 'destructive' : 'primary'}
          />
          {errors.plotSize ? <p id="plotSize-error" className="text-sm text-destructive">{errors.plotSize}</p> : null}
        </div>

        <div className="space-y-2">
          <label htmlFor="cropType" className="text-sm font-medium text-foreground">
            Crop type
          </label>
          <Input
            id="cropType"
            name="cropType"
            value={values.cropType}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              handleFieldChange('cropType', event.target.value)
            }
            placeholder="Maize"
            aria-invalid={Boolean(errors.cropType)}
            aria-describedby={errors.cropType ? 'cropType-error' : undefined}
            variant={errors.cropType ? 'destructive' : 'primary'}
          />
          {errors.cropType ? <p id="cropType-error" className="text-sm text-destructive">{errors.cropType}</p> : null}
        </div>

        <div className="space-y-2">
          <label htmlFor="soilType" className="text-sm font-medium text-foreground">
            Soil type
          </label>
          <Input
            id="soilType"
            name="soilType"
            value={values.soilType}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              handleFieldChange('soilType', event.target.value)
            }
            placeholder="Loamy"
            aria-invalid={Boolean(errors.soilType)}
            aria-describedby={errors.soilType ? 'soilType-error' : undefined}
            variant={errors.soilType ? 'destructive' : 'primary'}
          />
          {errors.soilType ? <p id="soilType-error" className="text-sm text-destructive">{errors.soilType}</p> : null}
        </div>

        <div className="space-y-2">
          <label htmlFor="gpsCoordinates" className="text-sm font-medium text-foreground">
            GPS coordinates
          </label>
          <Input
            id="gpsCoordinates"
            name="gpsCoordinates"
            value={values.gpsCoordinates}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              handleFieldChange('gpsCoordinates', event.target.value)
            }
            placeholder="-0.302,36.080"
            aria-invalid={Boolean(errors.gpsCoordinates)}
            aria-describedby={errors.gpsCoordinates ? 'gpsCoordinates-error' : undefined}
            variant={errors.gpsCoordinates ? 'destructive' : 'primary'}
          />
          {errors.gpsCoordinates ? <p id="gpsCoordinates-error" className="text-sm text-destructive">{errors.gpsCoordinates}</p> : null}
        </div>
      </div>
    );
  }

  function renderReviewStep() {
    return (
      <div className="space-y-5">
        <div className="rounded-2xl border border-stellar-blue/20 bg-stellar-blue/5 p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-stellar-blue/15 p-2 text-stellar-blue">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold text-foreground">A quick review before submission</p>
              <p className="text-sm text-muted-foreground">
                This profile will be routed to the verification desk once you confirm it.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border/70 bg-card/80 p-4">
          <dl className="grid gap-3 text-sm md:grid-cols-2">
            <div>
              <dt className="font-medium text-muted-foreground">Farmer</dt>
              <dd className="mt-1 text-foreground">{values.fullName || 'Not provided'}</dd>
            </div>
            <div>
              <dt className="font-medium text-muted-foreground">Plot size</dt>
              <dd className="mt-1 text-foreground">{values.plotSize || 'Not provided'}</dd>
            </div>
            <div>
              <dt className="font-medium text-muted-foreground">Crop type</dt>
              <dd className="mt-1 text-foreground">{values.cropType || 'Not provided'}</dd>
            </div>
            <div>
              <dt className="font-medium text-muted-foreground">Village</dt>
              <dd className="mt-1 text-foreground">{values.village || 'Not provided'}</dd>
            </div>
          </dl>
        </div>

        <div className="space-y-2">
          <label htmlFor="farmingGoal" className="text-sm font-medium text-foreground">
            Farming goal
          </label>
          <textarea
            id="farmingGoal"
            name="farmingGoal"
            rows={3}
            value={values.farmingGoal}
            onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
              handleFieldChange('farmingGoal', event.target.value)
            }
            placeholder="Increase food security and income"
            className="min-h-24 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stellar-blue/50"
            aria-invalid={Boolean(errors.farmingGoal)}
            aria-describedby={errors.farmingGoal ? 'farmingGoal-error' : undefined}
          />
          {errors.farmingGoal ? <p id="farmingGoal-error" className="text-sm text-destructive">{errors.farmingGoal}</p> : null}
        </div>

        <label className="flex items-start gap-3 rounded-xl border border-border/70 bg-muted/40 p-3 text-sm text-foreground">
          <input
            type="checkbox"
            checked={values.consent}
            onChange={(event) => handleFieldChange('consent', event.target.checked)}
            className="mt-1 h-4 w-4 rounded border-stellar-blue text-stellar-blue focus:ring-stellar-blue"
            aria-invalid={Boolean(errors.consent)}
            aria-describedby={errors.consent ? 'consent-error' : undefined}
          />
          <span>
            I consent to the onboarding review and understand that my information may be verified by field staff.
          </span>
        </label>
        {errors.consent ? <p id="consent-error" className="text-sm text-destructive">{errors.consent}</p> : null}
      </div>
    );
  }

  return (
    <WizardErrorBoundary>
      <div className="w-full rounded-[2rem] border border-white/20 bg-gradient-to-br from-white via-cyan-50/70 to-slate-100 p-4 shadow-2xl shadow-slate-900/10 backdrop-blur-xl dark:from-slate-900 dark:via-slate-950/80 dark:to-slate-900 sm:p-6 lg:p-8">
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-[1.5rem] border border-stellar-blue/10 bg-slate-950 px-5 py-6 text-white shadow-xl sm:px-6">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-white/10 p-2">
                <Sprout className="h-5 w-5 text-stellar-cyan" />
              </div>
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-stellar-cyan">
                  Farmer onboarding
                </p>
                <h1 className="text-2xl font-semibold sm:text-3xl">
                  Welcome to the farmer onboarding wizard
                </h1>
              </div>
            </div>

            <p className="mt-4 max-w-xl text-sm leading-7 text-slate-300">
              Guide new farmers through a polished, guided experience for registering land plots,
              identity details, and onboarding preferences in a few simple steps.
            </p>

            <div className="mt-6 rounded-2xl border border-white/10 bg-white/10 p-4 text-sm text-slate-200">
              <div className="mb-4 flex items-center justify-between">
                <span className="font-medium">Progress</span>
                <span>{Math.round(progressPercent)}%</span>
              </div>
              <div className="h-2 rounded-full bg-white/15" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progressPercent)}>
                <div className="h-2 rounded-full bg-gradient-to-r from-stellar-cyan to-stellar-blue" style={{ width: `${progressPercent}%` }} />
              </div>

              <ol className="mt-5 space-y-3">
                {steps.map((step, index) => {
                  const isActive = stepIndex === index;
                  const isDone = stepIndex > index;
                  return (
                    <li key={step.id} className="flex items-start gap-3">
                      <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${isDone ? 'border-stellar-green bg-stellar-green text-white' : isActive ? 'border-stellar-cyan bg-stellar-cyan/20 text-stellar-cyan' : 'border-white/20 bg-white/10 text-slate-300'}`}>
                        {isDone ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
                      </div>
                      <div>
                        <p className="font-medium">{step.title}</p>
                        <p className="text-xs text-slate-400">{step.description}</p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          </section>

          <Card className="border-border/70 bg-white/90 shadow-none dark:bg-slate-900/70">
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <CardTitle>{activeStep.title}</CardTitle>
                  <CardDescription>{activeStep.description}</CardDescription>
                </div>
                <div className="rounded-full bg-stellar-blue/10 px-3 py-1 text-sm font-semibold text-stellar-blue">
                  Step {stepIndex + 1} of {steps.length}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <form className="space-y-5" onSubmit={handleSubmit}>
                {stepIndex === 0 ? renderIdentityStep() : null}
                {stepIndex === 1 ? renderLandStep() : null}
                {stepIndex === 2 ? renderReviewStep() : null}

                <div className="rounded-2xl border border-border/70 bg-muted/40 px-4 py-3 text-sm text-muted-foreground" aria-live="polite">
                  {statusMessage || 'Complete each step to keep the onboarding flow moving smoothly.'}
                </div>

                {isComplete ? (
                  <div className="rounded-2xl border border-stellar-green/30 bg-stellar-green/10 p-4 text-sm text-stellar-green">
                    <p className="font-semibold">Profile ready for review</p>
                    <p className="mt-1">The onboarding request has been prepared successfully and is ready for staff review.</p>
                  </div>
                ) : null}

                <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-between">
                  <Button
                    type="button"
                    stellar="primary-outline"
                    width="full"
                    onClick={handleBack}
                    disabled={stepIndex === 0 || isSubmitting}
                    className="sm:w-auto"
                  >
                    <ChevronLeft className="mr-2 h-4 w-4" />
                    Back
                  </Button>

                  {stepIndex < steps.length - 1 ? (
                    <Button type="button" stellar="primary" width="full" onClick={handleNext} className="sm:w-auto">
                      Continue
                      <ChevronRight className="ml-2 h-4 w-4" />
                    </Button>
                  ) : (
                    <Button type="submit" stellar="success" width="full" disabled={isSubmitting} className="sm:w-auto">
                      {isSubmitting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Submitting
                        </>
                      ) : (
                        'Complete profile'
                      )}
                    </Button>
                  )}
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </WizardErrorBoundary>
  );
}

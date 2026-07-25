'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { ProgressStepper, type Step } from '@/components/molecules/ProgressStepper/ProgressStepper';
import { Button } from '@/components/atoms/Button';
import { usePlanterRegistration } from '@/hooks/usePlanterRegistration';
import { REGISTRATION_STEPS, STEP_LABELS } from '@/lib/types/planter';
import { WalletStep } from './steps/WalletStep';
import { ProfileStep } from './steps/ProfileStep';
import { RegionsStep } from './steps/RegionsStep';
import { ReviewStep } from './steps/ReviewStep';
import { CheckCircle2, ChevronLeft, Leaf } from 'lucide-react';

const SLIDE_VARIANTS = {
  enter: (direction: number) => ({
    x: direction > 0 ? 60 : -60,
    opacity: 0,
  }),
  center: { x: 0, opacity: 1 },
  exit: (direction: number) => ({
    x: direction > 0 ? -60 : 60,
    opacity: 0,
  }),
};

/**
 * PlanterRegistrationForm
 *
 * Top-level wizard that orchestrates the 4-step planter registration flow:
 *   1. Wallet connection
 *   2. Profile (name, bio, photo)
 *   3. Operating regions
 *   4. Review & submit
 *
 * On successful submission, redirects to /farmer dashboard.
 */
export function PlanterRegistrationForm() {
  const router = useRouter();
  const [prevStepIndex, setPrevStepIndex] = useState(0);

  const {
    form,
    currentStep,
    currentStepIndex,
    totalSteps,
    goNext,
    goBack,
    photoPreviewUrl,
    isUploadingPhoto,
    photoUploadError,
    uploadPhoto,
    clearPhoto,
    isSubmitting,
    submitError,
    planterId,
    submitRegistration,
  } = usePlanterRegistration();

  // Slide direction: positive = forward, negative = backward
  const direction = currentStepIndex >= prevStepIndex ? 1 : -1;
  useEffect(() => {
    setPrevStepIndex(currentStepIndex);
  }, [currentStepIndex]);

  // Redirect to farmer dashboard on success
  useEffect(() => {
    if (planterId) {
      const timer = setTimeout(() => router.push('/farmer'), 2200);
      return () => clearTimeout(timer);
    }
  }, [planterId, router]);

  // Build steps array for ProgressStepper
  const steps: Step[] = REGISTRATION_STEPS.map((step, i) => ({
    id: step,
    label: STEP_LABELS[step],
    // ProgressStepper uses path for router navigation; we manage state here
    // so path is a no-op placeholder
    path: '#',
    status: i < currentStepIndex ? 'completed' : i === currentStepIndex ? 'current' : 'upcoming',
  }));

  // ── Success screen ─────────────────────────────────────────────────────────
  if (planterId) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center justify-center gap-6 py-16 text-center"
      >
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-stellar-green/15">
          <CheckCircle2 className="h-10 w-10 text-stellar-green" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-bold">Registration Submitted!</h2>
          <p className="text-muted-foreground max-w-sm">
            Your planter profile is under review. We&apos;ll notify you once it&apos;s approved.
            Redirecting to your dashboard…
          </p>
        </div>
        <div className="h-1.5 w-48 rounded-full bg-muted overflow-hidden">
          <motion.div
            className="h-full bg-stellar-green rounded-full"
            initial={{ width: 0 }}
            animate={{ width: '100%' }}
            transition={{ duration: 2, ease: 'linear' }}
          />
        </div>
      </motion.div>
    );
  }

  return (
    <div className="space-y-8">
      {/* ── Progress stepper ─────────────────────────────────────────────── */}
      <ProgressStepper steps={steps} />

      {/* ── Step content ─────────────────────────────────────────────────── */}
      <div className="relative min-h-[380px]">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={currentStep}
            custom={direction}
            variants={SLIDE_VARIANTS}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.22, ease: 'easeInOut' }}
          >
            {/* Step header */}
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-1">
                <Leaf className="h-4 w-4 text-stellar-green" />
                <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Step {currentStepIndex + 1} of {totalSteps}
                </span>
              </div>
              <h2 className="text-xl font-bold">{STEP_LABELS[currentStep]}</h2>
            </div>

            {/* Step body */}
            {currentStep === 'wallet' && <WalletStep form={form} onNext={goNext} />}
            {currentStep === 'profile' && (
              <ProfileStep
                form={form}
                photoPreviewUrl={photoPreviewUrl}
                isUploadingPhoto={isUploadingPhoto}
                photoUploadError={photoUploadError}
                onUploadPhoto={uploadPhoto}
                onClearPhoto={clearPhoto}
              />
            )}
            {currentStep === 'regions' && <RegionsStep form={form} />}
            {currentStep === 'review' && (
              <ReviewStep
                form={form}
                photoPreviewUrl={photoPreviewUrl}
                isSubmitting={isSubmitting}
                submitError={submitError}
                onSubmit={submitRegistration}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ── Navigation footer ──────────────────────────────────────────────
           The wallet step auto-advances, so we hide "Next" there.
           The review step has its own submit button, so we hide "Next" there.
      ─────────────────────────────────────────────────────────────────────── */}
      {currentStep !== 'review' && (
        <div className="flex items-center justify-between pt-2 border-t border-border">
          <Button
            variant="ghost"
            onClick={goBack}
            disabled={currentStepIndex === 0}
            aria-label="Go to previous step"
            className="gap-1"
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </Button>

          {/* "Next" is hidden on wallet step (auto-advance) */}
          {currentStep !== 'wallet' && (
            <Button
              stellar="accent"
              onClick={goNext}
              aria-label="Go to next step"
              id={`planter-step-next-${currentStep}`}
            >
              Continue
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

PlanterRegistrationForm.displayName = 'PlanterRegistrationForm';

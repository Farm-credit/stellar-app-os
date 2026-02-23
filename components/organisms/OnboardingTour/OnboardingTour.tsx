'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  consumeOnboardingTourRestartRequest,
  hasCompletedOnboardingTour,
  markOnboardingTourCompleted,
  onboardingTourSteps,
} from '@/lib/onboardingTour';
import { Button } from '@/components/atoms/Button';
import { Text } from '@/components/atoms/Text';

interface FloatingPosition {
  top: number;
  left: number;
}

const DIALOG_MARGIN = 16;
const STEP_SPACING = 14;
const MOBILE_BREAKPOINT = 768;
const SPOTLIGHT_PADDING = 8;

export function OnboardingTour(): React.ReactNode {
  const dialogRef = useRef<HTMLDivElement | null>(null);

  const [isOpen, setIsOpen] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [dialogPosition, setDialogPosition] = useState<FloatingPosition>({
    top: DIALOG_MARGIN,
    left: DIALOG_MARGIN,
  });

  const totalSteps = onboardingTourSteps.length;
  const currentStep = onboardingTourSteps[currentStepIndex];
  const updateTargetRect = useCallback(() => {
    if (!isOpen) {
      return;
    }

    const element = document.querySelector<HTMLElement>(currentStep.target);
    if (!element) {
      setTargetRect(null);
      return;
    }

    setTargetRect(element.getBoundingClientRect());
  }, [currentStep.target, isOpen]);

  useEffect(() => {
    if (consumeOnboardingTourRestartRequest()) {
      setCurrentStepIndex(0);
      setIsOpen(true);
      return;
    }

    if (!hasCompletedOnboardingTour()) {
      setIsOpen(true);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const element = document.querySelector<HTMLElement>(currentStep.target);
    if (!element) {
      setTargetRect(null);
      return;
    }

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    element.scrollIntoView({
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
      block: 'center',
      inline: 'center',
    });
  }, [currentStep.target, isOpen]);

  useEffect(() => {
    updateTargetRect();

    if (!isOpen) {
      return;
    }

    const onViewportChange = () => {
      updateTargetRect();
    };

    window.addEventListener('resize', onViewportChange);
    window.addEventListener('scroll', onViewportChange, true);

    return () => {
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('scroll', onViewportChange, true);
    };
  }, [isOpen, updateTargetRect]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const dialogWidth = dialog.offsetWidth;
    const dialogHeight = dialog.offsetHeight;

    if (viewportWidth < MOBILE_BREAKPOINT || !targetRect) {
      setDialogPosition({
        top: Math.max(DIALOG_MARGIN, viewportHeight - dialogHeight - DIALOG_MARGIN),
        left: Math.max(DIALOG_MARGIN, (viewportWidth - dialogWidth) / 2),
      });
      return;
    }

    const proposedBottom = targetRect.bottom + STEP_SPACING;
    const proposedTop = targetRect.top - dialogHeight - STEP_SPACING;
    const fitsBelow = proposedBottom + dialogHeight <= viewportHeight - DIALOG_MARGIN;
    const top = fitsBelow
      ? proposedBottom
      : Math.max(
          DIALOG_MARGIN,
          Math.min(proposedTop, viewportHeight - dialogHeight - DIALOG_MARGIN)
        );

    const centeredLeft = targetRect.left + targetRect.width / 2 - dialogWidth / 2;
    const left = Math.max(
      DIALOG_MARGIN,
      Math.min(centeredLeft, viewportWidth - dialogWidth - DIALOG_MARGIN)
    );

    setDialogPosition({ top, left });
  }, [currentStepIndex, isOpen, targetRect]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
  }, []);

  const handleComplete = useCallback(() => {
    markOnboardingTourCompleted();
    setIsOpen(false);
  }, []);

  const handleNext = useCallback(() => {
    if (currentStepIndex >= totalSteps - 1) {
      handleComplete();
      return;
    }

    setCurrentStepIndex((previous) => previous + 1);
  }, [currentStepIndex, handleComplete, totalSteps]);

  const handleBack = useCallback(() => {
    setCurrentStepIndex((previous) => Math.max(0, previous - 1));
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        handleClose();
        return;
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault();
        handleNext();
        return;
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        handleBack();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [handleBack, handleClose, handleNext, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    dialogRef.current?.focus();
  }, [currentStepIndex, isOpen]);

  const spotlightStyle = useMemo(() => {
    if (!targetRect) {
      return undefined;
    }

    const top = Math.max(0, targetRect.top - SPOTLIGHT_PADDING);
    const left = Math.max(0, targetRect.left - SPOTLIGHT_PADDING);
    const width = Math.max(0, targetRect.width + SPOTLIGHT_PADDING * 2);
    const height = Math.max(0, targetRect.height + SPOTLIGHT_PADDING * 2);

    return {
      top,
      left,
      width,
      height,
      boxShadow: '0 0 0 9999px rgba(2, 6, 23, 0.72)',
    };
  }, [targetRect]);

  if (!isOpen) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-[999] bg-slate-950/45"
        onClick={handleClose}
        aria-label="Close onboarding tour"
      />

      {spotlightStyle ? (
        <div
          className="pointer-events-none fixed z-[1000] rounded-xl border-2 border-stellar-cyan transition-all duration-300"
          style={spotlightStyle}
          aria-hidden="true"
        />
      ) : null}

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-tour-title"
        aria-describedby="onboarding-tour-description"
        tabIndex={-1}
        className="fixed z-[1001] w-[min(24rem,calc(100vw-2rem))] rounded-xl border border-stellar-blue/35 bg-slate-900 p-4 text-slate-100 shadow-2xl"
        style={{
          top: dialogPosition.top,
          left: dialogPosition.left,
        }}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <Text variant="small" className="text-slate-300">
            Step {currentStepIndex + 1} of {totalSteps}
          </Text>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClose}
            className="text-slate-200 hover:text-white"
          >
            Skip tour
          </Button>
        </div>

        <Text id="onboarding-tour-title" variant="h4" as="h2" className="mb-2 text-white">
          {currentStep.title}
        </Text>

        <Text
          id="onboarding-tour-description"
          variant="body"
          as="p"
          className="mb-4 text-slate-200"
        >
          {currentStep.description}
        </Text>

        <div className="flex items-center justify-between gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleBack}
            disabled={currentStepIndex === 0}
            className="border-slate-500 text-slate-100 hover:bg-slate-800"
          >
            Back
          </Button>

          <Button size="sm" stellar="primary" onClick={handleNext}>
            {currentStepIndex === totalSteps - 1 ? 'Finish tour' : 'Next'}
          </Button>
        </div>
      </div>
    </>
  );
}

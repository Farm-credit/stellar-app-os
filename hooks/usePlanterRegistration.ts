'use client';

import { useState, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { planterRegistrationSchema } from '@/lib/schemas/planter-registration';
import type { PlanterRegistrationFormData } from '@/lib/schemas/planter-registration';
import { REGISTRATION_STEPS, type RegistrationStep } from '@/lib/types/planter';
import type { RegisterPlanterResponse } from '@/lib/types/planter';

const ALLOWED_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_PHOTO_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export interface UsePlanterRegistrationReturn {
  form: ReturnType<typeof useForm<PlanterRegistrationFormData>>;
  currentStep: RegistrationStep;
  currentStepIndex: number;
  totalSteps: number;
  goNext: () => Promise<void>;
  goBack: () => void;
  photoPreviewUrl: string | null;
  isUploadingPhoto: boolean;
  photoUploadError: string | null;
  uploadPhoto: (file: File) => Promise<void>;
  clearPhoto: () => void;
  isSubmitting: boolean;
  submitError: string | null;
  planterId: string | null;
  submitRegistration: () => Promise<void>;
}

/** Fields that belong to each step — used for per-step validation */
const STEP_FIELDS: Record<RegistrationStep, (keyof PlanterRegistrationFormData)[]> = {
  wallet: ['walletPublicKey'],
  profile: ['displayName', 'bio', 'profilePhotoIpfsCid'],
  regions: ['regions'],
  review: ['termsAccepted'],
};

export function usePlanterRegistration(): UsePlanterRegistrationReturn {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [photoUploadError, setPhotoUploadError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [planterId, setPlanterId] = useState<string | null>(null);

  const form = useForm<PlanterRegistrationFormData>({
    resolver: zodResolver(planterRegistrationSchema),
    defaultValues: {
      walletPublicKey: '',
      displayName: '',
      bio: '',
      profilePhotoIpfsCid: '',
      regions: [],
      termsAccepted: undefined,
    },
    mode: 'onChange',
  });

  const currentStep = REGISTRATION_STEPS[currentStepIndex];
  const totalSteps = REGISTRATION_STEPS.length;

  /** Validate fields for the current step then advance */
  const goNext = useCallback(async () => {
    const fieldsToValidate = STEP_FIELDS[currentStep];
    const isValid = await form.trigger(fieldsToValidate);
    if (!isValid) return;
    setCurrentStepIndex((i) => Math.min(i + 1, totalSteps - 1));
  }, [currentStep, form, totalSteps]);

  const goBack = useCallback(() => {
    setCurrentStepIndex((i) => Math.max(i - 1, 0));
  }, []);

  /** Client-side validation then server-side IPFS upload */
  const uploadPhoto = useCallback(
    async (file: File) => {
      setPhotoUploadError(null);

      // Client-side guard (mirrors server-side validation)
      if (!ALLOWED_PHOTO_TYPES.includes(file.type)) {
        setPhotoUploadError('Only JPEG, PNG, and WebP images are accepted.');
        return;
      }
      if (file.size > MAX_PHOTO_SIZE_BYTES) {
        setPhotoUploadError('File is too large. Maximum size is 5 MB.');
        return;
      }

      // Show local preview immediately for better UX
      const objectUrl = URL.createObjectURL(file);
      setPhotoPreviewUrl(objectUrl);
      setIsUploadingPhoto(true);

      try {
        const formData = new FormData();
        formData.append('photo', file);

        const res = await fetch('/api/planters/upload-photo', {
          method: 'POST',
          body: formData,
        });

        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(data.error ?? 'Photo upload failed. Please try again.');
        }

        const { cid } = (await res.json()) as { cid: string };
        form.setValue('profilePhotoIpfsCid', cid, { shouldValidate: true });
      } catch (err) {
        // Show generic message — do not expose internal details
        setPhotoUploadError(
          err instanceof Error ? err.message : 'Photo upload failed. Please try again.'
        );
        // Reset preview on failure
        setPhotoPreviewUrl(null);
        URL.revokeObjectURL(objectUrl);
        form.setValue('profilePhotoIpfsCid', '', { shouldValidate: false });
      } finally {
        setIsUploadingPhoto(false);
      }
    },
    [form]
  );

  const clearPhoto = useCallback(() => {
    if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
    setPhotoPreviewUrl(null);
    setPhotoUploadError(null);
    form.setValue('profilePhotoIpfsCid', '', { shouldValidate: false });
  }, [photoPreviewUrl, form]);

  /** Submit the full registration payload to the API */
  const submitRegistration = useCallback(async () => {
    const isValid = await form.trigger();
    if (!isValid) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const payload = form.getValues();

      const res = await fetch('/api/planters/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? 'Registration failed. Please try again.');
      }

      const data = (await res.json()) as RegisterPlanterResponse;
      setPlanterId(data.planterId);
    } catch (err) {
      // Display a generic error message — not internal details
      setSubmitError(err instanceof Error ? err.message : 'Registration failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }, [form]);

  return {
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
  };
}

export const ONBOARDING_TOUR_COMPLETED_KEY = 'farmcredit:onboarding-tour:completed';
export const ONBOARDING_TOUR_FORCE_START_KEY = 'farmcredit:onboarding-tour:force-start';

export interface OnboardingTourStep {
  id: string;
  target: string;
  title: string;
  description: string;
}

export const onboardingTourSteps: ReadonlyArray<OnboardingTourStep> = [
  {
    id: 'welcome',
    target: '[data-tour-id="hero-section"]',
    title: 'Welcome to FarmCredit',
    description: 'This home view gives you a quick read on platform health and where to start.',
  },
  {
    id: 'stats',
    target: '[data-tour-id="stats-grid"]',
    title: 'Platform Metrics',
    description: 'Track issued credit, active farmers, and repayment performance at a glance.',
  },
  {
    id: 'get-started',
    target: '[data-tour-id="get-started-card"]',
    title: 'Get Started Actions',
    description:
      'The primary actions for wallet connection, reading product updates, and buying credits live here.',
  },
  {
    id: 'connect-wallet',
    target: '[data-tour-id="connect-wallet-button"]',
    title: 'Connect Wallet',
    description: 'Start by connecting your wallet to unlock personalized credit and payment flows.',
  },
  {
    id: 'purchase-credits',
    target: '[data-tour-id="purchase-credits-button"]',
    title: 'Purchase Carbon Credits',
    description: 'Use this path to buy carbon credits and manage your portfolio over time.',
  },
];

export function hasCompletedOnboardingTour(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.localStorage.getItem(ONBOARDING_TOUR_COMPLETED_KEY) === 'true';
}

export function markOnboardingTourCompleted(): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(ONBOARDING_TOUR_COMPLETED_KEY, 'true');
}

export function resetOnboardingTourCompletion(): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(ONBOARDING_TOUR_COMPLETED_KEY);
}

export function requestOnboardingTourRestart(): void {
  if (typeof window === 'undefined') {
    return;
  }

  resetOnboardingTourCompletion();
  window.localStorage.setItem(ONBOARDING_TOUR_FORCE_START_KEY, 'true');
}

export function consumeOnboardingTourRestartRequest(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  const shouldRestart = window.localStorage.getItem(ONBOARDING_TOUR_FORCE_START_KEY) === 'true';
  if (shouldRestart) {
    window.localStorage.removeItem(ONBOARDING_TOUR_FORCE_START_KEY);
  }

  return shouldRestart;
}

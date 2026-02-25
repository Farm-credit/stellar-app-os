import type { Step, StepStatus } from '@/components/molecules/ProgressStepper/ProgressStepper';

export const PURCHASE_FLOW_STEPS = {
  SELECTION: {
    id: 'selection',
    label: 'Amount',
    path: '/credits/purchase',
  },
  WALLET: {
    id: 'wallet',
    label: 'Info',
    path: '/credits/purchase/wallet',
  },
  PAYMENT: {
    id: 'payment',
    label: 'Payment',
    path: '/credits/purchase/payment',
  },
  CONFIRMATION: {
    id: 'confirmation',
    label: 'Confirm',
    path: '/credits/purchase/confirmation',
  },
} as const;

export function getCurrentStepFromPath(pathname: string): string {
  if (pathname.includes('/confirmation')) {
    return PURCHASE_FLOW_STEPS.CONFIRMATION.id;
  }
  if (pathname.includes('/payment')) {
    return PURCHASE_FLOW_STEPS.PAYMENT.id;
  }
  if (pathname.includes('/wallet')) {
    return PURCHASE_FLOW_STEPS.WALLET.id;
  }
  return PURCHASE_FLOW_STEPS.SELECTION.id;
}

export function getStepStatus(
  stepId: string,
  currentStepId: string,
  completedSteps: string[]
): StepStatus {
  if (completedSteps.includes(stepId)) {
    return 'completed';
  }
  if (stepId === currentStepId) {
    return 'current';
  }
  return 'upcoming';
}

export function getCompletedSteps(
  currentStepId: string,
  hasSelection: boolean,
  hasWallet: boolean
): string[] {
  const completed: string[] = [];

  if (currentStepId !== PURCHASE_FLOW_STEPS.SELECTION.id && hasSelection) {
    completed.push(PURCHASE_FLOW_STEPS.SELECTION.id);
  }

  if (
    currentStepId !== PURCHASE_FLOW_STEPS.WALLET.id &&
    (currentStepId === PURCHASE_FLOW_STEPS.PAYMENT.id ||
      currentStepId === PURCHASE_FLOW_STEPS.CONFIRMATION.id) &&
    hasWallet
  ) {
    completed.push(PURCHASE_FLOW_STEPS.WALLET.id);
  }

  if (currentStepId === PURCHASE_FLOW_STEPS.CONFIRMATION.id && hasSelection) {
    completed.push(PURCHASE_FLOW_STEPS.PAYMENT.id);
  }

  return completed;
}

export function buildPurchaseFlowSteps(
  currentStepId: string,
  completedSteps: string[],
  selectionParam?: string | null
): Step[] {
  const steps: Step[] = [
    {
      ...PURCHASE_FLOW_STEPS.SELECTION,
      status: getStepStatus(PURCHASE_FLOW_STEPS.SELECTION.id, currentStepId, completedSteps),
      path: selectionParam
        ? `${PURCHASE_FLOW_STEPS.SELECTION.path}?selection=${selectionParam}`
        : PURCHASE_FLOW_STEPS.SELECTION.path,
    },
    {
      ...PURCHASE_FLOW_STEPS.WALLET,
      status: getStepStatus(PURCHASE_FLOW_STEPS.WALLET.id, currentStepId, completedSteps),
      path: selectionParam
        ? `${PURCHASE_FLOW_STEPS.WALLET.path}?selection=${selectionParam}`
        : PURCHASE_FLOW_STEPS.WALLET.path,
    },
    {
      ...PURCHASE_FLOW_STEPS.PAYMENT,
      status: getStepStatus(PURCHASE_FLOW_STEPS.PAYMENT.id, currentStepId, completedSteps),
      path: selectionParam
        ? `${PURCHASE_FLOW_STEPS.PAYMENT.path}?selection=${selectionParam}`
        : PURCHASE_FLOW_STEPS.PAYMENT.path,
    },
    {
      ...PURCHASE_FLOW_STEPS.CONFIRMATION,
      status: getStepStatus(PURCHASE_FLOW_STEPS.CONFIRMATION.id, currentStepId, completedSteps),
      path: PURCHASE_FLOW_STEPS.CONFIRMATION.path,
    },
  ];

  return steps;
}

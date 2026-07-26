import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { FarmerOnboardingWizard } from './FarmerOnboardingWizard';

describe('FarmerOnboardingWizard', () => {
  it('renders the initial onboarding step and the progress indicator', () => {
    render(<FarmerOnboardingWizard />);

    expect(screen.getByRole('heading', { name: /welcome to the farmer onboarding wizard/i })).toBeInTheDocument();
    expect(screen.getByText(/identity details/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /continue/i })).toBeInTheDocument();
  });

  it('guides the farmer through the steps and completes the profile', async () => {
    const user = userEvent.setup();
    render(<FarmerOnboardingWizard />);

    await user.type(screen.getByLabelText(/full name/i), 'Amina Hassan');
    await user.type(screen.getByLabelText(/national id/i), '12345678');
    await user.type(screen.getByLabelText(/phone number/i), '254712345678');
    await user.type(screen.getByLabelText(/village or ward/i), 'Nakuru East');
    await user.click(screen.getByRole('button', { name: /continue/i }));

    await user.type(screen.getByLabelText(/plot size/i), '3.2');
    await user.type(screen.getByLabelText(/crop type/i), 'Maize');
    await user.type(screen.getByLabelText(/soil type/i), 'Loamy');
    await user.type(screen.getByLabelText(/gps coordinates/i), '-0.302,36.080');
    await user.click(screen.getByRole('button', { name: /continue/i }));

    await user.type(screen.getByLabelText(/farming goal/i), 'Increase food security and income');
    await user.click(screen.getByLabelText(/i consent to the onboarding review/i));
    await user.click(screen.getByRole('button', { name: /continue/i }));

    await user.click(screen.getByRole('button', { name: /complete profile/i }));

    expect(await screen.findByText(/profile ready for review/i)).toBeInTheDocument();
  });
});

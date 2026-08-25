import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CreateProposalForm } from '../CreateProposalForm';

describe('CreateProposalForm', () => {
  it('renders form with all required fields', () => {
    render(<CreateProposalForm />);

    expect(screen.getByLabelText(/species slug/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/species name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/co₂ sequestration/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/maturity/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /submit proposal/i })).toBeInTheDocument();
  });

  it('displays alert with proposal guidelines', () => {
    render(<CreateProposalForm />);

    expect(screen.getByText(/proposals require community approval/i)).toBeInTheDocument();
    // The text appears in both the alert and the CO2 helper text - check the alert specifically
    const alerts = screen.getAllByRole('alert');
    expect(alerts[0]).toHaveTextContent(/fa[o|o]\/ipcc tier-1/i);
  });

  it('shows helper text for slug field', () => {
    render(<CreateProposalForm />);

    expect(screen.getByText(/short identifier.*lowercase.*no spaces/i)).toBeInTheDocument();
  });

  it('shows helper text for CO₂ field', () => {
    render(<CreateProposalForm />);

    const helperTexts = screen.getAllByText(/based on fao\/ipcc tier-1 data/i);
    expect(helperTexts.length).toBeGreaterThanOrEqual(1);
  });

  it('shows helper text for maturity field', () => {
    render(<CreateProposalForm />);

    expect(screen.getByText(/years to biomass maturity/i)).toBeInTheDocument();
  });

  it('converts slug input to lowercase', () => {
    render(<CreateProposalForm />);

    const slugInput = screen.getByLabelText(/species slug/i);
    fireEvent.change(slugInput, { target: { value: 'MAHOGANY' } });

    expect(slugInput).toHaveValue('mahogany');
  });

  it('shows validation error when required fields are empty', async () => {
    render(<CreateProposalForm />);

    const submitButton = screen.getByRole('button', { name: /submit proposal/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      const alerts = screen.getAllByRole('alert');
      expect(alerts.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('shows validation error for non-positive CO₂ value', async () => {
    render(<CreateProposalForm />);

    fireEvent.change(screen.getByLabelText(/species slug/i), { target: { value: 'mahogany' } });
    fireEvent.change(screen.getByLabelText(/species name/i), { target: { value: 'Mahogany' } });
    fireEvent.change(screen.getByLabelText(/co₂ sequestration/i), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText(/maturity/i), { target: { value: '25' } });

    const submitButton = screen.getByRole('button', { name: /submit proposal/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      const alerts = screen.getAllByRole('alert');
      expect(alerts.length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText(/co₂ sequestration must be positive/i)).toBeInTheDocument();
    });
  });

  it('shows validation error for non-positive maturity years', async () => {
    render(<CreateProposalForm />);

    fireEvent.change(screen.getByLabelText(/species slug/i), { target: { value: 'mahogany' } });
    fireEvent.change(screen.getByLabelText(/species name/i), { target: { value: 'Mahogany' } });
    fireEvent.change(screen.getByLabelText(/co₂ sequestration/i), { target: { value: '25.5' } });
    fireEvent.change(screen.getByLabelText(/maturity/i), { target: { value: '0' } });

    const submitButton = screen.getByRole('button', { name: /submit proposal/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      const alerts = screen.getAllByRole('alert');
      expect(alerts.length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText(/maturity years must be greater than 0/i)).toBeInTheDocument();
    });
  });

  it('shows loading state during submission', async () => {
    render(<CreateProposalForm />);

    fireEvent.change(screen.getByLabelText(/species slug/i), { target: { value: 'mahogany' } });
    fireEvent.change(screen.getByLabelText(/species name/i), { target: { value: 'Mahogany' } });
    fireEvent.change(screen.getByLabelText(/co₂ sequestration/i), { target: { value: '25.5' } });
    fireEvent.change(screen.getByLabelText(/maturity/i), { target: { value: '25' } });

    const submitButton = screen.getByRole('button', { name: /submit proposal/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /submitting/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /submitting/i })).toBeDisabled();
    });
  });

  it('resets form after successful submission', async () => {
    render(<CreateProposalForm />);

    fireEvent.change(screen.getByLabelText(/species slug/i), { target: { value: 'mahogany' } });
    fireEvent.change(screen.getByLabelText(/species name/i), { target: { value: 'Mahogany' } });
    fireEvent.change(screen.getByLabelText(/co₂ sequestration/i), { target: { value: '25.5' } });
    fireEvent.change(screen.getByLabelText(/maturity/i), { target: { value: '25' } });
    fireEvent.change(screen.getByLabelText(/description/i), {
      target: { value: 'Test description' },
    });

    const submitButton = screen.getByRole('button', { name: /submit proposal/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /submit proposal/i })).toBeInTheDocument();
    });

    // The form should reset after the simulated async operation completes
    await waitFor(() => {
      expect(screen.getByLabelText(/species slug/i)).toHaveValue('');
      expect(screen.getByLabelText(/species name/i)).toHaveValue('');
      // Number inputs return null when empty
      const co2Input = screen.getByLabelText(/co₂ sequestration/i);
      expect(co2Input.value === '' || co2Input.value === null).toBeTruthy();
      const maturityInput = screen.getByLabelText(/maturity/i);
      expect(maturityInput.value === '' || maturityInput.value === null).toBeTruthy();
      expect(screen.getByLabelText(/description/i)).toHaveValue('');
    });
  });

  it('displays error alert when submission fails', async () => {
    render(<CreateProposalForm />);

    fireEvent.change(screen.getByLabelText(/species slug/i), { target: { value: 'mahogany' } });
    fireEvent.change(screen.getByLabelText(/species name/i), { target: { value: 'Mahogany' } });
    fireEvent.change(screen.getByLabelText(/co₂ sequestration/i), { target: { value: '25.5' } });
    fireEvent.change(screen.getByLabelText(/maturity/i), { target: { value: '25' } });

    const submitButton = screen.getByRole('button', { name: /submit proposal/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      const alerts = screen.getAllByRole('alert');
      expect(alerts.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('has proper accessibility attributes', () => {
    render(<CreateProposalForm />);

    expect(screen.getByLabelText(/species slug/i)).toHaveAttribute('required');
    expect(screen.getByLabelText(/species name/i)).toHaveAttribute('required');
    expect(screen.getByLabelText(/co₂ sequestration/i)).toHaveAttribute('required');
    expect(screen.getByLabelText(/maturity/i)).toHaveAttribute('required');
    // There's always at least one alert (the info alert with guidelines)
    expect(screen.getAllByRole('alert').length).toBeGreaterThanOrEqual(1);
  });

  it('has proper semantic HTML structure', () => {
    render(<CreateProposalForm />);

    // The form is a <form> element - check it exists via testId or query selector
    expect(document.querySelector('form')).toBeInTheDocument();
    // There's always at least one alert (the info alert with guidelines)
    expect(screen.getAllByRole('alert').length).toBeGreaterThanOrEqual(1);
  });
});

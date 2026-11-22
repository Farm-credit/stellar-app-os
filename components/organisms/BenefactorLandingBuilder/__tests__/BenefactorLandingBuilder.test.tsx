import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { BenefactorLandingBuilder } from '../BenefactorLandingBuilder';
import { resetBenefactorStoreForTesting } from '@/lib/api/benefactor-landing';

describe('BenefactorLandingBuilder Component', () => {
  beforeEach(() => {
    resetBenefactorStoreForTesting();
  });

  it('renders initial benefactor branding in view mode', () => {
    render(<BenefactorLandingBuilder />);

    expect(screen.getByText('Benefactor Landing Page')).toBeInTheDocument();
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    expect(screen.getByText('/sponsor/acme-corp')).toBeInTheDocument();
    expect(screen.getByText('Live & Public')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Customize Landing Page/i })).toBeInTheDocument();
  });

  it('switches to edit mode upon clicking Customize Landing Page', () => {
    render(<BenefactorLandingBuilder />);

    const customizeButton = screen.getByRole('button', {
      name: /Customize Landing Page/i,
    });
    fireEvent.click(customizeButton);

    expect(screen.getByLabelText(/Public Brand Name/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Save Changes/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Cancel/i })).toBeInTheDocument();
  });

  it('allows editing branding and saves successfully', () => {
    const onSaved = vi.fn();
    render(<BenefactorLandingBuilder onSaved={onSaved} />);

    // Switch to edit mode
    fireEvent.click(screen.getByRole('button', { name: /Customize Landing Page/i }));

    const nameInput = screen.getByLabelText(/Public Brand Name/i);
    fireEvent.change(nameInput, { target: { value: 'Acme Sustainable' } });

    fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));

    expect(screen.getByText(/Landing page branding updated successfully/i)).toBeInTheDocument();
    expect(onSaved).toHaveBeenCalledWith(
      expect.objectContaining({
        brandName: 'Acme Sustainable',
      })
    );
  });

  it('displays an error message when saving an invalid slug', () => {
    render(<BenefactorLandingBuilder />);

    fireEvent.click(screen.getByRole('button', { name: /Customize Landing Page/i }));

    const slugInput = screen.getByPlaceholderText('acme-corp');
    fireEvent.change(slugInput, { target: { value: 'invalid@slug!' } });

    fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));

    expect(screen.getByText(/Invalid brand slug/i)).toBeInTheDocument();
  });

  it('cancels editing without persisting changes', () => {
    render(<BenefactorLandingBuilder />);

    fireEvent.click(screen.getByRole('button', { name: /Customize Landing Page/i }));

    const nameInput = screen.getByLabelText(/Public Brand Name/i);
    fireEvent.change(nameInput, { target: { value: 'Discarded Name' } });

    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));

    // Back in view mode with original name
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    expect(screen.queryByText('Discarded Name')).not.toBeInTheDocument();
  });
});

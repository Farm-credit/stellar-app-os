import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageSelector } from '../LanguageSelector';

const changeLanguage = vi.fn();

vi.mock('@/hooks/useTranslation', () => ({
  useAppTranslation: () => ({
    language: 'en',
    changeLanguage,
    supportedLanguages: ['en', 'ha', 'fr', 'es'],
    t: (key: string) =>
      key === 'header.languageChangeError'
        ? "We couldn't change the language. Please try again."
        : 'Select language',
  }),
}));

describe('LanguageSelector', () => {
  beforeEach(() => {
    changeLanguage.mockReset();
    changeLanguage.mockResolvedValue(undefined);
  });

  it('renders the four supported languages with accessible selection state', async () => {
    const user = userEvent.setup();
    render(<LanguageSelector />);

    await user.click(screen.getByRole('button', { name: 'Select language' }));

    expect(screen.getAllByRole('option')).toHaveLength(4);
    expect(screen.getByRole('option', { name: 'English' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.getByRole('option', { name: 'English' })).toBeDisabled();
    expect(screen.getByRole('option', { name: 'Hausa' })).toBeEnabled();
    expect(screen.queryByText('Português')).not.toBeInTheDocument();
  });

  it('changes language and closes the selector', async () => {
    const user = userEvent.setup();
    render(<LanguageSelector />);

    await user.click(screen.getByRole('button', { name: 'Select language' }));
    await user.click(screen.getByRole('option', { name: 'Français' }));

    expect(changeLanguage).toHaveBeenCalledWith('fr');
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
  });

  it('supports arrow-key navigation and escape', async () => {
    const user = userEvent.setup();
    render(<LanguageSelector />);

    const trigger = screen.getByRole('button', { name: 'Select language' });
    await user.click(trigger);
    screen.getByRole('option', { name: 'Hausa' }).focus();
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'ArrowDown' });

    expect(screen.getByRole('option', { name: 'Français' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('shows an accessible error when a language change fails', async () => {
    changeLanguage.mockRejectedValueOnce(new Error('network error'));
    const user = userEvent.setup();
    render(<LanguageSelector variant="mobile" />);

    await user.click(screen.getByRole('button', { name: 'Select language' }));
    await user.click(screen.getByRole('option', { name: 'Español' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "We couldn't change the language. Please try again."
    );
  });
});

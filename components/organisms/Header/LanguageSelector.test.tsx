import { render, screen, fireEvent, within, waitFor, act, cleanup } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import i18n from '@/lib/i18n/config';
import { LanguageSelector } from './LanguageSelector';

describe('LanguageSelector', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  afterEach(async () => {
    // Unmount first so restoring the language does not update a mounted component.
    cleanup();
    await act(async () => {
      await i18n.changeLanguage('en');
    });
  });

  // ── Trigger / accessible name ──────────────────────────────────────────────

  it('renders the trigger with the current language and proper ARIA attributes', () => {
    render(<LanguageSelector />);

    const trigger = screen.getByRole('button', { name: /select language/i });
    expect(trigger).toHaveAttribute('aria-haspopup', 'listbox');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveTextContent('English');
  });

  // ── Open / list contents ───────────────────────────────────────────────────

  it('opens a listbox listing every supported language', () => {
    render(<LanguageSelector />);

    fireEvent.click(screen.getByRole('button', { name: /select language/i }));

    const listbox = screen.getByRole('listbox', { name: /select language/i });
    expect(listbox).toBeInTheDocument();
    expect(within(listbox).getAllByRole('option')).toHaveLength(5);

    for (const label of ['English', 'Hausa', 'Français', 'Español', 'Português']) {
      expect(screen.getByRole('option', { name: label })).toBeInTheDocument();
    }
  });

  it('marks the active language as selected and the others as not selected', () => {
    render(<LanguageSelector />);

    fireEvent.click(screen.getByRole('button', { name: /select language/i }));

    expect(screen.getByRole('option', { name: 'English' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.getByRole('option', { name: 'Hausa' })).toHaveAttribute('aria-selected', 'false');
  });

  it('sets aria-expanded to true while the listbox is open', () => {
    render(<LanguageSelector />);

    const trigger = screen.getByRole('button', { name: /select language/i });
    fireEvent.click(trigger);

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  // ── Selection ──────────────────────────────────────────────────────────────

  it('changes the language, updates <html lang> and closes the menu when an option is chosen', async () => {
    render(<LanguageSelector />);

    const trigger = screen.getByRole('button', { name: /select language/i });
    fireEvent.click(trigger);
    await act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Hausa' }));
    });

    await waitFor(() => expect(i18n.language).toBe('ha'));

    expect(document.documentElement.lang).toBe('ha');
    expect(trigger).toHaveTextContent('Hausa');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  // ── Dismissal ──────────────────────────────────────────────────────────────

  it('closes on Escape and restores focus to the trigger', () => {
    render(<LanguageSelector />);

    const trigger = screen.getByRole('button', { name: /select language/i });
    fireEvent.click(trigger);
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('closes when clicking outside the component', () => {
    render(
      <div>
        <LanguageSelector />
        <button type="button">outside</button>
      </div>
    );

    fireEvent.click(screen.getByRole('button', { name: /select language/i }));
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole('button', { name: 'outside' }));

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  // ── Variants ───────────────────────────────────────────────────────────────

  it('renders the mobile variant as a full-width container', () => {
    const { container } = render(<LanguageSelector variant="mobile" />);

    expect(container.firstChild).toHaveClass('w-full');
    expect(screen.getByRole('button', { name: /select language/i })).toHaveClass('w-full');
  });
});

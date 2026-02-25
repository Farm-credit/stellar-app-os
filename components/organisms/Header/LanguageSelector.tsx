'use client';

import { useState, useRef, useEffect, useCallback, JSX } from 'react';
import { Globe, ChevronDown, Check } from 'lucide-react';
import { useAppTranslation } from '@/hooks/useTranslation';
import { LANGUAGE_LABELS } from '@/lib/i18n/config';
import type { SupportedLanguage } from '@/lib/i18n/config';

interface LanguageSelectorProps {
  /** Pass 'mobile' to render a full-width version inside the drawer */
  variant?: 'desktop' | 'mobile';
}

export function LanguageSelector({ variant = 'desktop' }: LanguageSelectorProps): JSX.Element {
  const { language, changeLanguage, supportedLanguages, t } = useAppTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent): void {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        setIsOpen(false);
        buttonRef.current?.focus();
      }
    }
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const handleSelect = useCallback(
    async (lang: SupportedLanguage): Promise<void> => {
      await changeLanguage(lang);
      setIsOpen(false);
      buttonRef.current?.focus();
    },
    [changeLanguage],
  );

  const isMobile = variant === 'mobile';

  return (
    <div
      ref={containerRef}
      className={isMobile ? 'relative w-full' : 'relative'}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={t('header.languageSelector')}
        onClick={() => setIsOpen((prev) => !prev)}
        className={
          isMobile
            ? 'flex w-full items-center justify-between rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-stellar-blue'
            : 'flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-foreground hover:bg-muted transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-stellar-blue'
        }
      >
        <Globe className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>{LANGUAGE_LABELS[language]}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {isOpen && (
        <ul
          role="listbox"
          aria-label={t('header.languageSelector')}
          aria-activedescendant={`lang-option-${language}`}
          className={
            isMobile
              ? 'mt-1 w-full rounded-md border border-border bg-background shadow-md py-1 z-50'
              : 'absolute right-0 mt-1 w-44 rounded-md border border-border bg-background shadow-lg py-1 z-50'
          }
        >
          {supportedLanguages.map((lang) => (
            <li
              key={lang}
              id={`lang-option-${lang}`}
              role="option"
              aria-selected={lang === language}
            >
              <button
                type="button"
                onClick={() => handleSelect(lang)}
                className="flex w-full items-center justify-between px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors focus:outline-none focus-visible:bg-muted"
              >
                <span>{LANGUAGE_LABELS[lang]}</span>
                {lang === language && (
                  <Check className="h-4 w-4 text-stellar-blue" aria-hidden="true" />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
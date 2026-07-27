'use client';

import { useCallback, useEffect, useRef, useState, type JSX, type KeyboardEvent } from 'react';
import { Check, ChevronDown, Globe, LoaderCircle } from 'lucide-react';
import { useAppTranslation } from '@/hooks/useTranslation';
import { LANGUAGE_LABELS, type SupportedLanguage } from '@/lib/i18n/config';

interface LanguageSelectorProps {
  /** Pass "mobile" to render a full-width version inside the drawer. */
  variant?: 'desktop' | 'mobile';
}

export function LanguageSelector({ variant = 'desktop' }: LanguageSelectorProps): JSX.Element {
  const { language, changeLanguage, supportedLanguages, t } = useAppTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [isChanging, setIsChanging] = useState(false);
  const [changeError, setChangeError] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const isMobile = variant === 'mobile';

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent): void => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const handleEscape = (event: globalThis.KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        buttonRef.current?.focus();
      }
    };

    if (isOpen) document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen]);

  const handleSelect = useCallback(
    async (lang: SupportedLanguage): Promise<void> => {
      if (lang === language || isChanging) return;

      setIsChanging(true);
      setChangeError('');
      try {
        await changeLanguage(lang);
        setIsOpen(false);
        buttonRef.current?.focus();
      } catch {
        setChangeError(t('header.languageChangeError'));
      } finally {
        setIsChanging(false);
      }
    },
    [changeLanguage, isChanging, language, t]
  );

  const handleListKeyDown = (event: KeyboardEvent<HTMLUListElement>): void => {
    const currentIndex = optionRefs.current.findIndex(
      (option) => option === document.activeElement
    );
    let nextIndex = currentIndex;

    if (event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % supportedLanguages.length;
    else if (event.key === 'ArrowUp')
      nextIndex = (currentIndex - 1 + supportedLanguages.length) % supportedLanguages.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = supportedLanguages.length - 1;
    else return;

    event.preventDefault();
    optionRefs.current[nextIndex]?.focus();
  };

  return (
    <div ref={containerRef} className={isMobile ? 'relative w-full' : 'relative'}>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={t('header.languageSelector')}
        disabled={isChanging}
        onClick={() => setIsOpen((previous) => !previous)}
        className={
          isMobile
            ? 'flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-stellar-blue disabled:cursor-wait disabled:opacity-60'
            : 'flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-stellar-blue disabled:cursor-wait disabled:opacity-60'
        }
      >
        {isChanging ? (
          <LoaderCircle className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
        ) : (
          <Globe className="h-4 w-4 shrink-0" aria-hidden="true" />
        )}
        <span>{LANGUAGE_LABELS[language]}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`}
          aria-hidden="true"
        />
      </button>

      {isOpen && (
        <ul
          role="listbox"
          aria-label={t('header.languageSelector')}
          aria-activedescendant={`lang-option-${language}`}
          onKeyDown={handleListKeyDown}
          className={
            isMobile
              ? 'z-50 mt-1 w-full rounded-xl border border-border bg-background py-1 shadow-md'
              : 'absolute right-0 z-50 mt-1 w-44 rounded-xl border border-border bg-background py-1 shadow-xl'
          }
        >
          {supportedLanguages.map((lang, index) => (
            <li key={lang} role="presentation">
              <button
                ref={(element) => {
                  optionRefs.current[index] = element;
                }}
                id={`lang-option-${lang}`}
                type="button"
                role="option"
                aria-selected={lang === language}
                disabled={isChanging || lang === language}
                onClick={() => handleSelect(lang)}
                className="flex w-full items-center justify-between px-3 py-2.5 text-sm text-foreground transition-colors hover:bg-muted focus:outline-none focus-visible:bg-muted disabled:cursor-default disabled:bg-muted/50 disabled:text-muted-foreground"
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

      {changeError && (
        <p role="alert" className="mt-1 text-xs font-medium text-destructive">
          {changeError}
        </p>
      )}
    </div>
  );
}

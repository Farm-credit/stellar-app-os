'use client';

import React, { useState, type ChangeEvent, type FormEvent } from 'react';
import { Mail, CheckCircle, Loader2 } from 'lucide-react';
import { useAppTranslation } from '@/hooks/useTranslation';

interface NewsletterFormState {
  email: string;
  status: 'idle' | 'loading' | 'success' | 'error';
  message: string;
}

export function NewsletterForm(): React.ReactNode {
  const { t } = useAppTranslation();
  const [state, setState] = useState<NewsletterFormState>({
    email: '',
    status: 'idle',
    message: '',
  });

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleEmailChange = (e: ChangeEvent<HTMLInputElement>): void => {
    setState((prev) => ({ ...prev, email: e.target.value, message: '' }));
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();

    if (!state.email.trim()) {
      setState((prev) => ({ ...prev, status: 'error', message: t('newsletter.emailRequired') }));
      return;
    }

    if (!validateEmail(state.email)) {
      setState((prev) => ({ ...prev, status: 'error', message: t('newsletter.invalidEmail') }));
      return;
    }

    setState((prev) => ({ ...prev, status: 'loading', message: '' }));

    try {
      await new Promise((resolve) => setTimeout(resolve, 800));
      setState({ email: '', status: 'success', message: t('newsletter.successMessage') });
      setTimeout(() => {
        setState({ email: '', status: 'idle', message: '' });
      }, 4000);
    } catch {
      setState((prev) => ({
        ...prev,
        status: 'error',
        message: t('newsletter.errorMessage'),
      }));
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className="relative flex items-center bg-white/5 backdrop-blur-md border border-white/10 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-cyan-400 transition-all">
        <div className="pl-4 text-slate-400">
          <Mail className="w-4 h-4" />
        </div>
        <input
          type="email"
          value={state.email}
          onChange={handleEmailChange}
          placeholder={t('newsletter.emailPlaceholder')}
          disabled={state.status === 'loading'}
          className="flex-1 bg-transparent px-3 py-2 text-sm text-white placeholder-slate-400 focus:outline-none"
          aria-label={t('newsletter.emailAriaLabel')}
          required
        />
      </div>

      <button
        type="submit"
        disabled={state.status === 'loading'}
        className="h-9 mt-2 cursor-pointer rounded-xl px-5 text-sm font-semibold text-white bg-linear-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 transition-all disabled:opacity-60 flex items-center justify-center"
      >
        {state.status === 'loading' ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          t('newsletter.subscribe')
        )}
      </button>

      {state.message && (
        <div className="mt-3 flex items-center gap-2 text-sm">
          {state.status === 'success' && <CheckCircle className="w-4 h-4 text-emerald-400" />}
          <p className={state.status === 'success' ? 'text-emerald-400' : 'text-red-400'}>
            {state.message}
          </p>
        </div>
      )}
    </form>
  );
}
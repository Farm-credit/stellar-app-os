'use client';

import React, { useState, type FormEvent, type ChangeEvent } from 'react';

interface FormState {
  email: string;
  consent: boolean;
  status: 'idle' | 'loading' | 'success' | 'error';
  message: string;
}

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function NewsletterSignup(): React.ReactElement {
  const [state, setState] = useState<FormState>({
    email: '',
    consent: false,
    status: 'idle',
    message: '',
  });

  const validate = (): boolean => {
    if (!emailRegex.test(state.email)) {
      setState(s => ({ ...s, status: 'error', message: 'Enter a valid email address.' }));
      return false;
    }
    if (!state.consent) {
      setState(s => ({ ...s, status: 'error', message: 'Consent is required.' }));
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    if (!validate()) return;

    setState(s => ({ ...s, status: 'loading', message: '' }));

    try {
      const res = await fetch('/api/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: state.email }),
      });

      if (!res.ok) throw new Error();

      setState({
        email: '',
        consent: false,
        status: 'success',
        message: 'Check your inbox to confirm subscription.',
      });
    } catch {
      setState(s => ({
        ...s,
        status: 'error',
        message: 'Subscription failed. Please try again.',
      }));
    }
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>): void => {
    const { name, value, checked, type } = e.target;
    setState(s => ({
      ...s,
      [name]: type === 'checkbox' ? checked : value,
      message: '',
    }));
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full max-w-md space-y-3"
      aria-labelledby="newsletter-heading"
    >
      <h2 id="newsletter-heading" className="text-lg font-semibold">
        Subscribe to our newsletter
      </h2>

      <div>
        <label htmlFor="newsletter-email" className="block text-sm font-medium">
          Email address
        </label>
        <input
          id="newsletter-email"
          name="email"
          type="email"
          required
          value={state.email}
          onChange={handleChange}
          disabled={state.status === 'loading'}
          className="mt-1 w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring"
        />
      </div>

      <div className="flex items-start gap-2">
        <input
          id="gdpr-consent"
          name="consent"
          type="checkbox"
          checked={state.consent}
          onChange={handleChange}
          required
        />
        <label htmlFor="gdpr-consent" className="text-sm">
          I agree to receive emails and accept the privacy policy.
        </label>
      </div>

      <button
        type="submit"
        disabled={state.status === 'loading'}
        className="w-full rounded-md bg-black text-white py-2 text-sm font-medium disabled:opacity-50"
      >
        {state.status === 'loading' ? 'Submitting…' : 'Subscribe'}
      </button>

      {state.message && (
        <p
          role="status"
          className={`text-sm ${state.status === 'success' ? 'text-green-600' : 'text-red-600'}`}
        >
          {state.message}
        </p>
      )}
    </form>
  );
}

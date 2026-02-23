'use client';

import React, { useState } from 'react';

interface ReferralLinkCardProps {
  referralLink: string;
}

export default function ReferralLinkCard({ referralLink }: ReferralLinkCardProps) {
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(referralLink);
      setStatus('success');
      setTimeout(() => setStatus('idle'), 2000);
    } catch {
      setStatus('error');
      setTimeout(() => setStatus('idle'), 2000);
    }
  };

  return (
    <div className="rounded-lg border border-gray-200 p-4 mb-6">
      <label htmlFor="ref-link" className="block text-sm font-medium mb-2">
        Your referral link
      </label>
      <div className="flex items-center gap-2">
        <input
          id="ref-link"
          type="text"
          readOnly
          value={referralLink}
          className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm bg-gray-50"
        />
        <button
          onClick={handleCopy}
          aria-live="polite"
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {status === 'success' ? '✓ Copied!' : status === 'error' ? 'Failed' : 'Copy'}
        </button>
      </div>
    </div>
  );
}

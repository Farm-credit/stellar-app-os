'use client';

import React from 'react';

interface SocialShareButtonsProps {
  referralLink: string;
}

export default function SocialShareButtons({ referralLink }: SocialShareButtonsProps) {
  const encoded = encodeURIComponent(referralLink);

  const handleNativeShare = async () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          url: referralLink,
          text: 'Join me on Stellar App!',
        });
      } catch {
        // user cancelled or share failed — no action needed
      }
    }
  };

  const linkClass =
    'inline-flex items-center rounded px-4 py-2 text-sm font-medium text-white no-underline hover:opacity-90 focus:outline-none focus:ring-2';

  return (
    <section aria-labelledby="share-heading" className="mb-6">
      <h2 id="share-heading" className="text-xl font-semibold mb-3">
        Share Your Link
      </h2>
      <div className="flex flex-wrap gap-3">
        <a
          href={`https://twitter.com/intent/tweet?url=${encoded}&text=Check%20out%20Stellar%20App!`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Share on Twitter"
          className={`${linkClass} bg-black`}
        >
          Twitter / X
        </a>
        <a
          href={`https://www.facebook.com/sharer/sharer.php?u=${encoded}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Share on Facebook"
          className={`${linkClass} bg-blue-600`}
        >
          Facebook
        </a>
        <a
          href={`https://www.linkedin.com/shareArticle?mini=true&url=${encoded}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Share on LinkedIn"
          className={`${linkClass} bg-blue-800`}
        >
          LinkedIn
        </a>
        <button
          onClick={handleNativeShare}
          aria-label="Share via device"
          className={`${linkClass} bg-gray-700 cursor-pointer`}
        >
          Share…
        </button>
      </div>
    </section>
  );
}

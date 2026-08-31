'use client';

import React, { useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Share2, Check, Globe } from 'lucide-react';

interface SocialShareCardProps {
  totalTrees: number;
  totalOffsetKg: number;
}

export function SocialShareCard({ totalTrees, totalOffsetKg }: SocialShareCardProps) {
  const [copied, setCopied] = useState(false);

  const shareText = `I just planted my ${totalTrees}th tree and offset ${totalOffsetKg.toLocaleString()}kg of CO2 with Harvesta! 🌍🌲 Join me in making a real environmental impact on Stellar.`;

  const handleShare = async () => {
    // Attempt to use native Web Share API on supported devices
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'My Harvesta Impact',
          text: shareText,
          url: window.location.origin, // point to home page
        });
        return;
      } catch (err) {
        console.warn('Share rejected or failed', err);
      }
    }

    // Fallback to Clipboard
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      console.error('Failed to copy to clipboard', err);
    }
  };

  return (
    <Card className="bg-gradient-to-br from-emerald-500 to-teal-600 text-white overflow-hidden relative border-none shadow-md">
      <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
        <Globe className="w-32 h-32" />
      </div>
      <CardHeader>
        <CardTitle className="text-white text-2xl font-bold">Share Your Impact</CardTitle>
        <CardDescription className="text-emerald-100">
          Inspire others to join the movement by sharing your environmental footprint.
        </CardDescription>
      </CardHeader>
      <CardContent className="relative z-10">
        <div className="bg-white/20 p-4 rounded-lg backdrop-blur-sm border border-white/30 text-sm md:text-base leading-relaxed">
          &quot;{shareText}&quot;
        </div>
      </CardContent>
      <CardFooter>
        <Button
          onClick={handleShare}
          variant="secondary"
          className="w-full bg-white text-emerald-700 hover:bg-slate-50 transition-all font-semibold"
        >
          {copied ? (
            <>
              <Check className="w-4 h-4 mr-2" />
              Copied to Clipboard!
            </>
          ) : (
            <>
              <Share2 className="w-4 h-4 mr-2" />
              Share on Social Media
            </>
          )}
        </Button>
      </CardFooter>
    </Card>
  );
}

/**
 * SocialShare Molecule Component
 *
 * Social media sharing buttons with copy-to-clipboard functionality.
 * Allows users to share their environmental impact across platforms.
 */

"use client";

import { useState } from "react";
import {
  Twitter,
  Facebook,
  Linkedin,
  Link as LinkIcon,
  Check,
} from "lucide-react";
import { generateShareText } from "@/lib/Impact-utils";
import { SharePlatform } from "@/types/impact.types";

interface SocialShareProps {
  totalCO2: number;
  totalTrees: number;
}

export function SocialShare({ totalCO2, totalTrees }: SocialShareProps) {
  const [copied, setCopied] = useState(false);

  const shareUrl = typeof window !== "undefined" ? window.location.href : "";
  const shareText = generateShareText(totalCO2, totalTrees);

  /**
   * Handle share action for different platforms
   */
  const handleShare = (platform: SharePlatform) => {
    const encodedText = encodeURIComponent(shareText);
    const encodedUrl = encodeURIComponent(shareUrl);

    const shareUrls: Record<SharePlatform, string> = {
      twitter: `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}&hashtags=ClimateAction,Sustainability`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}&quote=${encodedText}`,
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
      copy: "",
    };

    if (platform === "copy") {
      navigator.clipboard.writeText(`${shareText} ${shareUrl}`).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      });
      return;
    }

    // Open share dialog
    window.open(
      shareUrls[platform],
      "_blank",
      "noopener,noreferrer,width=600,height=500",
    );
  };

  return (
    <div className="bg-linear-to-br from-card to-card/50 border border-border rounded-2xl p-8 shadow-lg">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
        {/* Text content */}
        <div className="space-y-2">
          <h3 className="text-xl font-bold text-foreground">
            Share Your Impact
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Inspire others to make a difference and join the movement
          </p>
        </div>

        {/* Share buttons */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => handleShare("twitter")}
            className="p-3.5 rounded-xl bg-secondary hover:bg-stellar-blue hover:text-white transition-all duration-200 hover:scale-110 hover:shadow-lg hover:shadow-stellar-blue/20"
            aria-label="Share on Twitter"
          >
            <Twitter className="w-5 h-5" strokeWidth={2} />
          </button>

          <button
            onClick={() => handleShare("facebook")}
            className="p-3.5 rounded-xl bg-secondary hover:bg-blue-600 hover:text-white transition-all duration-200 hover:scale-110 hover:shadow-lg hover:shadow-blue-600/20"
            aria-label="Share on Facebook"
          >
            <Facebook className="w-5 h-5" strokeWidth={2} />
          </button>

          <button
            onClick={() => handleShare("linkedin")}
            className="p-3.5 rounded-xl bg-secondary hover:bg-blue-700 hover:text-white transition-all duration-200 hover:scale-110 hover:shadow-lg hover:shadow-blue-700/20"
            aria-label="Share on LinkedIn"
          >
            <Linkedin className="w-5 h-5" strokeWidth={2} />
          </button>

          <button
            onClick={() => handleShare("copy")}
            className="p-3.5 rounded-xl bg-secondary hover:bg-stellar-green hover:text-white transition-all duration-200 hover:scale-110 hover:shadow-lg hover:shadow-stellar-green/20"
            aria-label="Copy link to clipboard"
          >
            {copied ? (
              <Check className="w-5 h-5 text-stellar-green" strokeWidth={2.5} />
            ) : (
              <LinkIcon className="w-5 h-5" strokeWidth={2} />
            )}
          </button>
        </div>
      </div>

      {/* Preview text */}
      <div className="mt-6 p-4 bg-muted/50 rounded-xl border border-border/50">
        <p className="text-sm text-muted-foreground italic leading-relaxed">
          &quot;{shareText}&quot;
        </p>
      </div>
    </div>
  );
}

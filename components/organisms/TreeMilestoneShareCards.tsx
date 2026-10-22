'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Instagram, MessageCircle, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ReachedTreeMilestone } from '@/lib/trees/milestones';

export interface TreeMilestoneCardData extends ReachedTreeMilestone {
  co2Kg: number;
}

interface TreeMilestoneShareCardsProps {
  treePublicUrl: string;
  treeIdLabel: string;
  species: string;
  sponsorName: string;
  milestones: TreeMilestoneCardData[];
}

type SocialPlatform = 'instagram' | 'x' | 'whatsapp';

function filename(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-|-$/g, '') || 'tree'
  );
}

function formatCo2(value: number) {
  return `${new Intl.NumberFormat('en', { maximumFractionDigits: 1 }).format(value)} kg`;
}

/** Shows a branded card once a planted tree reaches one of its share milestones. */
export function TreeMilestoneShareCards({
  treePublicUrl,
  treeIdLabel,
  species,
  sponsorName,
  milestones,
}: TreeMilestoneShareCardsProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isWorking, setIsWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [absoluteTreeUrl, setAbsoluteTreeUrl] = useState(treePublicUrl);
  const cardRef = useRef<HTMLDivElement>(null);
  const selected = milestones[selectedIndex];

  useEffect(() => {
    setAbsoluteTreeUrl(new URL(treePublicUrl, window.location.origin).toString());
  }, [treePublicUrl]);

  const shareCaption = useMemo(
    () =>
      `${sponsorName} is celebrating the ${selected?.label.toLowerCase()} of a ${species} tree. It has captured an estimated ${formatCo2(selected?.co2Kg ?? 0)} of CO₂.`,
    [selected, sponsorName, species]
  );

  const createPng = async () => {
    if (!cardRef.current) throw new Error('Milestone card is not ready');
    const { default: html2canvas } = await import('html2canvas');
    const canvas = await html2canvas(cardRef.current, {
      backgroundColor: '#064e3b',
      scale: 2,
      useCORS: true,
    });
    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Could not encode milestone card as PNG'));
      }, 'image/png');
    });
  };

  const savePng = (blob: Blob) => {
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = `${filename(treeIdLabel)}-${selected.id}-milestone.png`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  };

  const handleDownload = async () => {
    setIsWorking(true);
    setMessage(null);
    try {
      savePng(await createPng());
      setMessage('Milestone card downloaded as PNG.');
    } catch (cause) {
      console.error('Milestone card export failed:', cause);
      setMessage('The PNG could not be created. Please try again.');
    } finally {
      setIsWorking(false);
    }
  };

  const handleShare = async (platform: SocialPlatform) => {
    setIsWorking(true);
    setMessage(null);
    try {
      if (platform === 'instagram') {
        const blob = await createPng();
        const file = new File([blob], `${filename(treeIdLabel)}-${selected.id}.png`, {
          type: 'image/png',
        });
        if (navigator.share && navigator.canShare?.({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: `${species} tree milestone`,
            text: shareCaption,
          });
          return;
        }
        savePng(blob);
        window.open('https://www.instagram.com/', '_blank', 'noopener,noreferrer');
        setMessage('PNG downloaded. Add it to your Instagram post or story.');
        return;
      }

      const encodedCaption = encodeURIComponent(shareCaption);
      const encodedUrl = encodeURIComponent(absoluteTreeUrl);
      const url =
        platform === 'x'
          ? `https://twitter.com/intent/tweet?text=${encodedCaption}&url=${encodedUrl}`
          : `https://wa.me/?text=${encodeURIComponent(`${shareCaption} ${absoluteTreeUrl}`)}`;
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (cause) {
      if (cause instanceof Error && cause.name === 'AbortError') return;
      console.error('Milestone sharing failed:', cause);
      setMessage('Sharing could not be started. Download the PNG and try again.');
    } finally {
      setIsWorking(false);
    }
  };

  if (milestones.length === 0) return null;

  return (
    <section aria-labelledby="tree-milestone-share-heading" className="space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stellar-green">
          Growth milestone reached
        </p>
        <h2 id="tree-milestone-share-heading" className="mt-1 text-xl font-semibold">
          Share this tree’s story
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          A branded card is ready for each milestone this tree has reached.
        </p>
      </div>

      {milestones.length > 1 ? (
        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-label="Choose a tree milestone card"
        >
          {milestones.map((milestone, index) => (
            <button
              key={milestone.id}
              type="button"
              aria-pressed={index === selectedIndex}
              onClick={() => setSelectedIndex(index)}
              className={`rounded-full border px-3 py-2 text-sm font-medium transition-colors ${index === selectedIndex ? 'border-stellar-green bg-stellar-green text-white' : 'border-border bg-card hover:bg-muted'}`}
            >
              {milestone.label}
            </button>
          ))}
        </div>
      ) : null}

      <div
        ref={cardRef}
        data-testid="tree-milestone-card"
        className="relative isolate flex min-h-[280px] flex-col justify-between overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-950 via-emerald-800 to-teal-700 p-7 text-white shadow-lg sm:min-h-[300px] sm:p-9"
      >
        <div className="pointer-events-none absolute -right-14 -top-20 h-64 w-64 rounded-full border-[30px] border-white/10" />
        <div className="relative flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span
              className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 text-xl"
              aria-hidden="true"
            >
              🌳
            </span>
            <span className="text-sm font-bold uppercase tracking-[0.2em] text-emerald-100">
              FarmCredit
            </span>
          </div>
          <span className="rounded-full border border-white/25 bg-white/10 px-3 py-1 text-xs font-semibold">
            {selected.label}
          </span>
        </div>
        <div className="relative my-8 space-y-3">
          <p className="text-sm text-emerald-100">A milestone worth celebrating</p>
          <h3 className="text-3xl font-bold leading-tight sm:text-4xl">
            {sponsorName}’s tree is growing strong.
          </h3>
          <p className="text-lg text-emerald-50">
            {species} · {treeIdLabel}
          </p>
        </div>
        <div className="relative flex flex-wrap items-end justify-between gap-4 border-t border-white/20 pt-5">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-emerald-100">
              Estimated CO₂ captured
            </p>
            <p className="mt-1 text-2xl font-bold">{formatCo2(selected.co2Kg)}</p>
          </div>
          <p className="max-w-44 text-right text-xs text-emerald-100">
            One tree. A lasting impact. Decentralized reforestation on Stellar.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={handleDownload} disabled={isWorking} variant="outline">
          <Download className="h-4 w-4" aria-hidden="true" />
          Download PNG
        </Button>
        <Button
          onClick={() => handleShare('instagram')}
          disabled={isWorking}
          variant="outline"
          aria-label="Share milestone card to Instagram"
        >
          <Instagram className="h-4 w-4" aria-hidden="true" />
          Instagram
        </Button>
        <Button
          onClick={() => handleShare('x')}
          disabled={isWorking}
          variant="outline"
          aria-label="Share tree milestone on X"
        >
          <Share2 className="h-4 w-4" aria-hidden="true" />X
        </Button>
        <Button
          onClick={() => handleShare('whatsapp')}
          disabled={isWorking}
          variant="outline"
          aria-label="Share tree milestone on WhatsApp"
        >
          <MessageCircle className="h-4 w-4" aria-hidden="true" />
          WhatsApp
        </Button>
      </div>
      {message ? (
        <p role="status" className="text-sm text-muted-foreground">
          {message}
        </p>
      ) : null}
      <span className="sr-only">Public tree profile URL: {absoluteTreeUrl}</span>
    </section>
  );
}

'use client';

import React, { useState } from 'react';
import { Building2, ExternalLink, Eye, Save, CheckCircle2, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/molecules/Card';
import { Button } from '@/components/atoms/Button';
import { Input } from '@/components/atoms/Input';
import { Textarea } from '@/components/atoms/Textarea';
import { Badge } from '@/components/atoms/Badge';
import type { BenefactorLandingConfig } from '@/lib/types/benefactor-landing';
import {
  getBenefactorConfigByWallet,
  saveBenefactorConfig,
  slugifyBrand,
} from '@/lib/api/benefactor-landing';

interface BenefactorLandingBuilderProps {
  walletAddress?: string;
  initialConfig?: BenefactorLandingConfig;
  onSaved?: (config: BenefactorLandingConfig) => void;
}

const DEFAULT_WALLET = 'GACME1111111111111111111111111111111111111111111111111111111';

export function BenefactorLandingBuilder({
  walletAddress = DEFAULT_WALLET,
  initialConfig,
  onSaved,
}: BenefactorLandingBuilderProps) {
  const existingConfig = initialConfig ??
    getBenefactorConfigByWallet(walletAddress) ?? {
      walletAddress,
      brandSlug: 'acme-corp',
      brandName: 'Acme Corp',
      logoUrl: '',
      coverImageUrl: '',
      description: '',
      introduction: '',
      websiteUrl: '',
      isPublished: true,
      updatedAt: new Date().toISOString(),
    };

  const [savedConfig, setSavedConfig] = useState<BenefactorLandingConfig>(existingConfig);
  const [isEditing, setIsEditing] = useState(false);
  const [brandName, setBrandName] = useState(existingConfig.brandName);
  const [brandSlug, setBrandSlug] = useState(existingConfig.brandSlug);
  const [logoUrl, setLogoUrl] = useState(existingConfig.logoUrl || '');
  const [coverImageUrl, setCoverImageUrl] = useState(existingConfig.coverImageUrl || '');
  const [description, setDescription] = useState(existingConfig.description);
  const [introduction, setIntroduction] = useState(existingConfig.introduction);
  const [websiteUrl, setWebsiteUrl] = useState(existingConfig.websiteUrl || '');
  const [isPublished, setIsPublished] = useState(existingConfig.isPublished);

  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const handleCancel = () => {
    setBrandName(savedConfig.brandName);
    setBrandSlug(savedConfig.brandSlug);
    setLogoUrl(savedConfig.logoUrl || '');
    setCoverImageUrl(savedConfig.coverImageUrl || '');
    setDescription(savedConfig.description);
    setIntroduction(savedConfig.introduction);
    setWebsiteUrl(savedConfig.websiteUrl || '');
    setIsPublished(savedConfig.isPublished);
    setIsEditing(false);
    setStatusMessage(null);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);

    const result = saveBenefactorConfig(walletAddress, {
      brandName,
      brandSlug,
      logoUrl,
      coverImageUrl,
      description,
      introduction,
      websiteUrl,
      isPublished,
    });

    if (result.success && result.config) {
      setSavedConfig(result.config);
      setStatusMessage({
        type: 'success',
        text: 'Landing page branding updated successfully!',
      });
      setIsEditing(false);
      if (onSaved) onSaved(result.config);
    } else {
      setStatusMessage({
        type: 'error',
        text: result.error || 'Failed to update landing page configuration.',
      });
    }
  };

  const publicUrl = `/sponsor/${savedConfig.brandSlug || brandSlug || 'preview'}`;

  return (
    <Card className="border-white/5 bg-stellar-navy/40">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle className="flex items-center gap-2 text-base font-semibold text-white">
          <Building2 className="h-5 w-5 text-stellar-purple" />
          Benefactor Landing Page
        </CardTitle>
        <div className="flex items-center gap-2">
          {savedConfig.isPublished ? (
            <Badge
              variant="secondary"
              className="bg-emerald-500/20 text-emerald-400 border-none text-[10px]"
            >
              Live &amp; Public
            </Badge>
          ) : (
            <Badge variant="outline" className="text-amber-400 border-amber-400/40 text-[10px]">
              Draft
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {statusMessage && (
          <div
            className={`flex items-center gap-2 rounded-lg p-3 text-xs ${
              statusMessage.type === 'success'
                ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
                : 'bg-rose-500/10 text-rose-300 border border-rose-500/20'
            }`}
          >
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0" />
            )}
            <span>{statusMessage.text}</span>
          </div>
        )}

        {!isEditing ? (
          /* View & Quick Actions Mode */
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-white/50">
                Brand Name
              </label>
              <div className="rounded-lg border border-white/5 bg-black/20 p-3 text-sm font-medium text-white">
                {savedConfig.brandName}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-white/50">
                Public Landing URL
              </label>
              <div className="flex items-center justify-between rounded-lg border border-white/5 bg-black/20 p-2.5 text-xs font-mono text-stellar-blue">
                <span className="truncate">{publicUrl}</span>
                <Link
                  href={publicUrl}
                  target="_blank"
                  className="ml-2 inline-flex items-center gap-1 text-[11px] text-white/80 hover:text-white"
                >
                  <Eye className="h-3.5 w-3.5" />
                  View
                </Link>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-white/50">
                CSR Mission &amp; Overview
              </label>
              <p className="rounded-lg border border-white/5 bg-black/20 p-3 text-xs text-white/70 line-clamp-2">
                {savedConfig.description || 'No description configured yet.'}
              </p>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <Button
                variant="outline"
                className="w-full text-xs py-2 border-white/10"
                onClick={() => setIsEditing(true)}
              >
                Customize Landing Page
              </Button>
              {savedConfig.isPublished && (
                <Button asChild variant="primary" className="text-xs py-2">
                  <Link href={publicUrl} target="_blank">
                    <ExternalLink className="h-3.5 w-3.5 mr-1" />
                    Visit
                  </Link>
                </Button>
              )}
            </div>
          </div>
        ) : (
          /* Edit Mode */
          <form onSubmit={handleSave} className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <label htmlFor="brandName" className="text-xs font-medium text-white/80">
                Public Brand Name
              </label>
              <Input
                id="brandName"
                value={brandName}
                onChange={(e) => {
                  setBrandName(e.target.value);
                  if (!brandSlug) {
                    setBrandSlug(slugifyBrand(e.target.value));
                  }
                }}
                placeholder="e.g. Acme Corp"
                required
                className="border-white/10 bg-black/30 text-white text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="brandSlug" className="text-xs font-medium text-white/80">
                  URL Slug
                </label>
                <button
                  type="button"
                  onClick={() => setBrandSlug(slugifyBrand(brandName))}
                  className="text-[10px] text-stellar-blue hover:underline"
                >
                  Auto-generate
                </button>
              </div>
              <div className="flex items-center rounded-lg border border-white/10 bg-black/30 px-3 text-xs text-white/50">
                <span>/sponsor/</span>
                <input
                  id="brandSlug"
                  type="text"
                  value={brandSlug}
                  onChange={(e) => setBrandSlug(e.target.value.toLowerCase().trim())}
                  placeholder="acme-corp"
                  required
                  className="flex-1 bg-transparent py-2 pl-0.5 text-white focus:outline-none"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="logoUrl" className="text-xs font-medium text-white/80">
                Logo Image URL
              </label>
              <Input
                id="logoUrl"
                type="url"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                placeholder="https://example.com/logo.png"
                className="border-white/10 bg-black/30 text-white text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="coverImageUrl" className="text-xs font-medium text-white/80">
                Cover Banner Image URL
              </label>
              <Input
                id="coverImageUrl"
                type="url"
                value={coverImageUrl}
                onChange={(e) => setCoverImageUrl(e.target.value)}
                placeholder="https://example.com/banner.jpg"
                className="border-white/10 bg-black/30 text-white text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="description" className="text-xs font-medium text-white/80">
                Brief Description
              </label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Short tagline or summary for cards and search..."
                rows={2}
                className="border-white/10 bg-black/30 text-white text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="introduction" className="text-xs font-medium text-white/80">
                Public CSR Introduction
              </label>
              <Textarea
                id="introduction"
                value={introduction}
                onChange={(e) => setIntroduction(e.target.value)}
                placeholder="Full public statement detailing corporate commitment to supported farmers..."
                rows={3}
                className="border-white/10 bg-black/30 text-white text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="websiteUrl" className="text-xs font-medium text-white/80">
                Corporate Website URL
              </label>
              <Input
                id="websiteUrl"
                type="url"
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                placeholder="https://acme-example.com"
                className="border-white/10 bg-black/30 text-white text-xs"
              />
            </div>

            <div className="flex items-center gap-3 pt-2">
              <input
                id="isPublished"
                type="checkbox"
                checked={isPublished}
                onChange={(e) => setIsPublished(e.target.checked)}
                className="h-4 w-4 rounded border-white/20 bg-black/40 text-stellar-blue focus:ring-stellar-blue"
              />
              <label
                htmlFor="isPublished"
                className="text-xs font-medium text-white cursor-pointer"
              >
                Publish page publicly at{' '}
                <span className="font-mono text-stellar-blue">/sponsor/{brandSlug || 'slug'}</span>
              </label>
            </div>

            <div className="flex items-center gap-2 pt-3">
              <Button type="submit" variant="primary" className="flex-1 text-xs py-2">
                <Save className="h-3.5 w-3.5 mr-1" />
                Save Changes
              </Button>
              <Button
                type="button"
                variant="outline"
                className="text-xs py-2 border-white/10"
                onClick={handleCancel}
              >
                Cancel
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

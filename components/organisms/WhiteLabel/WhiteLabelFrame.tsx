'use client';

import * as React from 'react';
import Image from 'next/image';

import { buildThemeVariables, type WhiteLabelConfig } from '@/lib/whiteLabel';

/**
 * Applies a partner's white-label palette and logo to everything rendered
 * inside it via CSS custom properties, so embedded or partner-hosted pages
 * carry the partner brand instead of FarmCredit. (#1713)
 */
export function WhiteLabelFrame({
  config,
  children,
  className,
}: {
  config: WhiteLabelConfig;
  children: React.ReactNode;
  className?: string;
}) {
  const style = buildThemeVariables(config) as React.CSSProperties;

  return (
    <div
      className={className}
      style={{
        ...style,
        backgroundColor: 'var(--wl-background)',
      }}
      data-testid="white-label-frame"
      data-partner-id={config.partnerId}
    >
      <header className="flex items-center gap-3 border-b border-black/10 px-6 py-4">
        <Image
          src={config.branding.logoUrl}
          alt={`${config.branding.partnerName} logo`}
          width={40}
          height={40}
          className="h-10 w-10 rounded-full object-cover"
        />
        <div>
          <p className="text-lg font-bold" style={{ color: 'var(--wl-primary)' }}>
            {config.branding.partnerName}
          </p>
          <p className="text-xs text-muted-foreground">{config.branding.customDomain}</p>
        </div>
      </header>
      <main className="px-6 py-8">{children}</main>
    </div>
  );
}

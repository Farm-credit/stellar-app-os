import { describe, expect, it } from 'vitest';

import { buildAnniversaryEmailContent, type AnniversaryEmailInput } from '../anniversary-email';

const INPUT: AnniversaryEmailInput = {
  sponsorName: 'Alice Johnson',
  treeId: 'HRV-2024-0001',
  species: 'Teak',
  projectName: 'Northern Savanna Reforestation',
  yearsOld: 2,
  plantedAt: '2024-03-12T08:00:00Z',
  cumulativeCo2Kg: 43.7,
  annualCo2Kg: 22,
  latestPhotoUrl: 'https://images.example.com/trees/hrv-0001/latest.jpg',
  shareUrl: 'https://farmcredit.app/trees/HRV-2024-0001',
  ogImageUrl: 'https://farmcredit.app/trees/HRV-2024-0001/opengraph-image',
};

describe('Anniversary email content (Issue #1647)', () => {
  it('includes the latest health photo', () => {
    const { html, text } = buildAnniversaryEmailContent(INPUT);
    expect(html).toContain('Latest health photo');
    expect(html).toContain(INPUT.latestPhotoUrl!);
    expect(text).toContain(INPUT.latestPhotoUrl!);
  });

  it('includes cumulative CO₂ absorbed to date', () => {
    const { html, text } = buildAnniversaryEmailContent(INPUT);
    expect(html).toContain('CO₂ absorbed to date');
    expect(html).toContain('43.7 kg');
    expect(text).toContain('CO₂ absorbed to date: 43.7 kg');
    // Annual rate is shown alongside the cumulative figure.
    expect(html).toContain('22.0 kg / year');
  });

  it('renders a shareable social card with share links', () => {
    const { html, shareUrls, shareText } = buildAnniversaryEmailContent(INPUT);

    expect(shareUrls.twitter).toContain('https://twitter.com/intent/tweet');
    expect(shareUrls.twitter).toContain(encodeURIComponent(INPUT.shareUrl));
    expect(shareUrls.facebook).toContain('https://www.facebook.com/sharer/sharer.php');
    expect(shareUrls.linkedin).toContain('https://www.linkedin.com/sharing/share-offsite');

    // Card block in the email body carries the share links and social image.
    expect(html).toContain('Share your anniversary');
    expect(html).toContain(shareUrls.twitter);
    expect(html).toContain(shareUrls.facebook);
    expect(html).toContain(shareUrls.linkedin);
    expect(html).toContain(INPUT.ogImageUrl!);
    expect(shareText).toContain('HRV-2024-0001');
    expect(shareText).toContain('44 kg of CO₂');
  });

  it('states the anniversary number in the subject and body', () => {
    const { subject, html } = buildAnniversaryEmailContent(INPUT);
    expect(subject).toContain('turns 2');
    expect(subject).toContain('HRV-2024-0001');
    expect(html).toContain('2 years');
    expect(html).toContain('March 12, 2024');
  });

  it('degrades gracefully without a photo or social image', () => {
    const { html, text } = buildAnniversaryEmailContent({
      ...INPUT,
      latestPhotoUrl: undefined,
      ogImageUrl: undefined,
      annualCo2Kg: undefined,
    });
    expect(html).toContain('No field photo has been uploaded yet');
    expect(html).not.toContain('Current annual rate');
    expect(text).toContain('No field photo has been uploaded yet');
    // Share links still render without an image.
    expect(html).toContain('Share on X');
  });

  it('escapes user-influenced values', () => {
    const { html } = buildAnniversaryEmailContent({
      ...INPUT,
      sponsorName: '<Script>alert(1)</Script>',
      species: 'Teak & "Oak"',
    });
    expect(html).not.toContain('<Script>');
    expect(html).toContain('&lt;Script&gt;');
    expect(html).toContain('Teak &amp; &quot;Oak&quot;');
  });
});

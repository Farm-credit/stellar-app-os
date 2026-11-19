/**
 * Sponsorship anniversary email content — Issue #1647
 *
 * Pure builder (no I/O) so the email body can be unit tested: latest health
 * photo, cumulative CO₂ absorbed to date, and a shareable social card with
 * X/Facebook/LinkedIn share links.
 */

export interface AnniversaryEmailInput {
  sponsorName: string;
  treeId: string;
  species: string;
  projectName: string;
  /** Which anniversary this is (1 = first year, …). */
  yearsOld: number;
  /** Original planting date, ISO-8601. */
  plantedAt: string;
  /** CO₂ absorbed since planting, kilograms. */
  cumulativeCo2Kg: number;
  /** Current annual sequestration rate, kilograms per year. */
  annualCo2Kg?: number;
  /** URL of the latest health photo, when available. */
  latestPhotoUrl?: string;
  /** Absolute link to the tree's page. */
  shareUrl: string;
  /** Absolute URL of the tree's generated social-card image. */
  ogImageUrl?: string;
}

export interface AnniversaryEmailContent {
  subject: string;
  text: string;
  html: string;
  shareText: string;
  shareUrls: {
    twitter: string;
    facebook: string;
    linkedin: string;
  };
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>'"]/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ??
      character
  );
}

function formatCo2(kg: number): string {
  return kg >= 1000
    ? `${(kg / 1000).toFixed(2)} tonnes (${Math.round(kg).toLocaleString()} kg)`
    : `${kg.toFixed(1)} kg`;
}

export function buildAnniversaryEmailContent(
  input: AnniversaryEmailInput
): AnniversaryEmailContent {
  const name = escapeHtml(input.sponsorName);
  const subject = `🌳 ${input.treeId} turns ${input.yearsOld}! Your sponsorship anniversary`;
  const shareText =
    `My ${input.species} tree ${input.treeId} at ${input.projectName} just turned ` +
    `${input.yearsOld} ${input.yearsOld === 1 ? 'year' : 'years'} old and has absorbed ` +
    `${Math.round(input.cumulativeCo2Kg)} kg of CO₂. 🌱`;

  const shareUrls = {
    twitter: `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(input.shareUrl)}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(input.shareUrl)}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(input.shareUrl)}`,
  };

  const plantedDate = new Date(input.plantedAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const photoBlock = input.latestPhotoUrl
    ? `<h3>Latest health photo</h3><img src="${escapeHtml(input.latestPhotoUrl)}" alt="Latest health photo of ${escapeHtml(input.treeId)}" style="max-width:100%;border-radius:10px;margin:8px 0;" />`
    : `<p>No field photo has been uploaded yet — check back soon.</p>`;

  const socialImage = input.ogImageUrl
    ? `<img src="${escapeHtml(input.ogImageUrl)}" alt="Shareable impact card for ${escapeHtml(input.treeId)}" style="max-width:100%;border-radius:10px;margin:8px 0;" />`
    : '';

  const html = `
<p>Hi ${name},</p>
<p>Happy anniversary! <strong>${escapeHtml(input.treeId)}</strong> (${escapeHtml(input.species)}) was planted on <strong>${plantedDate}</strong> at ${escapeHtml(input.projectName)} — <strong>${input.yearsOld} ${input.yearsOld === 1 ? 'year' : 'years'}</strong> ago today.</p>

<h3>Impact to date</h3>
<table role="presentation" style="border-collapse:collapse;width:100%;max-width:480px;">
  <tr>
    <td style="padding:8px 12px;border:1px solid #e5e7eb;color:#6b7280;">CO₂ absorbed to date</td>
    <td style="padding:8px 12px;border:1px solid #e5e7eb;"><strong>${formatCo2(input.cumulativeCo2Kg)}</strong></td>
  </tr>
  ${
    input.annualCo2Kg !== undefined
      ? `<tr>
    <td style="padding:8px 12px;border:1px solid #e5e7eb;color:#6b7280;">Current annual rate</td>
    <td style="padding:8px 12px;border:1px solid #e5e7eb;"><strong>${input.annualCo2Kg.toFixed(1)} kg / year</strong></td>
  </tr>`
      : ''
  }
  <tr>
    <td style="padding:8px 12px;border:1px solid #e5e7eb;color:#6b7280;">Species</td>
    <td style="padding:8px 12px;border:1px solid #e5e7eb;">${escapeHtml(input.species)}</td>
  </tr>
</table>

${photoBlock}

<h3>Share your anniversary</h3>
<div style="border:1px solid #e5e7eb;border-radius:12px;padding:16px;max-width:480px;">
  <p style="margin:0 0 8px;font-weight:600;">🌳 ${escapeHtml(input.treeId)} · ${input.yearsOld} ${input.yearsOld === 1 ? 'year' : 'years'} of impact</p>
  <p style="margin:0 0 12px;color:#6b7280;">${escapeHtml(shareText)}</p>
  ${socialImage}
  <p style="margin:12px 0 0;">
    <a href="${shareUrls.twitter}" style="display:inline-block;margin-right:8px;padding:8px 14px;background:#000;color:#fff;border-radius:6px;text-decoration:none;">Share on X</a>
    <a href="${shareUrls.facebook}" style="display:inline-block;margin-right:8px;padding:8px 14px;background:#1877f2;color:#fff;border-radius:6px;text-decoration:none;">Share on Facebook</a>
    <a href="${shareUrls.linkedin}" style="display:inline-block;padding:8px 14px;background:#0a66c2;color:#fff;border-radius:6px;text-decoration:none;">Share on LinkedIn</a>
  </p>
</div>

<p><a href="${escapeHtml(input.shareUrl)}" style="display:inline-block;background:#00b36b;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;">View your tree's full update</a></p>
<p>Thanks for helping local communities grow a healthier future.<br/>The Harvesta Team</p>`;

  const text = `Hi ${input.sponsorName},

Happy anniversary! ${input.treeId} (${input.species}) was planted on ${plantedDate} at ${input.projectName} — ${input.yearsOld} ${input.yearsOld === 1 ? 'year' : 'years'} ago today.

CO₂ absorbed to date: ${formatCo2(input.cumulativeCo2Kg)}${input.annualCo2Kg !== undefined ? ` (${input.annualCo2Kg.toFixed(1)} kg / year)` : ''}
${input.latestPhotoUrl ? `Latest health photo: ${input.latestPhotoUrl}` : 'No field photo has been uploaded yet.'}

Share your anniversary:
${shareUrls.twitter}
${shareUrls.facebook}
${shareUrls.linkedin}

View your tree's full update: ${input.shareUrl}

Thanks for helping local communities grow a healthier future.
The Harvesta Team`;

  return { subject, text, html, shareText, shareUrls };
}

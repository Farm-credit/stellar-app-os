import sgMail from '@sendgrid/mail';

const apiKey = process.env.SENDGRID_API_KEY;
if (apiKey) sgMail.setApiKey(apiKey);

const FROM = process.env.SENDGRID_FROM_EMAIL ?? 'no-reply@harvesta.app';

function isConfigured(): boolean {
  return Boolean(apiKey);
}

export type SponsorSegment = 'first-time' | 'vip' | 'lapsed' | 'regional';

export interface NewsletterRecipient {
  email: string;
  name: string;
  segment: SponsorSegment;
  region?: string;
}

export interface WeeklySponsorDigestParams {
  sponsorEmail: string;
  sponsorName: string;
  periodLabel: string;
  treeCount: number;
  newTrees: number;
  totalCo2Kg: number;
  communityHighlights: string[];
  photoUrls: string[];
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character] ?? character);
}

export async function sendSegmentedNewsletter(params: {
  subject: string;
  message: string;
  recipients: NewsletterRecipient[];
}): Promise<number> {
  if (!isConfigured()) return 0;
  const message = escapeHtml(params.message).replace(/\\n/g, '<br/>');
  let sent = 0;
  for (const recipient of params.recipients) {
    const greeting = escapeHtml(recipient.name || 'Sponsor');
    await sgMail.send({
      to: recipient.email,
      from: FROM,
      subject: params.subject,
      text: `Hi ${recipient.name || 'Sponsor'},\\n\\n${params.message}\\n\\nThanks,\\nThe Harvesta Team`,
      html: `<p>Hi ${greeting},</p><p>${message}</p><p>Thanks,<br/>The Harvesta Team</p>`,
    });
    sent += 1;
  }
  return sent;
}

export async function sendWeeklySponsorDigest(params: WeeklySponsorDigestParams): Promise<void> {
  if (!isConfigured()) return;
  const photos = params.photoUrls.filter(Boolean).map((url) => `<img src="${escapeHtml(url)}" alt="Tree progress photo" style="max-width:100%;border-radius:8px;margin:4px 0;"/>`).join('');
  const highlights = params.communityHighlights.map((highlight) => `<li>${escapeHtml(highlight)}</li>`).join('');
  await sgMail.send({
    to: params.sponsorEmail,
    from: FROM,
    subject: `Your weekly impact update — ${params.treeCount} trees growing`,
    text: `Hi ${params.sponsorName},\\n\\n${params.periodLabel}: ${params.newTrees} new trees, ${params.treeCount} total trees, and ${params.totalCo2Kg.toFixed(1)} kg CO₂ offset.\\n\\n${params.communityHighlights.join('\\n')}\\n\\nThanks,\\nThe Harvesta Team`,
    html: `<p>Hi ${escapeHtml(params.sponsorName)},</p><p><strong>${escapeHtml(params.periodLabel)}</strong></p><p>${params.newTrees} new trees, ${params.treeCount} total trees, and <strong>${params.totalCo2Kg.toFixed(1)} kg CO₂</strong> offset.</p>${highlights ? `<h3>Community highlights</h3><ul>${highlights}</ul>` : ''}${photos ? `<h3>Tree progress</h3><div>${photos}</div>` : ''}<p>Thanks for helping local communities grow a healthier future.<br/>The Harvesta Team</p>`,
  });
}

export interface JobAcceptedParams {
  sponsorEmail: string;
  sponsorName: string;
  treeId: string;
  planterName: string;
  species: string;
}

export interface PhotoUploadedParams {
  sponsorEmail: string;
  sponsorName: string;
  treeId: string;
  photoUrl: string;
}

export interface TreeVerifiedParams {
  sponsorEmail: string;
  sponsorName: string;
  treeId: string;
  species: string;
  co2KgPerYear: number;
}

export interface CarbonMilestoneParams {
  sponsorEmail: string;
  sponsorName: string;
  totalCo2Kg: number;
  treeCount: number;
}

export async function sendJobAcceptedEmail(params: JobAcceptedParams): Promise<void> {
  if (!isConfigured()) return;
  const { sponsorEmail, sponsorName, treeId, planterName, species } = params;
  await sgMail.send({
    to: sponsorEmail,
    from: FROM,
    subject: `Your tree planting job has been accepted 🌱`,
    text: `Hi ${sponsorName},\n\n${planterName} has accepted your planting job for tree ${treeId} (${species}).\n\nWe'll notify you as soon as progress photos are uploaded.\n\nThanks,\nThe Harvesta Team`,
    html: `<p>Hi ${sponsorName},</p><p><strong>${planterName}</strong> has accepted your planting job for tree <strong>${treeId}</strong> (${species}).</p><p>We'll notify you as soon as progress photos are uploaded.</p><p>Thanks,<br/>The Harvesta Team</p>`,
  });
}

export async function sendPhotoUploadedEmail(params: PhotoUploadedParams): Promise<void> {
  if (!isConfigured()) return;
  const { sponsorEmail, sponsorName, treeId, photoUrl } = params;
  await sgMail.send({
    to: sponsorEmail,
    from: FROM,
    subject: `Progress photo uploaded for your tree 📸`,
    text: `Hi ${sponsorName},\n\nA new progress photo has been uploaded for your tree ${treeId}.\n\nView photo: ${photoUrl}\n\nThanks,\nThe Harvesta Team`,
    html: `<p>Hi ${sponsorName},</p><p>A new progress photo has been uploaded for your tree <strong>${treeId}</strong>.</p><p><a href="${photoUrl}">View photo</a></p><p>Thanks,<br/>The Harvesta Team</p>`,
  });
}

export async function sendTreeVerifiedEmail(params: TreeVerifiedParams): Promise<void> {
  if (!isConfigured()) return;
  const { sponsorEmail, sponsorName, treeId, species, co2KgPerYear } = params;
  await sgMail.send({
    to: sponsorEmail,
    from: FROM,
    subject: `Your tree has been verified ✅`,
    text: `Hi ${sponsorName},\n\nYour ${species} tree (${treeId}) has been verified on-chain! It will offset approximately ${co2KgPerYear} kg of CO₂ per year.\n\nThanks,\nThe Harvesta Team`,
    html: `<p>Hi ${sponsorName},</p><p>Your <strong>${species}</strong> tree (<strong>${treeId}</strong>) has been verified on-chain! It will offset approximately <strong>${co2KgPerYear} kg</strong> of CO₂ per year.</p><p>Thanks,<br/>The Harvesta Team</p>`,
  });
}

export interface WaitlistNotificationParams {
  sponsorEmail: string;
  sponsorName: string;
  treeId: string;
  species: string;
  region: string;
  estimatedWaitDays: number;
  waitlistId: string;
}

export async function sendWaitlistNotificationEmail(
  params: WaitlistNotificationParams
): Promise<void> {
  if (!isConfigured()) return;
  const { sponsorEmail, sponsorName, treeId, species, region, estimatedWaitDays, waitlistId } =
    params;
  await sgMail.send({
    to: sponsorEmail,
    from: FROM,
    subject: `You're on the waitlist for your ${species} tree 🌿`,
    text: `Hi ${sponsorName},\n\nNo planters are currently available in ${region} for your ${species} tree (${treeId}). We've added you to our waitlist.\n\nEstimated wait: ~${estimatedWaitDays} day${estimatedWaitDays !== 1 ? 's' : ''}.\n\nYou can check your position any time at: ${process.env.NEXT_PUBLIC_APP_URL ?? 'https://harvesta.app'}/api/planting/waitlist/${waitlistId}\n\nWe'll email you the moment a planter accepts your job.\n\nThanks,\nThe Harvesta Team`,
    html: `<p>Hi ${sponsorName},</p><p>No planters are currently available in <strong>${region}</strong> for your <strong>${species}</strong> tree (<strong>${treeId}</strong>). We've added you to our waitlist.</p><p>Estimated wait: <strong>~${estimatedWaitDays} day${estimatedWaitDays !== 1 ? 's' : ''}</strong>.</p><p>You can <a href="${process.env.NEXT_PUBLIC_APP_URL ?? 'https://harvesta.app'}/api/planting/waitlist/${waitlistId}">check your waitlist status</a> at any time.</p><p>We'll email you the moment a planter accepts your job.</p><p>Thanks,<br/>The Harvesta Team</p>`,
  });
}

export async function sendCarbonMilestoneEmail(params: CarbonMilestoneParams): Promise<void> {
  if (!isConfigured()) return;
  const { sponsorEmail, sponsorName, totalCo2Kg, treeCount } = params;
  await sgMail.send({
    to: sponsorEmail,
    from: FROM,
    subject: `Carbon milestone reached 🎉`,
    text: `Hi ${sponsorName},\n\nCongratulations! Your ${treeCount} tree${treeCount !== 1 ? 's' : ''} have now offset a total of ${totalCo2Kg} kg of CO₂.\n\nThanks,\nThe Harvesta Team`,
    html: `<p>Hi ${sponsorName},</p><p>Congratulations! Your <strong>${treeCount}</strong> tree${treeCount !== 1 ? 's' : ''} have now offset a total of <strong>${totalCo2Kg} kg</strong> of CO₂.</p><p>Thanks,<br/>The Harvesta Team</p>`,
  });
}

export interface TreasuryAlertParams {
  to: string;
  address: string;
  assetCode: string;
  balance: number;
  threshold: number;
}

export interface TreasuryDailySummaryParams {
  to: string;
  balances: Array<{ address: string; assetCode: string; balance: number }>;
  threshold: number;
}

export async function sendTreasuryAlertEmail(params: TreasuryAlertParams): Promise<void> {
  if (!isConfigured()) return;
  const { to, address, assetCode, balance, threshold } = params;
  await sgMail.send({
    to,
    from: FROM,
    subject: `Treasury Alert: ${assetCode} balance low ⚠️`,
    text: `Treasury Alert\n\nAddress: ${address}\nAsset: ${assetCode}\nCurrent balance: ${balance}\nThreshold: ${threshold}\n\nAction required: Please review the treasury and take appropriate action.`,
    html: `<p><strong>Treasury Alert</strong></p><p>Address: ${address}<br/>Asset: ${assetCode}<br/>Current balance: <strong>${balance}</strong><br/>Threshold: ${threshold}</p><p>Action required: Please review the treasury and take appropriate action.</p>`,
  });
}

export async function sendTreasuryDailySummaryEmail(
  params: TreasuryDailySummaryParams
): Promise<void> {
  if (!isConfigured()) return;
  const { to, balances, threshold } = params;
  const lines = balances.map((b) => `${b.address} — ${b.assetCode}: ${b.balance}`);
  const htmlLines = balances.map(
    (b) =>
      `<tr><td style="padding:4px 8px;border:1px solid #ddd;">${b.address}</td><td style="padding:4px 8px;border:1px solid #ddd;">${b.assetCode}</td><td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">${b.balance}</td></tr>`
  );
  await sgMail.send({
    to,
    from: FROM,
    subject: `Treasury Daily Summary 📊`,
    text: `Treasury Daily Summary\n\n${lines.join('\n')}\n\nAlert threshold: ${threshold}`,
    html: `<p><strong>Treasury Daily Summary</strong></p><table style="border-collapse:collapse;width:100%;">${htmlLines.join('')}</table><p>Alert threshold: ${threshold}</p>`,
  });
}

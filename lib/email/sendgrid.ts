import sgMail from '@sendgrid/mail';

const apiKey = process.env.SENDGRID_API_KEY;
if (apiKey) sgMail.setApiKey(apiKey);

const FROM = process.env.SENDGRID_FROM_EMAIL ?? 'no-reply@harvesta.app';

function isConfigured(): boolean {
  return Boolean(apiKey);
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

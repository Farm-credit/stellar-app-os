import sgMail from '@sendgrid/mail';
import type { LocationRequestNotification, PlantingLocationRequest } from './types';

const apiKey = process.env.SENDGRID_API_KEY;
if (apiKey) {
  sgMail.setApiKey(apiKey);
}

const FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL ?? 'no-reply@harvesta.app';

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>'"]/g,
    (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[ch] ?? ch
  );
}

export interface BuildLocationNotificationInput {
  request: PlantingLocationRequest;
  assignedZoneName: string;
  assignedRegion: string;
  resolution: 'confirmed' | 'alternative_assigned';
  adminNotes?: string | null;
}

/**
 * Builds the sponsor notification payload when an admin confirms a matching
 * planting zone or assigns an alternative zone.
 */
export function buildLocationRequestNotification(
  input: BuildLocationNotificationInput
): Omit<LocationRequestNotification, 'emailSent' | 'sentAt'> {
  const { request, assignedZoneName, assignedRegion, resolution, adminNotes } = input;
  const sponsorName = request.sponsorName?.trim() || 'Sponsor';
  const preferredLabel = request.preferredCountry
    ? `${request.preferredCountry} (${request.preferredRegion})`
    : request.preferredRegion;
  const treeLabel = request.treeCount === 1 ? '1 tree' : `${request.treeCount} trees`;

  const isConfirmed = resolution === 'confirmed';
  const subject = isConfirmed
    ? `Your tree planting location in ${assignedZoneName} is confirmed!`
    : `Update on your planting location request — assigned to ${assignedZoneName}`;

  const introText = isConfirmed
    ? `Great news! Your preference for ${preferredLabel} has been matched and confirmed for ${treeLabel}.`
    : `Thank you for your location preference (${preferredLabel}). Due to current project availability, our team has assigned your ${treeLabel} to an available alternative planting zone.`;

  const notesText = adminNotes?.trim() ? `\nNote from our planting team: ${adminNotes.trim()}` : '';

  const text = [
    `Hi ${sponsorName},`,
    '',
    introText,
    '',
    `Assigned Planting Zone: ${assignedZoneName}`,
    `Region: ${assignedRegion}`,
    `Trees: ${request.treeCount}`,
    ...(request.transactionRef ? [`Reference: ${request.transactionRef}`] : []),
    notesText,
    '',
    'Thank you for helping restore forests around the world!',
    'The Harvesta Team',
  ]
    .filter((line) => line !== undefined)
    .join('\n');

  const htmlNotes = adminNotes?.trim()
    ? `<p style="background:#f3f4f6;padding:12px;border-radius:8px;color:#374151;"><strong>Note from our planting team:</strong> ${escapeHtml(adminNotes.trim())}</p>`
    : '';

  const html = [
    '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#111827;">',
    `<h2 style="color:#065f46;">${escapeHtml(isConfirmed ? 'Planting Location Confirmed' : 'Alternative Planting Zone Assigned')}</h2>`,
    `<p>Hi ${escapeHtml(sponsorName)},</p>`,
    `<p>${escapeHtml(introText)}</p>`,
    '<div style="border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:16px 0;">',
    `<p style="margin:4px 0;"><strong>Assigned Planting Zone:</strong> ${escapeHtml(assignedZoneName)}</p>`,
    `<p style="margin:4px 0;"><strong>Region:</strong> ${escapeHtml(assignedRegion)}</p>`,
    `<p style="margin:4px 0;"><strong>Trees:</strong> ${request.treeCount}</p>`,
    ...(request.transactionRef
      ? [
          `<p style="margin:4px 0;"><strong>Reference:</strong> ${escapeHtml(request.transactionRef)}</p>`,
        ]
      : []),
    '</div>',
    htmlNotes,
    '<p>Thank you for helping restore forests around the world!<br/>The Harvesta Team</p>',
    '</div>',
  ].join('');

  return {
    requestId: request.id,
    to: request.sponsorEmail,
    sponsorName,
    status: resolution,
    subject,
    text,
    html,
    preferredRegion: preferredLabel,
    assignedZoneName,
    assignedRegion,
  };
}

/**
 * Dispatches the location resolution notification to the sponsor via SendGrid
 * when configured, and records the notification payload for auditability.
 */
export async function notifySponsorOfLocationDecision(
  input: BuildLocationNotificationInput,
  sendEmailOverride?: (payload: {
    to: string;
    from: string;
    subject: string;
    text: string;
    html: string;
  }) => Promise<void>
): Promise<LocationRequestNotification> {
  const built = buildLocationRequestNotification(input);
  const sentAt = new Date().toISOString();
  let emailSent = false;

  if (sendEmailOverride) {
    await sendEmailOverride({
      to: built.to,
      from: FROM_EMAIL,
      subject: built.subject,
      text: built.text,
      html: built.html,
    });
    emailSent = true;
  } else if (process.env.SENDGRID_API_KEY) {
    try {
      sgMail.setApiKey(process.env.SENDGRID_API_KEY);
      await sgMail.send({
        to: built.to,
        from: FROM_EMAIL,
        subject: built.subject,
        text: built.text,
        html: built.html,
      });
      emailSent = true;
    } catch (error) {
      console.error('[planting-location-requests] Failed to send sponsor notification:', error);
    }
  }

  return {
    ...built,
    emailSent,
    sentAt,
  };
}

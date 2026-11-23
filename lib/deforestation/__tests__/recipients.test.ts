import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  getManagerAlertEmails,
  getSponsorEmailsForProject,
  resolveAlertRecipients,
} from '../recipients';

describe('Deforestation alert recipients (Issue #672)', () => {
  beforeEach(() => {
    delete process.env.DEFORESTATION_ALERT_EMAILS;
    delete process.env.ADMIN_ALERT_EMAIL;
  });

  afterEach(() => {
    delete process.env.DEFORESTATION_ALERT_EMAILS;
    delete process.env.ADMIN_ALERT_EMAIL;
  });

  it('reads comma-separated manager emails and drops invalid entries', () => {
    process.env.DEFORESTATION_ALERT_EMAILS = 'pm@example.org, ops@example.org , nope';
    expect(getManagerAlertEmails()).toEqual(['pm@example.org', 'ops@example.org']);
  });

  it('falls back to ADMIN_ALERT_EMAIL when no deforestation list is set', () => {
    process.env.ADMIN_ALERT_EMAIL = 'alerts@example.org';
    expect(getManagerAlertEmails()).toEqual(['alerts@example.org']);
  });

  it('returns no manager emails when nothing is configured', () => {
    expect(getManagerAlertEmails()).toEqual([]);
  });

  it('derives project sponsors from the admin activity feed', () => {
    const sponsors = getSponsorEmailsForProject('Mangrove Restoration Kenya');
    expect(sponsors.length).toBeGreaterThan(0);
    expect(sponsors.every((email) => email.includes('@'))).toBe(true);
  });

  it('returns no sponsors for an unknown project', () => {
    expect(getSponsorEmailsForProject('Nonexistent Project Name')).toEqual([]);
  });

  it('combines and de-duplicates managers and sponsors', () => {
    process.env.DEFORESTATION_ALERT_EMAILS = 'pm@example.org';
    const recipients = resolveAlertRecipients({ projectName: 'Mangrove Restoration Kenya' });
    expect(recipients).toContain('pm@example.org');
    expect(new Set(recipients).size).toBe(recipients.length);
    expect(recipients.length).toBeGreaterThan(1);
  });
});

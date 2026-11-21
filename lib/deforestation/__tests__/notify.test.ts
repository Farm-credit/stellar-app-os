import { describe, expect, it } from 'vitest';

import { alertToNotification } from '../notify';
import type { DeforestationAlert } from '../types';

function makeAlert(overrides: Partial<DeforestationAlert> = {}): DeforestationAlert {
  return {
    id: 'zone-proj-001:mock-1',
    providerAlertId: 'mock-1',
    zoneId: 'zone-proj-001',
    projectId: 'proj-001',
    projectName: 'Amazon Reforestation',
    source: 'gfw',
    detectedOn: '2026-10-01',
    recordedAt: '2026-10-02T00:00:00.000Z',
    confidence: 'high',
    areaHectares: 3.2,
    coordinates: [-60, -3],
    affectedAreaPolygon: [
      [-60.01, -3.01],
      [-59.99, -3.01],
      [-59.99, -2.99],
      [-60.01, -2.99],
      [-60.01, -3.01],
    ],
    notified: true,
    ...overrides,
  };
}

describe('alertToNotification (Issue #672)', () => {
  it('maps a stored alert to a warning notification naming the project', () => {
    const notification = alertToNotification(makeAlert(), () => {});

    expect(notification.type).toBe('warning');
    expect(notification.priority).toBe('high');
    expect(notification.title).toBe('Deforestation alert — Amazon Reforestation');
    expect(notification.description).toContain('3.2 ha');
    expect(notification.description).toContain('2026-10-01');
    expect(notification.description).toContain('Global Forest Watch');
  });

  it('includes alert metadata and an action that opens the project page', () => {
    const opened: string[] = [];
    const notification = alertToNotification(makeAlert(), (url) => opened.push(url));

    expect(notification.metadata).toMatchObject({
      alertId: 'zone-proj-001:mock-1',
      projectId: 'proj-001',
      zoneId: 'zone-proj-001',
      detectedOn: '2026-10-01',
      areaHectares: 3.2,
      confidence: 'high',
      source: 'gfw',
    });

    expect(notification.action?.label).toBe('View on project map');
    notification.action?.onClick();
    expect(opened).toEqual(['/projects/proj-001']);
  });

  it('omits the area label when the provider reported no area', () => {
    const notification = alertToNotification(makeAlert({ areaHectares: 0 }), () => {});

    expect(notification.description).toContain('an area');
    expect(notification.description).not.toContain('ha');
  });

  it('labels mock-feed alerts as satellite alert feed', () => {
    const notification = alertToNotification(makeAlert({ source: 'mock' }), () => {});

    expect(notification.description).toContain('satellite alert feed');
    expect(notification.description).not.toContain('Global Forest Watch');
  });
});

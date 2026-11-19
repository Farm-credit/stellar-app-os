/**
 * Alert notification helpers — Issue #672
 *
 * Converts a stored deforestation alert into the shape the in-app
 * notification centre expects, with the action wired to the project page.
 * Kept free of server-only/mock imports so the browser bridge can use it.
 */

import type { Notification } from '@/types/notifications';
import type { DeforestationAlert } from './types';

export type NotificationInput = Omit<Notification, 'id' | 'timestamp' | 'read' | 'archived'>;

/**
 * Map a stored alert to an in-app notification. `openUrl` lets the caller
 * (browser bridge) provide navigation while keeping this function testable.
 */
export function alertToNotification(
  alert: DeforestationAlert,
  openUrl: (url: string) => void
): NotificationInput {
  const areaLabel =
    alert.areaHectares > 0 ? `${alert.areaHectares.toLocaleString()} ha` : 'an area';
  const sourceLabel = alert.source === 'gfw' ? 'Global Forest Watch' : 'satellite alert feed';

  return {
    title: `Deforestation alert — ${alert.projectName}`,
    description: `Canopy loss of ${areaLabel} detected on ${alert.detectedOn} inside the project's monitored protection zone (${sourceLabel}).`,
    type: 'warning',
    priority: 'high',
    action: {
      label: 'View on project map',
      onClick: () => openUrl(`/projects/${alert.projectId}`),
      variant: 'primary',
    },
    metadata: {
      alertId: alert.id,
      projectId: alert.projectId,
      zoneId: alert.zoneId,
      detectedOn: alert.detectedOn,
      areaHectares: alert.areaHectares,
      confidence: alert.confidence,
      source: alert.source,
    },
  };
}

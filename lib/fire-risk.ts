import { sendFieldReportEmail } from '@/lib/email/sendgrid';

export const FIRE_RISK_LEVELS = ['Low', 'Medium', 'High', 'Extreme'] as const;
export type FireRiskLevel = (typeof FIRE_RISK_LEVELS)[number];
export interface FireRiskSnapshot {
  projectId: string;
  level: FireRiskLevel;
  fwi: number;
  updatedAt: string;
  source: string;
}

export function levelFromFwi(fwi: number): FireRiskLevel {
  if (fwi >= 50) return 'Extreme';
  if (fwi >= 21.3) return 'High';
  if (fwi >= 5.2) return 'Medium';
  return 'Low';
}

const snapshots = new Map<string, FireRiskSnapshot>();
export function getProjectFireRisk(projectId: string): FireRiskSnapshot {
  return (
    snapshots.get(projectId) ?? {
      projectId,
      fwi: 0,
      level: 'Low',
      updatedAt: new Date(0).toISOString(),
      source: 'pending daily fire-weather update',
    }
  );
}

export async function updateProjectFireRisk(
  projectId: string,
  latitude: number,
  longitude: number,
  sponsorEmails: string[] = []
): Promise<FireRiskSnapshot> {
  const apiKey = process.env.OPENWEATHER_API_KEY;
  if (!apiKey) return getProjectFireRisk(projectId);
  const response = await fetch(
    `https://api.openweathermap.org/data/2.5/fwi?lat=${latitude}&lon=${longitude}&appid=${encodeURIComponent(apiKey)}`,
    { cache: 'no-store' }
  );
  if (!response.ok) throw new Error(`Fire-weather API returned ${response.status}`);
  const payload = (await response.json()) as {
    list?: Array<{ main?: { fwi?: number }; danger_rating?: { description?: string } }>;
  };
  const fwi = Number(payload.list?.[0]?.main?.fwi ?? 0);
  const level = levelFromFwi(fwi);
  const snapshot = {
    projectId,
    fwi,
    level,
    updatedAt: new Date().toISOString(),
    source: 'OpenWeather Fire Weather Index API',
  } satisfies FireRiskSnapshot;
  snapshots.set(projectId, snapshot);
  if (level === 'High' || level === 'Extreme') {
    await Promise.all(
      sponsorEmails.filter(Boolean).map((to) =>
        sendFieldReportEmail({
          to,
          subject: `Forest fire risk alert: ${level}`,
          text: `Project ${projectId} has reached ${level} fire risk (FWI ${fwi.toFixed(1)}).`,
          html: `<p>Project <strong>${projectId}</strong> has reached <strong>${level}</strong> fire risk (FWI ${fwi.toFixed(1)}).</p>`,
        })
      )
    );
  }
  return snapshot;
}

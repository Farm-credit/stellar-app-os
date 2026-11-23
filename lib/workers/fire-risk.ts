import { mockAdminProjectDetails } from '@/lib/api/mock/adminProjectDetails';
import { updateProjectFireRisk } from '@/lib/fire-risk';

export async function runFireRiskPass(): Promise<void> {
  let updated = 0;
  for (const project of mockAdminProjectDetails) {
    const coordinates = project.bufferZone?.polygonCoordinates?.[0];
    if (!coordinates) continue;
    await updateProjectFireRisk(project.id, coordinates[1], coordinates[0]);
    updated += 1;
  }
  console.info(`[fire-risk] projects=${updated}`);
}

if (process.argv.includes('--once')) {
  runFireRiskPass().catch((error) => {
    console.error('[fire-risk] worker failed', error);
    process.exitCode = 1;
  });
}

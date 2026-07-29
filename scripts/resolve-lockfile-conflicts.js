const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('=== Checking for Lockfile Conflict Markers ===');

const lockfiles = ['pnpm-lock.yaml', 'package-lock.json'];
let conflictsFound = false;

for (const file of lockfiles) {
  const filepath = path.join(process.cwd(), file);
  if (fs.existsSync(filepath)) {
    const content = fs.readFileSync(filepath, 'utf-8');
    if (content.includes('<<<<<<<') || content.includes('=======')) {
      console.log(`Conflict markers detected in ${file}! Regenerating...`);
      conflictsFound = true;
    }
  }
}

if (conflictsFound || process.argv.includes('--force')) {
  try {
    console.log('Regenerating pnpm-lock.yaml from package.json...');
    execSync('npx pnpm install --no-frozen-lockfile', { stdio: 'inherit' });
    console.log('Lockfiles successfully regenerated without conflict markers!');
  } catch (err) {
    console.error('Failed to regenerate lockfiles:', err.message);
    process.exit(1);
  }
} else {
  console.log('No lockfile conflicts detected. All clear!');
}

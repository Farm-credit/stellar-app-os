/**
 * Icon Generation Script for PWA
 *
 * This script generates PWA icons from a source image.
 *
 * Requirements:
 * - Install sharp: npm install sharp
 * - Place a source icon (icon-source.png) in the public folder (minimum 512x512px)
 *
 * Usage:
 * node scripts/generate-icons.js
 */

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
const sourceIcon = path.join(__dirname, '../public/icon-source.png');
const outputDir = path.join(__dirname, '../public/icons');

// Create icons directory if it doesn't exist
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

async function generateIcons() {
  if (!fs.existsSync(sourceIcon)) {
    console.error('Error: icon-source.png not found in public folder');
    console.log('Please add a source icon (minimum 512x512px) to public/icon-source.png');
    process.exit(1);
  }

  console.log('Generating PWA icons...');

  for (const size of sizes) {
    const outputPath = path.join(outputDir, `icon-${size}x${size}.png`);

    await sharp(sourceIcon)
      .resize(size, size, {
        fit: 'contain',
        background: { r: 13, g: 11, b: 33, alpha: 1 }, // Stellar Navy
      })
      .png()
      .toFile(outputPath);

    console.log(`✓ Generated ${size}x${size} icon`);
  }

  console.log('All icons generated successfully!');
}

generateIcons().catch((error) => {
  console.error('Error generating icons:', error);
  process.exit(1);
});

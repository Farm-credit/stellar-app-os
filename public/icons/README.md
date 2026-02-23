# PWA Icons

This directory contains the Progressive Web App icons for FarmCredit.

## Generating Icons

1. Place a source icon (minimum 512x512px) at `public/icon-source.png` or use the provided `icon-source.svg`

2. Install sharp (if not already installed):

   ```bash
   npm install sharp
   ```

3. Run the icon generation script:
   ```bash
   npm run generate-icons
   ```

This will generate all required icon sizes:

- 72x72
- 96x96
- 128x128
- 144x144
- 152x152
- 192x192
- 384x384
- 512x512

## Icon Requirements

- Format: PNG
- Background: Opaque (no transparency for better compatibility)
- Design: Should work at all sizes (avoid fine details)
- Brand: Use Stellar colors (#14B6E7, #0D0B21)

## Manual Creation

If you prefer to create icons manually:

1. Create PNG files with the sizes listed above
2. Name them: `icon-72x72.png`, `icon-96x96.png`, etc.
3. Place them in this directory
4. Ensure they match the paths in `public/manifest.json`

## Testing

After generating icons:

1. Build the app: `npm run build`
2. Start the server: `npm start`
3. Open DevTools → Application → Manifest
4. Verify all icons are loaded correctly
5. Check for any 404 errors in the Network tab

## Maskable Icons

The current icons are set as `"purpose": "maskable any"` in the manifest, which means they work both as:

- Regular icons (displayed as-is)
- Maskable icons (can be cropped to different shapes by the OS)

For best results, ensure important content is within the "safe zone" (80% of the icon area).

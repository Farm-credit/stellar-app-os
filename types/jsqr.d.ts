declare module 'jsqr' {
  export interface QRCode {
    data: string;
    location: {
      topLeftCorner: { x: number; y: number };
      topRightCorner: { x: number; y: number };
      bottomLeftCorner: { x: number; y: number };
      bottomRightCorner: { x: number; y: number };
    };
  }

  export default function jsQR(
    // eslint-disable-next-line no-unused-vars
    data: Uint8ClampedArray,
    // eslint-disable-next-line no-unused-vars
    width: number,
    // eslint-disable-next-line no-unused-vars
    height: number,
    // eslint-disable-next-line no-unused-vars
    options?: {
      inversionAttempts?: 'dontInvert' | 'onlyInvert' | 'attemptBoth' | 'invertFirst';
    }
  ): QRCode | null;
}

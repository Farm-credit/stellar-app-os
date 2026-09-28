/**
 * AWS Rekognition service for automatic alt-text generation on tree photos.
 *
 * Uses DetectLabels to identify objects/scenes and DetectText to find any
 * text visible in the image, then synthesises a natural-language description
 * suitable for screen readers (WCAG 2.1 SC 1.1.1).
 *
 * Falls back gracefully when AWS credentials are absent so that the app
 * runs in local/CI environments without AWS access.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AltTextResult {
  altText: string;
  /** Average confidence across the top labels (0–100). */
  confidence: number;
  /** Human-readable label names used to compose the description. */
  labels: string[];
}

interface RekognitionLabel {
  Name: string;
  Confidence: number;
}

interface RekognitionTextDetection {
  DetectedText: string;
  Type: string; // "LINE" | "WORD"
  Confidence: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FALLBACK_ALT_TEXT = 'Tree photo';
const FALLBACK_RESULT: AltTextResult = {
  altText: FALLBACK_ALT_TEXT,
  confidence: 0,
  labels: [],
};

/** True when the minimum AWS credentials are configured. */
function hasAwsCredentials(): boolean {
  return Boolean(
    process.env.AWS_ACCESS_KEY_ID &&
    process.env.AWS_SECRET_ACCESS_KEY &&
    (process.env.AWS_S3_BUCKET || process.env.AWS_REGION)
  );
}

/**
 * Compose a natural-language alt text from Rekognition results.
 *
 * Example output:
 *   "A young mango tree planted in red soil, surrounded by dry grass,
 *    with a planter's hand visible. Confidence: 97%"
 */
function composeAltText(
  labels: RekognitionLabel[],
  texts: RekognitionTextDetection[]
): AltTextResult {
  // Filter to high-confidence labels only
  const strongLabels = labels
    .filter((l) => l.Confidence >= 70)
    .sort((a, b) => b.Confidence - a.Confidence)
    .slice(0, 8);

  const labelNames = strongLabels.map((l) => l.Name);

  if (labelNames.length === 0) {
    return FALLBACK_RESULT;
  }

  // Average confidence over the retained labels
  const avgConfidence = Math.round(
    strongLabels.reduce((sum, l) => sum + l.Confidence, 0) / strongLabels.length
  );

  // Build a human-friendly sentence from the top labels.
  // We try to detect tree-specific labels first to anchor the description.
  const treeKeywords = [
    'tree',
    'plant',
    'palm',
    'sapling',
    'sprout',
    'vegetation',
    'nature',
    'forest',
    'flora',
  ];
  const primaryLabels = labelNames.filter((n) =>
    treeKeywords.some((kw) => n.toLowerCase().includes(kw))
  );
  const contextLabels = labelNames.filter((n) => !primaryLabels.includes(n));

  let sentence: string;

  if (primaryLabels.length > 0) {
    const primary = primaryLabels[0];
    const context = contextLabels.slice(0, 4);
    if (context.length > 0) {
      sentence = `A ${primary.toLowerCase()} visible in the photo, with ${joinLabels(context)} also present`;
    } else {
      sentence = `A ${primary.toLowerCase()} visible in the photo`;
    }
  } else {
    // No explicit tree label — just enumerate what was found
    sentence = `A photo showing ${joinLabels(labelNames.slice(0, 5))}`;
  }

  // Append any detected text snippets (e.g. handwritten tree ID on a stake)
  const lineTexts = texts
    .filter((t) => t.Type === 'LINE' && t.Confidence >= 80 && t.DetectedText.trim().length > 0)
    .slice(0, 2)
    .map((t) => t.DetectedText.trim());

  if (lineTexts.length > 0) {
    sentence += `. Text visible: "${lineTexts.join('", "')}"`;
  }

  sentence += `. Confidence: ${avgConfidence}%`;

  return {
    altText: sentence,
    confidence: avgConfidence,
    labels: labelNames,
  };
}

function joinLabels(labels: string[]): string {
  const lower = labels.map((l) => l.toLowerCase());
  if (lower.length === 0) return '';
  if (lower.length === 1) return lower[0];
  return lower.slice(0, -1).join(', ') + ', and ' + lower[lower.length - 1];
}

// ---------------------------------------------------------------------------
// Core detection logic (uses dynamic import so the module compiles even when
// the SDK is absent from node_modules)
// ---------------------------------------------------------------------------

interface RekognitionClientLike {
  send: (command: unknown) => Promise<unknown>;
}

interface DetectLabelsCommandInput {
  Image: {
    S3Object?: { Bucket: string; Name: string };
    Bytes?: Uint8Array;
  };
  MaxLabels?: number;
  MinConfidence?: number;
}

interface DetectTextCommandInput {
  Image: {
    S3Object?: { Bucket: string; Name: string };
    Bytes?: Uint8Array;
  };
}

interface DetectLabelsOutput {
  Labels?: RekognitionLabel[];
}

interface DetectTextOutput {
  TextDetections?: RekognitionTextDetection[];
}

type RekognitionModule = {
  RekognitionClient: new (config: Record<string, unknown>) => RekognitionClientLike;
  DetectLabelsCommand: new (input: DetectLabelsCommandInput) => unknown;
  DetectTextCommand: new (input: DetectTextCommandInput) => unknown;
};

async function loadRekognition(): Promise<RekognitionModule | null> {
  try {
    const mod = await import('@aws-sdk/client-rekognition');
    return mod as unknown as RekognitionModule;
  } catch {
    return null;
  }
}

function buildClientConfig(): Record<string, unknown> {
  const config: Record<string, unknown> = {
    region: process.env.AWS_REGION || 'us-east-1',
  };
  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    config.credentials = {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    };
  }
  return config;
}

async function runDetection(
  rek: RekognitionModule,
  image: DetectLabelsCommandInput['Image']
): Promise<AltTextResult> {
  const client = new rek.RekognitionClient(buildClientConfig());

  const [labelsOutput, textOutput] = await Promise.all([
    client.send(
      new rek.DetectLabelsCommand({ Image: image, MaxLabels: 15, MinConfidence: 50 })
    ) as Promise<DetectLabelsOutput>,
    client.send(new rek.DetectTextCommand({ Image: image })) as Promise<DetectTextOutput>,
  ]);

  return composeAltText(labelsOutput.Labels ?? [], textOutput.TextDetections ?? []);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate alt text for an image stored in S3, identified by its object key.
 *
 * Requires AWS_S3_BUCKET to be set.
 */
export async function generateAltText(imageKey: string): Promise<string> {
  if (!hasAwsCredentials()) {
    console.warn('[rekognition] AWS credentials not configured — returning fallback alt text');
    return FALLBACK_ALT_TEXT;
  }

  const bucket = process.env.AWS_S3_BUCKET;
  if (!bucket) {
    console.warn('[rekognition] AWS_S3_BUCKET not set — returning fallback alt text');
    return FALLBACK_ALT_TEXT;
  }

  const rek = await loadRekognition();
  if (!rek) {
    console.warn(
      '[rekognition] @aws-sdk/client-rekognition not available — returning fallback alt text'
    );
    return FALLBACK_ALT_TEXT;
  }

  try {
    const result = await runDetection(rek, { S3Object: { Bucket: bucket, Name: imageKey } });
    return result.altText;
  } catch (err) {
    console.error('[rekognition] generateAltText error:', err);
    return FALLBACK_ALT_TEXT;
  }
}

/**
 * Generate alt text result object (including confidence and label list) for
 * an image stored in S3.
 */
export async function generateAltTextResult(imageKey: string): Promise<AltTextResult> {
  if (!hasAwsCredentials()) {
    return FALLBACK_RESULT;
  }

  const bucket = process.env.AWS_S3_BUCKET;
  if (!bucket) {
    return FALLBACK_RESULT;
  }

  const rek = await loadRekognition();
  if (!rek) {
    return FALLBACK_RESULT;
  }

  try {
    return await runDetection(rek, { S3Object: { Bucket: bucket, Name: imageKey } });
  } catch (err) {
    console.error('[rekognition] generateAltTextResult error:', err);
    return FALLBACK_RESULT;
  }
}

/**
 * Generate alt text for a publicly accessible image URL.
 *
 * Fetches the image bytes server-side and passes them directly to Rekognition.
 */
export async function generateAltTextFromUrl(imageUrl: string): Promise<string> {
  if (!hasAwsCredentials()) {
    return FALLBACK_ALT_TEXT;
  }

  const rek = await loadRekognition();
  if (!rek) {
    return FALLBACK_ALT_TEXT;
  }

  try {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    const result = await runDetection(rek, { Bytes: bytes });
    return result.altText;
  } catch (err) {
    console.error('[rekognition] generateAltTextFromUrl error:', err);
    return FALLBACK_ALT_TEXT;
  }
}

/**
 * Generate alt text for an image supplied as a Buffer (e.g. from a multipart upload).
 */
export async function generateAltTextFromBuffer(
  buffer: Buffer,
  _mimeType: string
): Promise<string> {
  if (!hasAwsCredentials()) {
    return FALLBACK_ALT_TEXT;
  }

  const rek = await loadRekognition();
  if (!rek) {
    return FALLBACK_ALT_TEXT;
  }

  try {
    const bytes = new Uint8Array(buffer);
    const result = await runDetection(rek, { Bytes: bytes });
    return result.altText;
  } catch (err) {
    console.error('[rekognition] generateAltTextFromBuffer error:', err);
    return FALLBACK_ALT_TEXT;
  }
}

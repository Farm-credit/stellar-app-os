import { detectVisionLabelsFromBuffer } from '@/lib/aws/rekognition';
import {
  predictFromVisionLabels,
  predictWithModel,
  type TreeHealthPrediction,
  type VisionLabel,
} from '@/lib/tree-health/classifier';
import { getActiveTreeHealthModel } from '@/lib/tree-health/repository';

export interface TreeHealthAnalysis {
  features: VisionLabel[];
  prediction: TreeHealthPrediction;
}

/** Run image vision labels and the latest quarterly field-feedback classifier. */
export async function analyzeTreeHealthImage(buffer: Buffer): Promise<TreeHealthAnalysis> {
  const labels = await detectVisionLabelsFromBuffer(buffer);
  const features: VisionLabel[] = labels.map(({ Name, Confidence }) => ({
    name: Name,
    confidence: Confidence,
  }));
  let model = null;
  try {
    model = await getActiveTreeHealthModel();
  } catch (error) {
    // The first deployment may not yet have applied its migration or configured
    // a database; still run the image-label fallback and keep the upload alive.
    console.warn('[tree-health] unable to load trained model:', error);
  }
  const prediction =
    features.length === 0
      ? predictFromVisionLabels([], 'rekognition-labels-v1')
      : model
        ? predictWithModel(
            features.map(({ name }) => name),
            model
          )
        : predictFromVisionLabels(
            features.map(({ name, confidence }) => ({ name, confidence })),
            'rekognition-labels-v1'
          );
  return { features, prediction };
}

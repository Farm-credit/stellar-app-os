/**
 * Converts vision labels into field-review health alerts and trains a small
 * multi-label classifier from corrections supplied by the field team. The
 * vision provider supplies image-derived labels; the quarterly model learns
 * which label combinations correlate with confirmed health issues.
 */
export const HEALTH_ISSUES = ['pest_damage', 'drought_stress', 'disease'] as const;
export type HealthIssueCode = (typeof HEALTH_ISSUES)[number];

export interface VisionLabel {
  name: string;
  confidence: number;
}

export interface HealthIssuePrediction {
  code: HealthIssueCode;
  label: string;
  confidence: number;
}

export interface TreeHealthPrediction {
  issues: HealthIssuePrediction[];
  needsReview: boolean;
  confidence: number;
  provider: 'rekognition-labels' | 'field-trained-label-model' | 'unavailable';
  modelVersion: string;
}

export interface TreeHealthTrainingExample {
  features: string[];
  correctedIssues: HealthIssueCode[];
}

export interface TreeHealthModel {
  version: string;
  trainedAt: string;
  sampleCount: number;
  vocabulary: string[];
  classes: Record<
    HealthIssueCode,
    { prior: number; present: Record<string, number>; absent: Record<string, number> }
  >;
  accuracy: number | null;
  evaluatedCount: number;
}

const ISSUE_LABELS: Record<HealthIssueCode, string> = {
  pest_damage: 'Possible pest damage',
  drought_stress: 'Possible drought stress',
  disease: 'Possible disease',
};

const KEYWORDS: Record<HealthIssueCode, string[]> = {
  pest_damage: [
    'insect',
    'pest',
    'caterpillar',
    'beetle',
    'aphid',
    'worm',
    'larva',
    'mite',
    'borer',
  ],
  drought_stress: [
    'wilt',
    'wilted',
    'wilting',
    'drought',
    'dry soil',
    'water stress',
    'dehydrated',
  ],
  disease: ['fung', 'mold', 'mould', 'blight', 'rot', 'rust', 'leaf spot', 'lesion', 'mildew'],
};

const MIN_CONFIDENCE_TO_FLAG = 0.55;
const MIN_TRAINING_EXAMPLES = 8;
const EPSILON = 1e-6;

/** Stable normalization avoids treating case, punctuation, or spacing as distinct features. */
export function normalizeVisionFeature(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Baseline mapping used until enough human-reviewed examples exist for a trained model. */
export function predictFromVisionLabels(
  labels: VisionLabel[],
  modelVersion = 'rekognition-labels-v1'
): TreeHealthPrediction {
  const candidates: HealthIssuePrediction[] = [];
  for (const code of HEALTH_ISSUES) {
    const terms = KEYWORDS[code];
    const matched = labels
      .map((label) => ({ ...label, normalized: normalizeVisionFeature(label.name) }))
      .filter((label) => terms.some((term) => label.normalized.includes(term)))
      .sort((a, b) => b.confidence - a.confidence)[0];
    if (matched && matched.confidence >= MIN_CONFIDENCE_TO_FLAG * 100) {
      candidates.push({
        code,
        label: ISSUE_LABELS[code],
        confidence: clamp(matched.confidence / 100),
      });
    }
  }
  const confidence = candidates.length
    ? Math.round(
        (candidates.reduce((sum, item) => sum + item.confidence, 0) / candidates.length) * 100
      )
    : 0;
  return {
    issues: candidates,
    needsReview: candidates.length > 0 || labels.length === 0,
    confidence,
    provider: labels.length ? 'rekognition-labels' : 'unavailable',
    modelVersion,
  };
}

/** Train a Bernoulli Naive Bayes multi-label head over image-recognition labels. */
export function trainTreeHealthModel(
  examples: TreeHealthTrainingExample[],
  version: string,
  trainedAt = new Date().toISOString()
): TreeHealthModel {
  if (examples.length < MIN_TRAINING_EXAMPLES) {
    throw new Error(
      `At least ${MIN_TRAINING_EXAMPLES} reviewed photos are required to train a model`
    );
  }
  const vocabulary = Array.from(
    new Set(
      examples.flatMap((example) => example.features.map(normalizeVisionFeature).filter(Boolean))
    )
  ).sort();
  const fit = (training: TreeHealthTrainingExample[], modelVersion: string): TreeHealthModel => {
    const classes = {} as TreeHealthModel['classes'];
    for (const code of HEALTH_ISSUES) {
      const positives = training.filter((example) => example.correctedIssues.includes(code));
      const prior = (positives.length + 1) / (training.length + 2);
      const present: Record<string, number> = {};
      const absent: Record<string, number> = {};
      for (const feature of vocabulary) {
        const positiveOccurrences = positives.filter((example) =>
          example.features.map(normalizeVisionFeature).includes(feature)
        ).length;
        const negative = training.filter((example) => !example.correctedIssues.includes(code));
        const negativeOccurrences = negative.filter((example) =>
          example.features.map(normalizeVisionFeature).includes(feature)
        ).length;
        present[feature] = (positiveOccurrences + 1) / (positives.length + 2);
        absent[feature] = (negativeOccurrences + 1) / (negative.length + 2);
      }
      classes[code] = { prior, present, absent };
    }
    return {
      version: modelVersion,
      trainedAt,
      sampleCount: training.length,
      vocabulary,
      classes,
      accuracy: null,
      evaluatedCount: 0,
    };
  };

  // Keep the final 20% out of the fit for an honest held-out accuracy report.
  const holdoutCount = Math.max(1, Math.floor(examples.length * 0.2));
  const fitExamples = examples.slice(0, examples.length - holdoutCount);
  const holdout = examples.slice(examples.length - holdoutCount);
  const fitted = fit(fitExamples, version);
  const correct = holdout.filter((example) => {
    const predicted = new Set(
      predictWithModel(example.features, fitted).issues.map((issue) => issue.code)
    );
    return HEALTH_ISSUES.every(
      (code) => predicted.has(code) === example.correctedIssues.includes(code)
    );
  }).length;
  const complete = fit(examples, version);
  complete.accuracy = correct / holdout.length;
  complete.evaluatedCount = holdout.length;
  return complete;
}

/** Apply the trained classifier and abstain at low confidence rather than presenting a diagnosis. */
export function predictWithModel(features: string[], model: TreeHealthModel): TreeHealthPrediction {
  const normalized = new Set(features.map(normalizeVisionFeature).filter(Boolean));
  const issues: HealthIssuePrediction[] = [];
  for (const code of HEALTH_ISSUES) {
    const stats = model.classes[code];
    let logOdds = Math.log(Math.max(EPSILON, stats.prior) / Math.max(EPSILON, 1 - stats.prior));
    for (const feature of model.vocabulary) {
      const pPresentGivenIssue = clamp(stats.present[feature] ?? 0.5);
      const pPresentGivenNoIssue = clamp(stats.absent[feature] ?? 0.5);
      logOdds += normalized.has(feature)
        ? Math.log(pPresentGivenIssue / pPresentGivenNoIssue)
        : Math.log((1 - pPresentGivenIssue) / (1 - pPresentGivenNoIssue));
    }
    const probability = 1 / (1 + Math.exp(-logOdds));
    if (probability >= MIN_CONFIDENCE_TO_FLAG) {
      issues.push({ code, label: ISSUE_LABELS[code], confidence: probability });
    }
  }
  const confidence = issues.length
    ? Math.round((issues.reduce((sum, item) => sum + item.confidence, 0) / issues.length) * 100)
    : 0;
  return {
    issues,
    needsReview: issues.length > 0 || normalized.size === 0,
    confidence,
    provider: 'field-trained-label-model',
    modelVersion: model.version,
  };
}

function clamp(value: number): number {
  return Math.min(1 - EPSILON, Math.max(EPSILON, value));
}

export const MIN_TREE_HEALTH_TRAINING_EXAMPLES = MIN_TRAINING_EXAMPLES;
export { ISSUE_LABELS };

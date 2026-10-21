'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import TreeImage from '@/components/atoms/TreeImage';

type Species = {
  id: string;
  name: string;
  scientificName: string;
  description: string;
  image: string;
  sponsorUrl: string;
};

type QuizOption = {
  id: string;
  label: string;
  speciesScores: Record<string, number>;
};

type QuizQuestion = {
  id: string;
  prompt: string;
  illustration: string;
  options: QuizOption[];
};

type QuizResult = {
  topSpecies: Species[];
  scores: Record<string, number>;
};

const SPECIES: Record<string, Species> = {
  oak: {
    id: 'oak',
    name: 'Oak',
    scientificName: 'Quercus robur',
    description:
      'A keystone species supporting hundreds of insects, birds, and mammals. Oaks are symbols of strength and longevity.',
    image: '/images/species/oak.jpg',
    sponsorUrl: '/sponsor?species=oak',
  },
  birch: {
    id: 'birch',
    name: 'Silver Birch',
    scientificName: 'Betula pendula',
    description:
      'A pioneer species with striking white bark that thrives in sunlight and helps regenerate damaged landscapes.',
    image: '/images/species/birch.jpg',
    sponsorUrl: '/sponsor?species=birch',
  },
  maple: {
    id: 'maple',
    name: 'Field Maple',
    scientificName: 'Acer campestre',
    description:
      'A resilient tree with brilliant autumn colour, providing shelter and food for wildlife in hedgerows and woodland edges.',
    image: '/images/species/maple.jpg',
    sponsorUrl: '/sponsor?species=maple',
  },
  willow: {
    id: 'willow',
    name: 'White Willow',
    scientificName: 'Salix alba',
    description:
      'A water-loving tree that stabilises riverbanks and supports a rich web of life, from bees to herons.',
    image: '/images/species/willow.jpg',
    sponsorUrl: '/sponsor?species=willow',
  },
  pine: {
    id: 'pine',
    name: 'Scots Pine',
    scientificName: 'Pinus sylvestris',
    description:
      'An evergreen conifer that provides year-round cover and food for red squirrels and crossbills.',
    image: '/images/species/pine.jpg',
    sponsorUrl: '/sponsor?species=pine',
  },
};

const QUESTIONS: QuizQuestion[] = [
  {
    id: 'q1',
    prompt: 'Which landscape do you feel most at home in?',
    illustration: '/images/quiz/landscape.jpg',
    options: [
      { id: 'q1a', label: 'Ancient woodland', speciesScores: { oak: 2, maple: 1 } },
      { id: 'q1b', label: 'Open heathland', speciesScores: { birch: 2, pine: 1 } },
      { id: 'q1c', label: 'Riverside meadow', speciesScores: { willow: 2, birch: 1 } },
      { id: 'q1d', label: 'Rolling hills', speciesScores: { maple: 2, oak: 1 } },
    ],
  },
  {
    id: 'q2',
    prompt: 'What matters most to you in a tree?',
    illustration: '/images/quiz/leaves.jpg',
    options: [
      { id: 'q2a', label: 'Supporting wildlife', speciesScores: { oak: 2, willow: 1 } },
      { id: 'q2b', label: 'Beautiful autumn colour', speciesScores: { maple: 2, birch: 1 } },
      { id: 'q2c', label: 'Year-round greenery', speciesScores: { pine: 2 } },
      { id: 'q2d', label: 'Fast growth and resilience', speciesScores: { birch: 2, willow: 1 } },
    ],
  },
  {
    id: 'q3',
    prompt: 'Pick a season you love best.',
    illustration: '/images/quiz/seasons.jpg',
    options: [
      { id: 'q3a', label: 'Spring blossoms', speciesScores: { birch: 2, maple: 1 } },
      { id: 'q3b', label: 'Summer shade', speciesScores: { oak: 2, willow: 1 } },
      { id: 'q3c', label: 'Autumn colours', speciesScores: { maple: 2, oak: 1 } },
      { id: 'q3d', label: 'Winter stillness', speciesScores: { pine: 2 } },
    ],
  },
  {
    id: 'q4',
    prompt: 'How would you describe your personality?',
    illustration: '/images/quiz/personality.jpg',
    options: [
      { id: 'q4a', label: 'Strong and dependable', speciesScores: { oak: 2, pine: 1 } },
      { id: 'q4b', label: 'Bright and adaptable', speciesScores: { birch: 2, maple: 1 } },
      { id: 'q4c', label: 'Calm and flowing', speciesScores: { willow: 2 } },
      { id: 'q4d', label: 'Colourful and social', speciesScores: { maple: 2, birch: 1 } },
    ],
  },
  {
    id: 'q5',
    prompt: 'Which animal would you most like to help?',
    illustration: '/images/quiz/animals.jpg',
    options: [
      { id: 'q5a', label: 'Red squirrels', speciesScores: { pine: 2, oak: 1 } },
      { id: 'q5b', label: 'Bees and butterflies', speciesScores: { willow: 2, maple: 1 } },
      { id: 'q5c', label: 'Songbirds', speciesScores: { oak: 2, birch: 1 } },
      { id: 'q5d', label: 'Otters and herons', speciesScores: { willow: 2, birch: 1 } },
    ],
  },
  {
    id: 'q6',
    prompt: 'Where would you plant your tree?',
    illustration: '/images/quiz/planting.jpg',
    options: [
      { id: 'q6a', label: 'A village green', speciesScores: { oak: 2, maple: 1 } },
      { id: 'q6b', label: 'A riverbank', speciesScores: { willow: 2 } },
      { id: 'q6c', label: 'A windswept hill', speciesScores: { pine: 2, birch: 1 } },
      { id: 'q6d', label: 'A hedgerow', speciesScores: { maple: 2, birch: 1 } },
    ],
  },
  {
    id: 'q7',
    prompt: 'What is your favourite tree fact?',
    illustration: '/images/quiz/facts.jpg',
    options: [
      { id: 'q7a', label: 'Trees communicate through fungi', speciesScores: { oak: 2, pine: 1 } },
      { id: 'q7b', label: 'Some trees live over 1,000 years', speciesScores: { oak: 2, willow: 1 } },
      { id: 'q7c', label: 'Birch bark is waterproof', speciesScores: { birch: 2 } },
      { id: 'q7d', label: 'Maple seeds spin like helicopters', speciesScores: { maple: 2 } },
    ],
  },
  {
    id: 'q8',
    prompt: 'Choose a colour palette.',
    illustration: '/images/quiz/colours.jpg',
    options: [
      { id: 'q8a', label: 'Deep greens', speciesScores: { pine: 2, oak: 1 } },
      { id: 'q8b', label: 'Golden yellows', speciesScores: { birch: 2, maple: 1 } },
      { id: 'q8c', label: 'Warm oranges', speciesScores: { maple: 2, oak: 1 } },
      { id: 'q8d', label: 'Silvery greys', speciesScores: { willow: 2, birch: 1 } },
    ],
  },
  {
    id: 'q9',
    prompt: 'How do you like to spend a weekend?',
    illustration: '/images/quiz/weekend.jpg',
    options: [
      { id: 'q9a', label: 'Walking in the woods', speciesScores: { oak: 2, pine: 1 } },
      { id: 'q9b', label: 'Picnicking by a river', speciesScores: { willow: 2, birch: 1 } },
      { id: 'q9c', label: 'Gardening', speciesScores: { maple: 2, birch: 1 } },
      { id: 'q9d', label: 'Photographing nature', speciesScores: { birch: 2, maple: 1 } },
    ],
  },
  {
    id: 'q10',
    prompt: 'What legacy would you like to leave?',
    illustration: '/images/quiz/legacy.jpg',
    options: [
      { id: 'q10a', label: 'A thriving ecosystem', speciesScores: { oak: 2, willow: 1 } },
      { id: 'q10b', label: 'A greener landscape', speciesScores: { birch: 2, pine: 1 } },
      { id: 'q10c', label: 'A splash of colour', speciesScores: { maple: 2 } },
      { id: 'q10d', label: 'A lasting shelter', speciesScores: { pine: 2, oak: 1 } },
    ],
  },
];

function scoreQuiz(answers: Record<string, string>): QuizResult {
  const scores: Record<string, number> = {};
  for (const speciesId of Object.keys(SPECIES)) {
    scores[speciesId] = 0;
  }

  for (const question of QUESTIONS) {
    const answerId = answers[question.id];
    if (!answerId) continue;
    const option = question.options.find((o) => o.id === answerId);
    if (!option) continue;
    for (const [speciesId, points] of Object.entries(option.speciesScores)) {
      scores[speciesId] = (scores[speciesId] ?? 0) + points;
    }
  }

  const ranked = Object.entries(scores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([speciesId]) => SPECIES[speciesId])
    .filter(Boolean);

  return { topSpecies: ranked, scores };
}

function QuizResultCard({ result }: { result: QuizResult }) {
  const shareText = useMemo(() => {
    const names = result.topSpecies.map((s) => s.name).join(', ');
    return `I took the tree species quiz and my top matches are: ${names}! Find your tree and sponsor one.`;
  }, [result]);

  const shareUrl =
    typeof window !== 'undefined' ? `${window.location.origin}/quiz` : '/quiz';

  const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
    shareText
  )}&url=${encodeURIComponent(shareUrl)}`;
  const facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(
    shareUrl
  )}`;
  const linkedInUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(
    shareUrl
  )}`;

  return (
    <section
      aria-labelledby="quiz-result-heading"
      className="mx-auto max-w-3xl rounded-2xl bg-white p-6 shadow-lg"
    >
      <h2 id="quiz-result-heading" className="text-2xl font-bold text-green-800">
        Your tree matches
      </h2>
      <p className="mt-2 text-gray-700">
        Based on your answers, these species are the best fit for you. Sponsor one and help
        our forests grow.
      </p>

      <ul className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {result.topSpecies.map((species) => (
          <li
            key={species.id}
            className="flex flex-col overflow-hidden rounded-xl border border-green-100 bg-green-50"
          >
            <div className="relative h-40 w-full">
              <TreeImage
                src={species.image}
                alt={`Illustration of a ${species.name} tree`}
                fill
                className="object-cover"
              />
            </div>
            <div className="flex flex-1 flex-col p-4">
              <h3 className="text-lg font-semibold text-green-900">{species.name}</h3>
              <p className="text-sm italic text-gray-600">{species.scientificName}</p>
              <p className="mt-2 flex-1 text-sm text-gray-700">{species.description}</p>
              <Link
                href={species.sponsorUrl}
                className="mt-4 inline-block rounded-lg bg-green-700 px-4 py-2 text-center text-sm font-semibold text-white hover:bg-green-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2"
              >
                Sponsor a {species.name}
              </Link>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-8 border-t border-gray-200 pt-6">
        <h3 className="text-lg font-semibold text-green-900">Share your result</h3>
        <p className="mt-1 text-sm text-gray-600">
          Let your friends know which trees match your personality.
        </p>
        <div className="mt-3 flex flex-wrap gap-3">
          <a
            href={twitterUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
          >
            Share on X
          </a>
          <a
            href={facebookUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            Share on Facebook
          </a>
          <a
            href={linkedInUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            Share on LinkedIn
          </a>
        </div>
      </div>

      <div className="mt-8">
        <Link
          href="/sponsor"
          className="inline-block rounded-lg bg-green-700 px-6 py-3 text-center font-semibold text-white hover:bg-green-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2"
        >
          Browse all sponsorship options
        </Link>
      </div>
    </section>
  );
}

export default function QuizPage() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [isComplete, setIsComplete] = useState(false);

  const currentQuestion = QUESTIONS[currentIndex];
  const totalQuestions = QUESTIONS.length;
  const progress = Math.round(((currentIndex + (isComplete ? 1 : 0)) / totalQuestions) * 100);

  const result = useMemo(() => (isComplete ? scoreQuiz(answers) : null), [isComplete, answers]);

  function handleSelect(optionId: string) {
    setAnswers((prev) => ({ ...prev, [currentQuestion.id]: optionId }));
  }

  function handleNext() {
    if (!answers[currentQuestion.id]) return;
    if (currentIndex < totalQuestions - 1) {
      setCurrentIndex((i) => i + 1);
    } else {
      setIsComplete(true);
    }
  }

  function handleBack() {
    if (currentIndex > 0) {
      setCurrentIndex((i) => i - 1);
    }
  }

  function handleRestart() {
    setAnswers({});
    setCurrentIndex(0);
    setIsComplete(false);
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-green-50 to-white px-4 py-10">
      <div className="mx-auto max-w-3xl">
        <header className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-green-900 sm:text-4xl">
            Which tree are you?
          </h1>
          <p className="mt-2 text-gray-700">
            Answer 10 quick questions to discover the tree species that match your
            personality and learn how you can sponsor one.
          </p>
        </header>

        {!isComplete && (
          <div className="mb-6">
            <div className="mb-2 flex items-center justify-between text-sm font-medium text-green-800">
              <span>
                Question {currentIndex + 1} of {totalQuestions}
              </span>
              <span>{progress}% complete</span>
            </div>
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
              aria-label="Quiz progress"
              className="h-2 w-full overflow-hidden rounded-full bg-green-100"
            >
              <div
                className="h-full rounded-full bg-green-600 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {!isComplete && (
          <section
            aria-labelledby="question-heading"
            className="rounded-2xl bg-white p-6 shadow-lg"
          >
            <div className="relative mb-6 h-48 w-full overflow-hidden rounded-xl">
              <TreeImage
                src={currentQuestion.illustration}
                alt={`Illustration for question ${currentIndex + 1}`}
                fill
                className="object-cover"
              />
            </div>

            <h2 id="question-heading" className="text-xl font-semibold text-green-900">
              {currentQuestion.prompt}
            </h2>

            <fieldset className="mt-4">
              <legend className="sr-only">{currentQuestion.prompt}</legend>
              <div className="grid gap-3">
                {currentQuestion.options.map((option) => {
                  const checked = answers[currentQuestion.id] === option.id;
                  return (
                    <label
                      key={option.id}
                      className={`flex cursor-pointer items-center gap-3 rounded-xl border p-4 transition focus-within:ring-2 focus-within:ring-green-500 focus-within:ring-offset-2 ${
                        checked
                          ? 'border-green-600 bg-green-50'
                          : 'border-gray-200 bg-white hover:border-green-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name={currentQuestion.id}
                        value={option.id}
                        checked={checked}
                        onChange={() => handleSelect(option.id)}
                        className="h-4 w-4 text-green-600 focus:ring-green-500"
                      />
                      <span className="text-gray-800">{option.label}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <div className="mt-6 flex items-center justify-between">
              <button
                type="button"
                onClick={handleBack}
                disabled={currentIndex === 0}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleNext}
                disabled={!answers[currentQuestion.id]}
                className="rounded-lg bg-green-700 px-6 py-2 text-sm font-semibold text-white hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2"
              >
                {currentIndex === totalQuestions - 1 ? 'See my result' : 'Next'}
              </button>
            </div>
          </section>
        )}

        {isComplete && result && (
          <div>
            <QuizResultCard result={result} />
            <div className="mt-6 text-center">
              <button
                type="button"
                onClick={handleRestart}
                className="rounded-lg border border-green-700 px-6 py-2 text-sm font-semibold text-green-800 hover:bg-green-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2"
              >
                Retake the quiz
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
'use client';

import { useMemo, useState } from 'react';
import TreeImage from '@/components/atoms/TreeImage';
import QuizResultCard from '@/components/QuizResultCard';
import {
  QUIZ_QUESTIONS,
  recommendSpeciesForQuiz,
  type QuizAnswers,
} from '@/lib/species/education';

export default function QuizPage() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<QuizAnswers>({});
  const [isComplete, setIsComplete] = useState(false);

  const currentQuestion = QUIZ_QUESTIONS[currentIndex];
  const totalQuestions = QUIZ_QUESTIONS.length;
  const progress = Math.round(((currentIndex + (isComplete ? 1 : 0)) / totalQuestions) * 100);

  const result = useMemo(
    () => (isComplete ? recommendSpeciesForQuiz(answers) : null),
    [isComplete, answers]
  );

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
            <QuizResultCard result={result} sharePath="/quiz" />
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
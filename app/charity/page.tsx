'use client';

import { useState, FormEvent, ChangeEvent } from 'react';
import Link from 'next/link';

interface FormData {
  organizationName: string;
  contactEmail: string;
  registrationNumber: string;
  mission: string;
  logo: File | null;
}

const initialFormData: FormData = {
  organizationName: '',
  contactEmail: '',
  registrationNumber: '',
  mission: '',
  logo: null,
};

const onboardingSteps = [
  {
    title: 'Apply for partnership',
    description:
      'Submit your organization details and mission. Our partnerships team reviews every application to ensure alignment with our community values.',
  },
  {
    title: 'Co-branded campaigns',
    description:
      'Once approved, launch co-branded fundraising campaigns featuring your charity logo alongside ours, reaching our full donor community.',
  },
  {
    title: 'Charity codes',
    description:
      'Receive a unique charity code that supporters can use at checkout, directing a share of every purchase straight to your cause.',
  },
  {
    title: 'Joint impact reporting',
    description:
      'Access shared, downloadable impact reports that both parties can use to demonstrate outcomes to donors, boards, and grantmakers.',
  },
];

export default function CharityPartnershipPage() {
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [logoName, setLogoName] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [submitted, setSubmitted] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  const handleChange = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleLogoChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files && e.target.files[0] ? e.target.files[0] : null;
    setFormData((prev) => ({ ...prev, logo: file }));
    setLogoName(file ? file.name : '');
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');

    if (
      !formData.organizationName.trim() ||
      !formData.contactEmail.trim() ||
      !formData.registrationNumber.trim() ||
      !formData.mission.trim()
    ) {
      setError('Please complete all required fields.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = new FormData();
      payload.append('organizationName', formData.organizationName);
      payload.append('contactEmail', formData.contactEmail);
      payload.append('registrationNumber', formData.registrationNumber);
      payload.append('mission', formData.mission);
      if (formData.logo) {
        payload.append('logo', formData.logo);
      }

      const response = await fetch('/api/charity/apply', {
        method: 'POST',
        body: payload,
      });

      if (!response.ok) {
        throw new Error('Application submission failed.');
      }

      setSubmitted(true);
      setFormData(initialFormData);
      setLogoName('');
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Something went wrong. Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-50">
      <section className="bg-gradient-to-br from-emerald-600 to-teal-700 text-white">
        <div className="mx-auto max-w-5xl px-6 py-16">
          <p className="mb-3 text-sm font-semibold uppercase tracking-wider text-emerald-100">
            Charity &amp; NGO Partnership Portal
          </p>
          <h1 className="text-4xl font-bold sm:text-5xl">
            Partner with us to amplify your impact
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-emerald-50">
            Join a growing network of charities and NGOs using co-branded
            campaigns, charity codes, and shared impact reporting to raise more
            and prove their results.
          </p>
          <div className="mt-8 flex flex-wrap gap-4">
            <a
              href="#apply"
              className="rounded-lg bg-white px-6 py-3 font-semibold text-emerald-700 shadow hover:bg-emerald-50"
            >
              Apply to partner
            </a>
            <a
              href="#onboarding"
              className="rounded-lg border border-white/60 px-6 py-3 font-semibold text-white hover:bg-white/10"
            >
              How onboarding works
            </a>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-14">
        <h2 className="text-2xl font-bold text-gray-900">
          What the partnership program offers
        </h2>
        <div className="mt-8 grid gap-6 sm:grid-cols-3">
          <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
            <h3 className="text-lg font-semibold text-gray-900">
              Co-branded campaigns
            </h3>
            <p className="mt-2 text-sm text-gray-600">
              Launch fundraising campaigns that display your charity logo
              alongside ours, building trust and visibility with every donor.
            </p>
          </div>
          <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
            <h3 className="text-lg font-semibold text-gray-900">
              Charity codes
            </h3>
            <p className="mt-2 text-sm text-gray-600">
              Give supporters a simple code to enter at checkout so a share of
              every purchase flows directly to your organization.
            </p>
          </div>
          <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
            <h3 className="text-lg font-semibold text-gray-900">
              Joint impact reporting
            </h3>
            <p className="mt-2 text-sm text-gray-600">
              Download shared impact reports that both parties can use to
              demonstrate outcomes to donors, boards, and grantmakers.
            </p>
          </div>
        </div>
      </section>

      <section id="onboarding" className="bg-white py-14">
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="text-2xl font-bold text-gray-900">
            Onboarding flow
          </h2>
          <p className="mt-2 max-w-2xl text-gray-600">
            From application to your first campaign, here is how we bring new
            partners on board.
          </p>
          <ol className="mt-8 space-y-6">
            {onboardingSteps.map((step, index) => (
              <li key={step.title} className="flex gap-4">
                <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-emerald-600 font-bold text-white">
                  {index + 1}
                </span>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    {step.title}
                  </h3>
                  <p className="mt-1 text-sm text-gray-600">
                    {step.description}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="apply" className="mx-auto max-w-3xl px-6 py-14">
        <h2 className="text-2xl font-bold text-gray-900">
          Partner application
        </h2>
        <p className="mt-2 text-gray-600">
          Tell us about your organization. Our partnerships team will review
          your application and follow up by email.
        </p>

        {submitted ? (
          <div className="mt-8 rounded-xl border border-emerald-200 bg-emerald-50 p-6">
            <h3 className="text-lg font-semibold text-emerald-800">
              Thank you — your application has been received!
            </h3>
            <p className="mt-2 text-sm text-emerald-700">
              Here is what happens next:
            </p>
            <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-emerald-700">
              <li>
                Our partnerships team reviews your application (typically 3–5
                business days).
              </li>
              <li>
                We email you to confirm eligibility and schedule a short
                onboarding call.
              </li>
              <li>
                You receive your charity code and access to co-branded campaign
                tools.
              </li>
              <li>
                Your first joint impact report becomes available after your
                first campaign.
              </li>
            </ol>
            <button
              type="button"
              onClick={() => setSubmitted(false)}
              className="mt-6 rounded-lg bg-emerald-600 px-5 py-2 font-semibold text-white hover:bg-emerald-700"
            >
              Submit another application
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <div>
              <label
                htmlFor="organizationName"
                className="block text-sm font-medium text-gray-700"
              >
                Organization name <span className="text-red-500">*</span>
              </label>
              <input
                id="organizationName"
                name="organizationName"
                type="text"
                value={formData.organizationName}
                onChange={handleChange}
                required
                className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
              />
            </div>

            <div>
              <label
                htmlFor="contactEmail"
                className="block text-sm font-medium text-gray-700"
              >
                Contact email <span className="text-red-500">*</span>
              </label>
              <input
                id="contactEmail"
                name="contactEmail"
                type="email"
                value={formData.contactEmail}
                onChange={handleChange}
                required
                className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
              />
            </div>

            <div>
              <label
                htmlFor="registrationNumber"
                className="block text-sm font-medium text-gray-700"
              >
                Charity registration number{' '}
                <span className="text-red-500">*</span>
              </label>
              <input
                id="registrationNumber"
                name="registrationNumber"
                type="text"
                value={formData.registrationNumber}
                onChange={handleChange}
                required
                className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
              />
            </div>

            <div>
              <label
                htmlFor="mission"
                className="block text-sm font-medium text-gray-700"
              >
                Mission statement <span className="text-red-500">*</span>
              </label>
              <textarea
                id="mission"
                name="mission"
                rows={4}
                value={formData.mission}
                onChange={handleChange}
                required
                className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
              />
            </div>

            <div>
              <label
                htmlFor="logo"
                className="block text-sm font-medium text-gray-700"
              >
                Charity logo
              </label>
              <input
                id="logo"
                name="logo"
                type="file"
                accept="image/*"
                onChange={handleLogoChange}
                className="mt-1 block w-full text-sm text-gray-600 file:mr-4 file:rounded-lg file:border-0 file:bg-emerald-600 file:px-4 file:py-2 file:font-semibold file:text-white hover:file:bg-emerald-700"
              />
              {logoName && (
                <p className="mt-1 text-xs text-gray-500">
                  Selected: {logoName}
                </p>
              )}
            </div>

            {error && (
              <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-emerald-600 px-6 py-3 font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? 'Submitting…' : 'Submit application'}
            </button>
          </form>
        )}

        <p className="mt-8 text-sm text-gray-500">
          Already a partner?{' '}
          <Link href="/charity/dashboard" className="text-emerald-700 underline">
            Go to your partner dashboard
          </Link>
          .
        </p>
      </section>
    </main>
  );
}
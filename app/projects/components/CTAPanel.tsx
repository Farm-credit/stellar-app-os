"use client";

import React, { useEffect, useState } from "react";
import type { Project } from "@/lib/types/project";
import { fmtUsd } from "@/lib/utils/project-data";

interface CTAPanelProps {
  project: Project;
}

export function CTAPanel({ project }: CTAPanelProps) {
  const [tab, setTab] = useState<"credits" | "donate">("credits");
  const [credits, setCredits] = useState(10);
  const [donationAmt, setDonationAmt] = useState(75);
  const [customDonation, setCustomDonation] = useState("");

  const totalCost = credits * project.creditPriceUsd;
  const co2Impact = (credits * 0.068).toFixed(1);

  const donationValue = customDonation ? parseInt(customDonation, 10) || 0 : donationAmt;
  const PRESETS = [25, 50, 100, 250, 500];

  return (
    <div className="rounded-2xl border border-stone-700 bg-stone-900/80 overflow-hidden" role="complementary" aria-label="Purchase options">
      {/* Tabs */}
      <div className="flex border-b border-stone-800" role="tablist" aria-label="Purchase type">
        {(["credits", "donate"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            id={`tab-${t}`}
            aria-selected={tab === t}
            aria-controls={`panel-${t}`}
            onClick={() => setTab(t)}
            className={`flex-1 py-4 text-sm font-semibold transition-all ${
              tab === t
                ? "text-cream border-b-2 border-stellar-green bg-stellar-green/5"
                : "text-stone-500 hover:text-stone-300"
            }`}
          >
            {t === "credits" ? "Buy Carbon Credits" : "Make a Donation"}
          </button>
        ))}
      </div>

      {/* Buy Credits */}
      <div
        id="panel-credits"
        role="tabpanel"
        aria-labelledby="tab-credits"
        hidden={tab !== "credits"}
        className="p-6"
      >
        <div className="mb-5">
          <div className="flex justify-between items-baseline mb-2">
            <label htmlFor="credits-input" className="text-sm text-stone-400">Credits</label>
            <span className="font-mono text-xs text-stone-500">{fmtUsd(project.creditPriceUsd)} / credit</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCredits(Math.max(project.minCredits, credits - 1))}
              disabled={credits <= project.minCredits}
              className="h-10 w-10 rounded-xl border border-stone-700 text-stone-400 hover:text-cream hover:border-stone-500 flex items-center justify-center text-lg transition-all disabled:opacity-30"
              aria-label="Decrease credits"
            >−</button>
            <input
              id="credits-input"
              type="number"
              min={project.minCredits}
              value={credits}
              onChange={(e) => setCredits(Math.max(project.minCredits, parseInt(e.target.value) || 1))}
              className="flex-1 rounded-xl border border-stone-700 bg-stone-800/60 py-2.5 text-center font-mono font-bold text-xl text-cream focus:outline-none focus:border-stellar-green transition-colors"
              aria-label="Number of carbon credits"
            />
            <button
              onClick={() => setCredits(credits + 1)}
              className="h-10 w-10 rounded-xl border border-stone-700 text-stone-400 hover:text-cream hover:border-stone-500 flex items-center justify-center text-lg transition-all"
              aria-label="Increase credits"
            >+</button>
          </div>
        </div>

        {/* Quick amounts */}
        <div className="flex flex-wrap gap-2 mb-5" role="group" aria-label="Quick select credits">
          {[5, 10, 25, 50, 100].map((n) => (
            <button
              key={n}
              onClick={() => setCredits(n)}
              aria-pressed={credits === n}
              className={`rounded-lg px-3 py-1.5 font-mono text-xs transition-all ${
                credits === n
                  ? "bg-stellar-green/20 text-stellar-green border border-stellar-green/30"
                  : "bg-stone-800 text-stone-500 border border-stone-700 hover:text-stone-300"
              }`}
            >
              {n}
            </button>
          ))}
        </div>

        {/* Impact preview */}
        <div className="rounded-xl border border-stellar-green/20 bg-stellar-green/5 p-4 mb-5" aria-live="polite">
          <p className="text-xs text-stellar-green/70 mb-1">Your climate impact</p>
          <div className="flex items-center gap-2">
            <span className="text-2xl" aria-hidden="true">🌿</span>
            <div>
              <p className="font-semibold text-cream text-sm">~{co2Impact} tCO₂e offset</p>
              <p className="text-xs text-stone-500">Verified by Verra VCS registry</p>
            </div>
          </div>
        </div>

        <div className="flex justify-between items-baseline mb-4">
          <span className="text-stone-400 text-sm">Total</span>
          <span className="font-display text-2xl font-bold text-cream" aria-live="polite">{fmtUsd(totalCost)}</span>
        </div>

        <a
          href={`/checkout?project=${project.id}&credits=${credits}`}
          className="btn-stellar-green"
          aria-label={`Buy ${credits} carbon credit${credits !== 1 ? "s" : ""} for ${fmtUsd(totalCost)}`}
        >
          Buy {credits} Credit{credits !== 1 ? "s" : ""}
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        </a>
        <p className="text-center text-xs text-stone-600 mt-3">Blockchain-verified · Instant certificate · Tax-deductible</p>
      </div>

      {/* Donate */}
      <div
        id="panel-donate"
        role="tabpanel"
        aria-labelledby="tab-donate"
        hidden={tab !== "donate"}
        className="p-6"
      >
        <p className="text-sm text-stone-400 mb-5 leading-relaxed">
          Donations fund direct planting operations, community wages, and ecosystem monitoring that credits alone cannot cover.
        </p>

        <div className="grid grid-cols-3 gap-2 mb-4" role="group" aria-label="Donation presets">
          {PRESETS.map((a) => (
            <button
              key={a}
              onClick={() => { setDonationAmt(a); setCustomDonation(""); }}
              aria-pressed={donationAmt === a && !customDonation}
              className={`rounded-xl py-2.5 font-mono text-sm font-semibold transition-all border ${
                donationAmt === a && !customDonation
                  ? "bg-stellar-blue/20 text-stellar-blue border-stellar-blue/30"
                  : "bg-stone-800 text-stone-500 border-stone-700 hover:text-stone-300"
              }`}
            >
              ${a}
            </button>
          ))}
          <input
            type="number"
            placeholder="Custom"
            value={customDonation}
            onChange={(e) => setCustomDonation(e.target.value)}
            className="col-span-3 rounded-xl border border-stone-700 bg-stone-800/60 py-2.5 px-3 font-mono text-sm text-cream placeholder-stone-600 focus:outline-none focus:border-stellar-blue transition-colors"
            aria-label="Custom donation amount in USD"
          />
        </div>

        <div className="flex justify-between items-baseline mb-4">
          <span className="text-stone-400 text-sm">Donation</span>
          <span className="font-display text-2xl font-bold text-cream" aria-live="polite">{fmtUsd(donationValue)}</span>
        </div>

        <a
          href={`/donate?project=${project.id}&amount=${donationValue}`}
          className="btn-stellar-blue"
          aria-label={`Donate ${fmtUsd(donationValue)} to this project`}
        >
          Donate {fmtUsd(donationValue)}
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
          </svg>
        </a>
        <p className="text-center text-xs text-stone-600 mt-3">Secure · 100% to project · Tax receipt issued</p>
      </div>
    </div>
  );
}

export function StickyMobileCTA({ project }: CTAPanelProps) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 500);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      className={`fixed bottom-0 inset-x-0 z-50 bg-stone-950/95 backdrop-blur-md border-t border-stone-800 p-4 lg:hidden transition-transform duration-300 ${show ? "translate-y-0" : "translate-y-full"}`}
      aria-hidden={!show}
    >
      <div className="flex gap-3 max-w-lg mx-auto">
        <a
          href={`/donate?project=${project.id}`}
          tabIndex={show ? 0 : -1}
          className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-stellar-blue/40 py-3 text-stellar-blue text-sm font-semibold hover:bg-stellar-blue/10 transition-all"
        >
          Donate
        </a>
        <a
          href={`/checkout?project=${project.id}&credits=10`}
          tabIndex={show ? 0 : -1}
          className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-stellar-green hover:bg-emerald-400 py-3 text-stone-950 text-sm font-bold transition-all"
        >
          Buy Credits
        </a>
      </div>
    </div>
  );
}

'use client';

import React, { useState, useMemo } from 'react';
import { Accordion } from '@/components/atoms/Accordion';
import { Input } from '@/components/atoms/Input';
import { faqItems, searchFAQs, type FAQItem } from '@/lib/faq';

type Category = 'All' | 'General' | 'Donations' | 'Credits' | 'Technical';

const categories: Category[] = ['All', 'General', 'Donations', 'Credits', 'Technical'];

export default function FAQPage(): React.ReactNode {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<Category>('All');

  const filteredFAQs = useMemo((): FAQItem[] => {
    let results = searchQuery.trim() ? searchFAQs(searchQuery) : faqItems;

    if (selectedCategory !== 'All') {
      results = results.filter((item) => item.category === selectedCategory);
    }

    return results;
  }, [searchQuery, selectedCategory]);

  const accordionItems = filteredFAQs.map((item) => ({
    id: item.id,
    title: item.question,
    content: item.answer,
  }));

  return (
    <main className="min-h-screen bg-background">
      {/* Hero Section */}
      <section
        aria-labelledby="faq-heading"
        className="px-4 py-12 md:px-8 md:py-16 max-w-4xl mx-auto"
      >
        <h1
          id="faq-heading"
          className="text-3xl md:text-4xl font-bold text-center mb-4 text-stellar-blue"
        >
          Frequently Asked Questions
        </h1>
        <p className="text-center text-muted-foreground text-lg mb-8">
          Find answers to common questions about FarmCredit, loans, donations, and more.
        </p>

        {/* Search Bar */}
        <div className="mb-8">
          <Input
            type="search"
            placeholder="Search FAQs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            variant="primary"
            inputSize="lg"
            aria-label="Search frequently asked questions"
            className="w-full"
          />
        </div>

        {/* Category Filter */}
        <div className="flex flex-wrap gap-2 mb-8 justify-center">
          {categories.map((category) => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              aria-pressed={selectedCategory === category}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                selectedCategory === category
                  ? 'bg-stellar-blue text-white'
                  : 'bg-card border border-border text-foreground hover:border-stellar-blue hover:text-stellar-blue'
              } focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stellar-blue`}
            >
              {category}
            </button>
          ))}
        </div>

        {/* Results Count */}
        {searchQuery && (
          <p className="text-sm text-muted-foreground mb-6 text-center">
            Found {filteredFAQs.length} {filteredFAQs.length === 1 ? 'result' : 'results'}
          </p>
        )}

        {/* Accordion */}
        {filteredFAQs.length > 0 ? (
          <Accordion items={accordionItems} className="mb-12" />
        ) : (
          <div className="text-center py-8">
            <p className="text-muted-foreground mb-4">
              No FAQs found matching your search. Try a different query.
            </p>
          </div>
        )}
      </section>

      {/* Contact CTA Section */}
      <section
        aria-labelledby="contact-cta-heading"
        className="px-4 py-12 md:px-8 md:py-16 bg-card border-t border-border"
      >
        <div className="max-w-2xl mx-auto text-center">
          <h2
            id="contact-cta-heading"
            className="text-2xl md:text-3xl font-bold mb-4 text-stellar-blue"
          >
            Still have questions?
          </h2>
          <p className="text-muted-foreground mb-6">
            Our support team is here to help. Reach out via email or join our community channels.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="mailto:support@farmcredit.app"
              className="inline-block px-6 py-3 bg-stellar-blue text-white font-semibold rounded-lg hover:bg-stellar-blue/90 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stellar-blue"
            >
              Email Support
            </a>
            <a
              href="https://discord.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block px-6 py-3 border border-stellar-blue text-stellar-blue font-semibold rounded-lg hover:bg-stellar-blue/10 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stellar-blue"
            >
              Join Discord
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}

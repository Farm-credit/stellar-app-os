import { describe, expect, it } from 'vitest';
import { faqItems, searchFAQs } from './faq';

describe('sponsor and planter FAQs', () => {
  it('publishes the three issue-requested questions', () => {
    expect(faqItems.map((item) => item.question)).toEqual(
      expect.arrayContaining([
        'How does verification work?',
        'Can I donate anonymously?',
        'How do I withdraw earnings?',
      ])
    );
  });

  it('finds each question by words from the question or answer', () => {
    expect(searchFAQs('verification').map((item) => item.id)).toContain('sponsors-1');
    expect(searchFAQs('anonymous').map((item) => item.id)).toContain('sponsors-2');
    expect(searchFAQs('withdraw').map((item) => item.id)).toContain('planters-1');
  });

  it('keeps the new entries in the Donations and Credits categories', () => {
    expect(searchFAQs('How does verification work?')[0]?.category).toBe('Donations');
    expect(searchFAQs('How do I withdraw earnings?')[0]?.category).toBe('Credits');
  });
});

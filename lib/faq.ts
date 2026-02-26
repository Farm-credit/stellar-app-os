export interface FAQItem {
  id: string;
  category: 'General' | 'Donations' | 'Credits' | 'Technical';
  question: string;
  answer: string;
}

export const faqItems: FAQItem[] = [
  {
    id: 'general-1',
    category: 'General',
    question: 'What is FarmCredit?',
    answer:
      'FarmCredit is a decentralized agricultural credit platform built on the Stellar network. It enables farmers and agricultural businesses to access transparent, fair, and efficient credit without traditional intermediaries.',
  },
  {
    id: 'general-2',
    category: 'General',
    question: 'How does FarmCredit work?',
    answer:
      'FarmCredit connects farmers with lenders through our smart contract-based platform. Farmers can create profiles, apply for credit, and borrowers can evaluate and fund loans. All transactions are secured on the Stellar blockchain.',
  },
  {
    id: 'general-3',
    category: 'General',
    question: 'Who can use FarmCredit?',
    answer:
      'Any farmer, agricultural cooperative, or agribusiness with a Stellar wallet and valid identification can use FarmCredit. We support operations of all sizes, from smallholder farmers to large commercial operations.',
  },
  {
    id: 'general-4',
    category: 'General',
    question: 'What are the fees?',
    answer:
      'FarmCredit charges a modest 2% origination fee on approved loans. Interest rates are determined by lenders based on risk assessment. All fees are transparent and disclosed upfront before loan approval.',
  },

  {
    id: 'donations-1',
    category: 'Donations',
    question: 'How can I donate to FarmCredit?',
    answer:
      'You can donate directly through our platform using your Stellar wallet or traditional payment methods. All donations support infrastructure development and help subsidize fees for smallholder farmers.',
  },
  {
    id: 'donations-2',
    category: 'Donations',
    question: 'Are donations tax-deductible?',
    answer:
      'FarmCredit is registered as a non-profit in multiple jurisdictions. Donations may be tax-deductible depending on your location. Consult with a tax professional or contact our team for specific details.',
  },
  {
    id: 'donations-3',
    category: 'Donations',
    question: 'Where do donations go?',
    answer:
      'Donations fund platform development, farmer education programs, partnership grants, and operational costs. We publish transparent quarterly reports on donation usage and impact.',
  },

  {
    id: 'credits-1',
    category: 'Credits',
    question: 'What loan amounts are available?',
    answer:
      'Loan amounts range from $500 USD equivalent to $50,000 USD equivalent in USDC. The exact amount depends on your credit history, land value, and crop type assessment.',
  },
  {
    id: 'credits-2',
    category: 'Credits',
    question: 'What is the repayment period?',
    answer:
      'Repayment periods typically range from 6 to 36 months, depending on the loan type and crop cycle. Loans for seasonal crops align with harvest cycles to ensure repayment alignment with cash flow.',
  },
  {
    id: 'credits-3',
    category: 'Credits',
    question: 'What happens if I default on a loan?',
    answer:
      'We work with borrowers in financial hardship through restructuring and payment plans. Repeated defaults may impact your credit score and future borrowing eligibility. Our team provides support resources to prevent defaults.',
  },
  {
    id: 'credits-4',
    category: 'Credits',
    question: 'Can I pay off my loan early?',
    answer:
      "Yes! Early repayment is encouraged and comes with no prepayment penalties. You only pay interest on the time you've actually borrowed, saving money on interest costs.",
  },

  {
    id: 'technical-1',
    category: 'Technical',
    question: 'Do I need a Stellar wallet?',
    answer:
      "Yes, all transactions on FarmCredit occur on the Stellar blockchain. You'll need a Stellar wallet like Freighter. We provide setup guides and support to help you create a wallet.",
  },
  {
    id: 'technical-2',
    category: 'Technical',
    question: 'What is USDC and why is it used?',
    answer:
      'USDC is a stablecoin pegged to the US Dollar on the Stellar network. We use it because it provides price stability, fast settlement, and low transaction costs compared to traditional banking.',
  },
  {
    id: 'technical-3',
    category: 'Technical',
    question: 'Is my data secure?',
    answer:
      'FarmCredit uses industry-standard encryption and security practices. Personal data is protected by privacy policies compliant with GDPR and other regulations. Blockchain transactions are immutable and auditable.',
  },
  {
    id: 'technical-4',
    category: 'Technical',
    question: 'What internet speed do I need?',
    answer:
      'You need a basic internet connection (at least 0.5 Mbps). Mobile-friendly design allows access via smartphones, even on slow 3G networks. Downloads are minimal.',
  },
  {
    id: 'technical-5',
    category: 'Technical',
    question: 'What happens if the network goes down?',
    answer:
      'The Stellar network has 99.99% uptime SLA. In the unlikely event of downtime, transactions queue automatically and complete when service resumes. Your funds are always secure on the blockchain.',
  },
];

export function getFAQsByCategory(category: FAQItem['category']): FAQItem[] {
  return faqItems.filter((item) => item.category === category);
}

export function searchFAQs(query: string): FAQItem[] {
  const lowerQuery = query.toLowerCase();
  return faqItems.filter(
    (item) =>
      item.question.toLowerCase().includes(lowerQuery) ||
      item.answer.toLowerCase().includes(lowerQuery)
  );
}

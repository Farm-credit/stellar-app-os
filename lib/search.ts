export type ContentType = "projects" | "docs" | "blog";

export interface SearchResult {
  id: string;
  title: string;
  description: string;
  content: string;
  url: string;
  type: ContentType;
  author?: string;
  date?: string;
  tags?: string[];
}

export const searchResults: SearchResult[] = [
  // Projects
  {
    id: "project-1",
    title: "Stellar Payment Integration",
    description: "Learn how to integrate Stellar payments into your application",
    content:
      "This guide walks you through integrating Stellar payments into your application. We cover wallet setup, transaction creation, and payment verification. The integration supports both testnet and mainnet environments.",
    url: "/projects/stellar-integration",
    type: "projects",
    author: "Alice Johnson",
    date: "2025-12-15",
    tags: ["payments", "integration", "stellar"],
  },
  {
    id: "project-2",
    title: "Agricultural Credit Smart Contracts",
    description: "Building smart contracts for decentralized agricultural credit",
    content:
      "Explore the architecture and implementation of smart contracts for agricultural credit. This project demonstrates escrow, collateral management, and automated disbursement mechanisms on the Stellar network.",
    url: "/projects/agri-contracts",
    type: "projects",
    author: "Bob Smith",
    date: "2025-11-20",
    tags: ["smart-contracts", "agriculture", "blockchain"],
  },
  {
    id: "project-3",
    title: "Farmer Portal Dashboard",
    description: "User interface for farmers to manage loans and credits",
    content:
      "A comprehensive dashboard for farmers to view loan applications, track repayment schedules, and monitor account balances. Features include real-time notifications and multi-language support.",
    url: "/projects/farmer-dashboard",
    type: "projects",
    author: "Carol Davis",
    date: "2025-10-10",
    tags: ["dashboard", "ui", "farmers"],
  },

  // Documentation
  {
    id: "doc-1",
    title: "Getting Started with FarmCredit",
    description: "Quick start guide for new users",
    content:
      "This documentation provides a step-by-step guide to get started with FarmCredit. From account creation to your first loan application, we cover all the basics you need to know.",
    url: "/docs/getting-started",
    type: "docs",
    date: "2025-09-01",
    tags: ["documentation", "guide", "beginner"],
  },
  {
    id: "doc-2",
    title: "API Reference",
    description: "Complete API endpoints and authentication",
    content:
      "Comprehensive API reference documentation for all FarmCredit endpoints. Includes authentication methods, request/response formats, error handling, and code examples in multiple languages.",
    url: "/docs/api-reference",
    type: "docs",
    date: "2025-08-15",
    tags: ["api", "documentation", "technical"],
  },
  {
    id: "doc-3",
    title: "Wallet Setup Guide",
    description: "How to create and configure a Stellar wallet",
    content:
      "Learn how to set up a Stellar wallet for use with FarmCredit. We support multiple wallet providers including Freighter, Albedo, and WalletConnect. This guide covers installation, security best practices, and account recovery.",
    url: "/docs/wallet-setup",
    type: "docs",
    date: "2025-07-20",
    tags: ["wallet", "security", "setup"],
  },
  {
    id: "doc-4",
    title: "Loan Application Process",
    description: "Step-by-step loan application requirements and timeline",
    content:
      "Detailed documentation on the loan application process. Covers eligibility criteria, required documents, assessment timeline, approval conditions, and what to expect after approval.",
    url: "/docs/loan-process",
    type: "docs",
    date: "2025-06-10",
    tags: ["loans", "application", "process"],
  },

  // Blog
  {
    id: "blog-1",
    title: "2025 Annual Impact Report: 50,000 Farmers Served",
    description: "Celebrating our milestone and the impact we've made",
    content:
      "FarmCredit is proud to announce that we've served over 50,000 farmers across 25 countries. This year alone, we've disbursed $12.5 million in agricultural credit, enabling farmers to invest in seeds, equipment, and sustainable practices.",
    url: "/blog/2025-impact-report",
    type: "blog",
    author: "Sarah Chen",
    date: "2025-01-15",
    tags: ["impact", "report", "milestone"],
  },
  {
    id: "blog-2",
    title: "Blockchain Technology and Agricultural Finance",
    description: "How blockchain revolutionizes crop financing",
    content:
      "Blockchain technology is transforming agricultural finance by enabling transparent, fast, and cost-effective transactions. Learn how FarmCredit leverages Stellar to reduce intermediaries and lower borrowing costs for farmers.",
    url: "/blog/blockchain-agriculture",
    type: "blog",
    author: "David Lee",
    date: "2024-12-01",
    tags: ["blockchain", "agriculture", "finance"],
  },
  {
    id: "blog-3",
    title: "Partner Spotlight: AgriTech Alliance",
    description: "How our partnership drives agricultural innovation",
    content:
      "Meet AgriTech Alliance, one of our key partners in bringing modern agricultural practices to smallholder farmers. This partnership has enabled us to expand to new regions and develop specialized loan products.",
    url: "/blog/partner-agritech",
    type: "blog",
    author: "Emma Wilson",
    date: "2024-11-10",
    tags: ["partners", "innovation", "agriculture"],
  },
  {
    id: "blog-4",
    title: "Sustainable Farming Loans Now Available",
    description: "New loan product supporting eco-friendly practices",
    content:
      "We're excited to introduce specialized sustainable farming loans that support farmers transitioning to eco-friendly practices. These loans offer competitive rates and extended repayment terms for sustainability-focused projects.",
    url: "/blog/sustainable-loans",
    type: "blog",
    author: "John Martinez",
    date: "2024-10-05",
    tags: ["sustainability", "loans", "agriculture"],
  },
];

export interface SearchOptions {
  query: string;
  contentTypes?: ContentType[];
  limit?: number;
  offset?: number;
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
  query: string;
  contentTypes: ContentType[];
}

export function performSearch(options: SearchOptions): SearchResponse {
  const { query, contentTypes = ["projects", "docs", "blog"], limit = 10, offset = 0 } = options;

  const lowerQuery = query.toLowerCase();

  let filtered = searchResults.filter((result) => {
    const matchesQuery =
      result.title.toLowerCase().includes(lowerQuery) ||
      result.description.toLowerCase().includes(lowerQuery) ||
      result.content.toLowerCase().includes(lowerQuery) ||
      result.tags?.some((tag) => tag.toLowerCase().includes(lowerQuery));

    const matchesType = contentTypes.includes(result.type);

    return matchesQuery && matchesType;
  });

  // Sort by relevance (title matches higher than description/content)
  filtered.sort((a, b) => {
    const aTitle = a.title.toLowerCase().includes(lowerQuery) ? 2 : 0;
    const aDesc = a.description.toLowerCase().includes(lowerQuery) ? 1 : 0;
    const bTitle = b.title.toLowerCase().includes(lowerQuery) ? 2 : 0;
    const bDesc = b.description.toLowerCase().includes(lowerQuery) ? 1 : 0;

    return bTitle + bDesc - (aTitle + aDesc);
  });

  const total = filtered.length;
  const paginated = filtered.slice(offset, offset + limit);

  return {
    results: paginated,
    total,
    query,
    contentTypes,
  };
}

export function highlightMatches(text: string, query: string): Array<{ text: string; highlighted: boolean }> {
  if (!query.trim()) return [{ text, highlighted: false }];

  const lowerQuery = query.toLowerCase();
  const lowerText = text.toLowerCase();
  const parts: Array<{ text: string; highlighted: boolean }> = [];
  let lastIndex = 0;

  let index = lowerText.indexOf(lowerQuery);

  while (index !== -1) {
    if (index > lastIndex) {
      parts.push({
        text: text.substring(lastIndex, index),
        highlighted: false,
      });
    }

    parts.push({
      text: text.substring(index, index + query.length),
      highlighted: true,
    });

    lastIndex = index + query.length;
    index = lowerText.indexOf(lowerQuery, lastIndex);
  }

  if (lastIndex < text.length) {
    parts.push({
      text: text.substring(lastIndex),
      highlighted: false,
    });
  }

  return parts.length > 0 ? parts : [{ text, highlighted: false }];
}

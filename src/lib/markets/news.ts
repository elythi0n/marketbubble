export interface NewsArticle {
  id: string;
  title: string;
  description?: string;
  url: string;
  source: string;
  publishedAt: string; // ISO 8601
  category: "crypto" | "markets";
  thumbnail?: string;
  author?: string;
  tags?: string[];
}

export const MOCK_NEWS: NewsArticle[] = [
  {
    id: "mock-1",
    title: "Bitcoin breaks $70k as institutional demand surges",
    description: "Spot ETF inflows hit a monthly record as major asset managers increase allocations to digital assets.",
    url: "#",
    source: "CoinDesk",
    publishedAt: new Date(Date.now() - 1000 * 60 * 14).toISOString(),
    category: "crypto",
  },
  {
    id: "mock-2",
    title: "Fed signals rate cut path; markets rally",
    description: "Equity indices climbed after the Federal Reserve chair reiterated a dovish pivot in the coming quarters.",
    url: "#",
    source: "MarketWatch",
    publishedAt: new Date(Date.now() - 1000 * 60 * 42).toISOString(),
    category: "markets",
  },
  {
    id: "mock-3",
    title: "Solana DeFi TVL hits all-time high ahead of major protocol launch",
    description: "Total value locked across Solana-based protocols crossed $10B as traders position ahead of next week's airdrop.",
    url: "#",
    source: "CoinTelegraph",
    publishedAt: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
    category: "crypto",
  },
  {
    id: "mock-4",
    title: "NVIDIA Q2 earnings beat estimates; GPU demand remains strong",
    description: "The chipmaker posted record revenue driven by AI data center infrastructure spending from cloud providers.",
    url: "#",
    source: "Decrypt",
    publishedAt: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
    category: "markets",
  },
];

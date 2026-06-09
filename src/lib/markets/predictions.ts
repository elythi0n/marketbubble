export interface PredictionRow {
  id: string;
  question: string;
  yesPercent: number;
  noPercent: number;
  volume: string;
}

export const MOCK_PREDICTIONS: PredictionRow[] = [
  { id: "m1", question: "Will BTC close above $75k in June?", yesPercent: 62, noPercent: 38, volume: "$4.2M" },
  { id: "m2", question: "Fed cuts rates at the next meeting?", yesPercent: 38, noPercent: 62, volume: "$8.9M" },
  { id: "m3", question: "ETH ETF net inflows positive this week?", yesPercent: 71, noPercent: 29, volume: "$1.1M" },
  { id: "m4", question: "SOL trades above $200 before July?", yesPercent: 44, noPercent: 56, volume: "$2.7M" },
  { id: "m5", question: "NVDA beats earnings estimates?", yesPercent: 80, noPercent: 20, volume: "$6.5M" },
  { id: "m6", question: "HYPE makes a new ATH this month?", yesPercent: 57, noPercent: 43, volume: "$930K" },
];

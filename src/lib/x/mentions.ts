export interface XMention {
  id: string;
  handle: string;
  name: string;
  text: string;
  publishedAt: string; // ISO 8601
  tweetUrl: string;
}

export const MOCK_MENTIONS: XMention[] = [
  {
    id: "mock-1",
    name: "Crypto Kaleo",
    handle: "CryptoKaleo",
    text: "@fazebanks stream is the only one actually covering this $BTC move in real time",
    publishedAt: new Date(Date.now() - 1000 * 60 * 2).toISOString(),
    tweetUrl: "#",
  },
  {
    id: "mock-2",
    name: "Ansem",
    handle: "blknoiz06",
    text: "watching the @MarketBubble feed, $SOL flows looking heavy",
    publishedAt: new Date(Date.now() - 1000 * 60 * 11).toISOString(),
    tweetUrl: "#",
  },
  {
    id: "mock-3",
    name: "DegenSpartan",
    handle: "DegenSpartan",
    text: "MarketBubble aggregating Kick + Twitch + X chat is actually genius",
    publishedAt: new Date(Date.now() - 1000 * 60 * 23).toISOString(),
    tweetUrl: "#",
  },
  {
    id: "mock-4",
    name: "Cobie",
    handle: "cobie",
    text: "the @fazebanks $HYPE call aged well lol",
    publishedAt: new Date(Date.now() - 1000 * 60 * 44).toISOString(),
    tweetUrl: "#",
  },
  {
    id: "mock-5",
    name: "Hsaka",
    handle: "HsakaTrades",
    text: "good macro breakdown on the MarketBubble stream today",
    publishedAt: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
    tweetUrl: "#",
  },
];

import type { FeedMessage, Platform } from "@/lib/feed/types";
import type { Ticker } from "@/lib/markets/types";
import type { Streamer } from "@/lib/streamers/mock";
import { getArchive } from "./archive";

/** Live data the tools read — all already present in the browser; no server round-trips. */
export interface ToolContext {
  streamers: Streamer[];
  tickers: Ticker[];
}

export interface ToolDef {
  name: string;
  description: string;
  input_schema: { type: "object"; properties: Record<string, unknown>; required?: string[] };
}

/** Anthropic-shaped tool definitions; the OpenAI provider converts them to function format. */
export const TOOL_DEFS: ToolDef[] = [
  {
    name: "search_chat",
    description:
      "Search this session's chat archive (Twitch + Kick + X merged). Call this whenever the question touches what chat said, thinks, or is hyped about — a topic, a ticker, or a specific user. Returns the most recent matches first.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Text to search for in message bodies (case-insensitive). Omit to match everything." },
        author: { type: "string", description: "Only messages from this username (case-insensitive contains)." },
        channel: { type: "string", description: "Only messages from this channel/streamer handle or name." },
        limit: { type: "number", description: "Max results, up to 50. Default 25." },
      },
    },
  },
  {
    name: "get_top_chatters",
    description:
      "Most active chatters this session, by message count across all platforms. Call this for questions about who is most active, top fans, or chat participation.",
    input_schema: {
      type: "object",
      properties: { limit: { type: "number", description: "Max entries, up to 25. Default 10." } },
    },
  },
  {
    name: "get_live_channels",
    description:
      "Current roster: which streamers are live, on which platforms, with viewer counts and stream titles. Call this for questions about who is live or how streams are doing right now.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_market_data",
    description:
      "Live market quotes (crypto, equities, indices). Call this whenever a price, ticker symbol, or market move is relevant. Pass symbols to look up specific tickers; omit for the top movers.",
    input_schema: {
      type: "object",
      properties: {
        symbols: { type: "array", items: { type: "string" }, description: "Ticker symbols, e.g. [\"BTC\", \"NVDA\"]. Omit for the biggest movers." },
      },
    },
  },
  {
    name: "get_feed_stats",
    description:
      "Aggregate stats for this session's chat: archived message count, unique chatters, messages per minute, and trending cashtags. Call this for overview questions like how busy chat is or what tickers chat mentions most.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_predictions",
    description:
      "Live Polymarket prediction markets: the highest-volume open questions with their current yes-percentages. Call this whenever predictions, odds, Polymarket, or 'what does the market think will happen' comes up.",
    input_schema: {
      type: "object",
      properties: { limit: { type: "number", description: "Max markets, up to 20. Default 10." } },
    },
  },
  {
    name: "get_show_info",
    description:
      "Background on the MarketBubble show and its hosts (FaZe Banks, Blknoiz06): what the show is, the schedule, where it airs, and the current roster. Call this for any question about the show itself or the people on it.",
    input_schema: { type: "object", properties: {} },
  },
];

function bodyText(m: FeedMessage): string {
  return m.segments
    .map((seg) =>
      seg.type === "text" ? seg.text
      : seg.type === "emote" ? seg.code
      : seg.type === "mention" ? `@${seg.user}`
      : seg.type === "cashtag" ? `$${seg.symbol}`
      : seg.type === "link" ? seg.text
      : "",
    )
    .join("")
    .trim();
}

function messageRow(m: FeedMessage) {
  return { time: m.ts, platform: m.platform, channel: m.channel ?? null, author: m.author, text: bodyText(m) };
}

interface SearchArgs {
  query?: string;
  author?: string;
  channel?: string;
  limit?: number;
}

function searchChat(args: SearchArgs) {
  const archive = getArchive();
  const q = args.query?.trim().toLowerCase();
  const author = args.author?.trim().toLowerCase();
  const channel = args.channel?.trim().toLowerCase();
  const limit = Math.min(Math.max(1, args.limit ?? 25), 50);

  const out: ReturnType<typeof messageRow>[] = [];
  for (let i = archive.length - 1; i >= 0 && out.length < limit; i -= 1) {
    const m = archive[i];
    if (author && !m.author.toLowerCase().includes(author)) continue;
    if (channel && !(m.channel ?? "").toLowerCase().includes(channel)) continue;
    if (q && !bodyText(m).toLowerCase().includes(q) && !m.author.toLowerCase().includes(q)) continue;
    out.push(messageRow(m));
  }
  return { matches: out.length, archiveSize: archive.length, messages: out };
}

function topChatters(limit: number) {
  const counts = new Map<string, { author: string; platform: Platform; messages: number }>();
  for (const m of getArchive()) {
    const key = m.author.toLowerCase();
    const cur = counts.get(key);
    if (cur) cur.messages += 1;
    else counts.set(key, { author: m.author, platform: m.platform, messages: 1 });
  }
  return {
    archiveSize: getArchive().length,
    chatters: [...counts.values()].sort((a, b) => b.messages - a.messages).slice(0, Math.min(limit, 25)),
  };
}

function liveChannels(streamers: Streamer[]) {
  return {
    channels: streamers.map((s) => ({
      name: s.name,
      live: s.live,
      platforms: s.platforms,
      livePlatform: s.livePlatform ?? null,
      viewers: s.viewers,
      viewersByPlatform: s.viewersByPlatform ?? {},
      title: s.title,
    })),
  };
}

function marketData(tickers: Ticker[], symbols?: string[]) {
  if (symbols && symbols.length > 0) {
    const wanted = new Set(symbols.map((s) => s.toUpperCase().replace(/^\$/, "")));
    return { tickers: tickers.filter((t) => wanted.has(t.symbol.toUpperCase())) };
  }
  return { topMovers: [...tickers].sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct)).slice(0, 10) };
}

function feedStats() {
  const archive = getArchive();
  const authors = new Set<string>();
  const cashtags = new Map<string, number>();
  const fiveMinAgo = Date.now() - 5 * 60_000;
  let recent = 0;
  for (const m of archive) {
    authors.add(m.author.toLowerCase());
    if (m.tsMs >= fiveMinAgo) recent += 1;
    for (const seg of m.segments) {
      if (seg.type === "cashtag") cashtags.set(seg.symbol.toUpperCase(), (cashtags.get(seg.symbol.toUpperCase()) ?? 0) + 1);
    }
  }
  return {
    archivedMessages: archive.length,
    uniqueChatters: authors.size,
    messagesPerMinute: Math.round((recent / 5) * 10) / 10,
    topCashtags: [...cashtags.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([symbol, mentions]) => ({ symbol, mentions })),
  };
}

async function predictions(limit: number) {
  const res = await fetch("/api/markets/predictions");
  if (!res.ok) return { error: "predictions unavailable right now" };
  const rows = (await res.json()) as { question: string; yesPercent: number; volume?: string }[];
  return {
    source: "Polymarket (by volume)",
    markets: rows.slice(0, Math.min(Math.max(1, limit), 20)).map((r) => ({
      question: r.question,
      yesPercent: r.yesPercent,
      volume: r.volume ?? null,
    })),
  };
}

function showInfo(streamers: Streamer[]) {
  return {
    show: {
      name: "MarketBubble",
      what: "A live show about investing in yourself, at the corner of speculation, attention and culture: prediction markets, stocks, crypto, sports and internet trends, called live before they happen. Presented by Polymarket.",
      themes: ["Make money", "Command attention", "Leverage AI"],
      schedule: streamers.find((s) => s.schedule)?.schedule?.label ?? "THURSDAYS 1PM PT",
      watch: "Simulcast on Twitch and Kick with a live X broadcast; this dashboard unifies all three chats.",
    },
    hosts: [
      {
        name: "Banks",
        about: "One of the internet's most followed creators. Runs the show on Twitch and Kick (handle: fazebanks) with an X broadcast (@banks).",
      },
      {
        name: "Blknoiz06",
        about: "Known as Ansem, one of the most followed traders on crypto Twitter; made his name being early to trends and predicting them. Joins via X broadcast (@blknoiz06).",
      },
    ],
    roster: streamers.map((s) => ({ name: s.name, platforms: s.platforms, live: s.live, title: s.title })),
  };
}

/** Executes a tool call against in-browser data. Always returns a JSON-serializable object. */
export async function runTool(name: string, input: unknown, ctx: ToolContext): Promise<unknown> {
  const args = (input ?? {}) as Record<string, unknown>;
  switch (name) {
    case "search_chat":
      return searchChat(args as SearchArgs);
    case "get_top_chatters":
      return topChatters(typeof args.limit === "number" ? args.limit : 10);
    case "get_live_channels":
      return liveChannels(ctx.streamers);
    case "get_market_data":
      return marketData(ctx.tickers, Array.isArray(args.symbols) ? (args.symbols as string[]) : undefined);
    case "get_feed_stats":
      return feedStats();
    case "get_predictions":
      return predictions(typeof args.limit === "number" ? args.limit : 10);
    case "get_show_info":
      return showInfo(ctx.streamers);
    default:
      return { error: `unknown tool: ${name}` };
  }
}

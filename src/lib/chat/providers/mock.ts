import { parseSegments, type EmoteMeta } from "@/lib/feed/segments";
import type { Badge, FeedMessage, MessageType, Platform } from "@/lib/feed/types";
import type { ChatProvider, ChatSink, ProviderHandle } from "../provider";

/**
 * Design-shell data source. Emits realistic, multi-platform chat (with badges, emotes, mentions,
 * links, replies, and the occasional sub/raid/follow event) on a human-feeling cadence so the feed
 * UI can be tuned against live-like motion before the network adapters land. Swapping this for the
 * real Twitch/Kick/X providers is a one-line registration change in the aggregator.
 */

const emoteUrl = (id: string) => `https://static-cdn.jtvnw.net/emoticons/v2/${id}/default/dark/2.0`;

const EMOTES: Record<string, EmoteMeta> = {
  Kappa: { url: emoteUrl("25") },
  LUL: { url: emoteUrl("425618") },
  PogChamp: { url: emoteUrl("88") },
  BibleThump: { url: emoteUrl("86") },
  "4Head": { url: emoteUrl("354") },
  SeemsGood: { url: emoteUrl("64138") },
  Kreygasm: { url: emoteUrl("41") },
  ResidentSleeper: { url: emoteUrl("245") },
  EZ: { url: emoteUrl("302812746") },
};
const EMOTE_CODES = Object.keys(EMOTES);

const NAMES = [
  "vega_trades", "liquidlana", "ser_pump", "0xMidas", "chartwizard", "degenDaryl",
  "satoshiJr", "ngmi_nate", "wagmiWendy", "candleClara", "fudFinn", "moonMila",
  "shortSqueezeSam", "hodlHana", "alphaAlex", "rektRoy", "bagholderBeth", "scalpScott",
  "yieldYuki", "gigaChadGary", "paperhandsPat", "diamondDee", "tendieTom", "volVince",
];

const AUTHOR_COLORS = [
  "#5b8cff", "#53fc18", "#9146ff", "#ff6b6b", "#ffd166", "#06d6a0",
  "#e07bff", "#4dd0e1", "#ffa94d", "#a0e0a0", "#7aa2ff", "#ff8fab",
];

const TEXTS = [
  "this candle is insane LUL",
  "buy the dip you cowards",
  "@chartwizard called it 30 mins ago Kappa",
  "no way that wick was real PogChamp",
  "ser my portfolio is down bad BibleThump",
  "GM everyone, what did I miss?",
  "support held perfectly, textbook bounce",
  "imagine selling here 4Head",
  "RSI screaming oversold rn",
  "we are so back EZ",
  "liquidity grab incoming, be careful",
  "this is financial advice (it is not)",
  "check the funding rate before you ape",
  "https://tradingview.com/x/abc123 look at this setup",
  "macro looks rough tbh",
  "whale just moved 4000 ETH 👀",
  "shorts getting cooked SeemsGood",
  "another green candle, feels good Kreygasm",
  "zzz nothing happening ResidentSleeper",
  "actually bullish on this one",
  "stop loss hunt confirmed",
  "thin orderbook, expect volatility",
  "@moonMila you seeing this?",
  "perps funding flipped negative",
  "$BTC reclaiming the range, bullish",
  "loading up on $SOL here",
  "$NVDA earnings gonna be wild",
  "$HYPE is the play this week tbh",
  "watch $ETH for a fakeout",
  "$SOL looking strong, sending it",
  "$BTC dominance creeping up again",
  "all in on $HYPE lfg",
];

const ACTIONS = ["refreshes the chart for the 40th time", "stares at the liquidation map", "places a market buy"];

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function chance(p: number): boolean {
  return Math.random() < p;
}

function badgesFor(platform: Platform): Badge[] {
  const badges: Badge[] = [];
  if (chance(0.06)) badges.push({ set: "broadcaster", title: "Broadcaster" });
  else if (chance(0.12)) badges.push({ set: "moderator", title: "Moderator" });
  if (chance(0.4)) {
    if (platform === "x") badges.push({ set: "verified", title: "Verified" });
    else badges.push({ set: "subscriber", title: "Subscriber" });
  }
  if (chance(0.08)) badges.push({ set: platform === "kick" ? "founder" : "vip", title: "VIP" });
  return badges;
}

function formatClock(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

interface MockOptions {
  channels?: Partial<Record<Platform, string>>;
  /** Mean delay between messages in ms (jittered). Lower = busier chat. */
  cadenceMs?: number;
}

let counter = 0;
function nextId(): string {
  counter += 1;
  return `mock-${Date.now().toString(36)}-${counter}`;
}

function makeMessage(channels: Partial<Record<Platform, string>>): FeedMessage {
  const platform = pick<Platform>(
    // Weight Twitch/Kick heavier than X, matching real chat volume.
    ["twitch", "twitch", "twitch", "kick", "kick", "x"],
  );
  const tsMs = Date.now();
  const base = {
    id: nextId(),
    platform,
    author: pick(NAMES),
    authorColor: pick(AUTHOR_COLORS),
    badges: badgesFor(platform),
    ts: formatClock(tsMs),
    tsMs,
    channel: channels[platform],
  } satisfies Partial<FeedMessage>;

  // Occasional events.
  if (chance(0.04)) {
    const roll = Math.random();
    let type: MessageType = "follow";
    let event: FeedMessage["event"] = {};
    if (roll < 0.4) {
      type = "sub";
      event = { months: 1 + Math.floor(Math.random() * 24), tier: "1" };
    } else if (roll < 0.6) {
      type = "giftsub";
      event = { count: pick([1, 5, 10, 20, 50]) };
    } else if (roll < 0.8) {
      type = "raid";
      event = { viewers: 50 + Math.floor(Math.random() * 4000) };
    } else {
      type = "follow";
    }
    return { ...base, type, segments: [], event };
  }

  const isAction = chance(0.03);
  const text = isAction ? pick(ACTIONS) : pick(TEXTS);
  const message: FeedMessage = {
    ...base,
    type: isAction ? "action" : "chat",
    segments: parseSegments(text, EMOTES),
  };

  // Sprinkle some random emotes onto plain lines for visual density.
  if (!isAction && chance(0.25)) {
    message.segments = [
      ...message.segments,
      { type: "text", text: " " },
      { type: "emote", code: pick(EMOTE_CODES), url: EMOTES[pick(EMOTE_CODES)].url },
    ];
  }

  if (chance(0.07)) {
    message.type = "reply";
    message.replyTo = { author: pick(NAMES), snippet: pick(TEXTS).slice(0, 48) };
  }

  return message;
}

export function createMockProvider(options: MockOptions = {}): ChatProvider {
  const channels: Partial<Record<Platform, string>> = options.channels ?? {
    twitch: "fazebanks",
    kick: "fazebanks",
    x: "fazebanks",
  };
  const cadence = options.cadenceMs ?? 900;

  return {
    id: "mock",
    start(sink: ChatSink): ProviderHandle {
      sink.status?.("connecting");
      let timer: ReturnType<typeof setTimeout> | null = null;
      let stopped = false;

      const tick = () => {
        if (stopped) return;
        sink.message(makeMessage(channels));
        // Jittered, occasionally bursty cadence so the feed feels alive.
        const burst = chance(0.2) ? 0.25 : 1;
        const delay = cadence * burst * (0.5 + Math.random());
        timer = setTimeout(tick, delay);
      };

      // Seed a short backlog so the feed isn't empty on first paint.
      const seed = 18;
      const now = Date.now();
      for (let i = seed; i > 0; i -= 1) {
        const msg = makeMessage(channels);
        msg.tsMs = now - i * 1500;
        msg.ts = formatClock(msg.tsMs);
        sink.message(msg);
      }

      sink.status?.("open");
      timer = setTimeout(tick, cadence);

      return {
        stop() {
          stopped = true;
          if (timer) clearTimeout(timer);
          sink.status?.("closed");
        },
      };
    },
  };
}

"use client";

type EmoteUrl = string;

/** Module-level emote maps populated asynchronously as providers connect. */
const globalMap = new Map<string, EmoteUrl>();
const channelMaps = new Map<string, Map<string, EmoteUrl>>();

/** Resolve an emote code, checking channel-specific emotes before global ones. */
export function getEmoteUrl(code: string, channelKey?: string): string | undefined {
  if (channelKey) {
    const ch = channelMaps.get(channelKey);
    if (ch?.has(code)) return ch.get(code);
  }
  return globalMap.get(code);
}

/** Get a combined emote record suitable for parseSegments(). */
export function getEmoteRecord(channelKey?: string): Record<string, { url: string }> {
  const out: Record<string, { url: string }> = {};
  for (const [code, url] of globalMap) out[code] = { url };
  if (channelKey) {
    const ch = channelMaps.get(channelKey);
    if (ch) for (const [code, url] of ch) out[code] = { url };
  }
  return out;
}

function mergeIntoChannel(key: string, incoming: Map<string, EmoteUrl>): void {
  const existing = channelMaps.get(key) ?? new Map<string, EmoteUrl>();
  for (const [k, v] of incoming) existing.set(k, v);
  channelMaps.set(key, existing);
}

// ─── 7TV ─────────────────────────────────────────────────────────────────────

function parse7TVEmotes(emotes: unknown[]): Map<string, EmoteUrl> {
  const map = new Map<string, EmoteUrl>();
  for (const e of emotes) {
    const emote = e as { name?: string; data?: { host?: { url?: string; files?: { name: string }[] } } };
    const name = emote?.name;
    const hostUrl = emote?.data?.host?.url;
    const files = emote?.data?.host?.files ?? [];
    const file = (files.find((f) => f.name === "2x.webp") ?? files.find((f) => f.name === "1x.webp") ?? files[0])?.name;
    if (name && hostUrl && file) map.set(name, `https:${hostUrl}/${file}`);
  }
  return map;
}

async function fetch7TVGlobal(): Promise<void> {
  try {
    const res = await fetch("https://7tv.io/v3/emote-sets/global");
    if (!res.ok) return;
    const data = await res.json();
    for (const [k, v] of parse7TVEmotes(data.emotes ?? [])) globalMap.set(k, v);
  } catch {}
}

async function fetch7TVChannel(twitchUserId: string, channelKey: string): Promise<void> {
  try {
    const res = await fetch(`https://7tv.io/v3/users/twitch/${twitchUserId}`);
    if (!res.ok) return;
    const data = await res.json();
    mergeIntoChannel(channelKey, parse7TVEmotes(data?.emote_set?.emotes ?? []));
  } catch {}
}

// ─── BTTV ────────────────────────────────────────────────────────────────────

function bttvUrl(id: string): string {
  return `https://cdn.betterttv.net/emote/${id}/2x`;
}

async function fetchBTTVGlobal(): Promise<void> {
  try {
    const res = await fetch("https://api.betterttv.net/3/cached/emotes/global");
    if (!res.ok) return;
    const data = await res.json() as { code?: string; id?: string }[];
    for (const e of data) {
      if (e.code && e.id) globalMap.set(e.code, bttvUrl(e.id));
    }
  } catch {}
}

async function fetchBTTVChannel(twitchUserId: string, channelKey: string): Promise<void> {
  try {
    const res = await fetch(`https://api.betterttv.net/3/cached/users/twitch/${twitchUserId}`);
    if (!res.ok) return;
    const data = await res.json() as { channelEmotes?: { code: string; id: string }[]; sharedEmotes?: { code: string; id: string }[] };
    const map = new Map<string, EmoteUrl>();
    for (const e of [...(data.channelEmotes ?? []), ...(data.sharedEmotes ?? [])]) {
      if (e.code && e.id) map.set(e.code, bttvUrl(e.id));
    }
    mergeIntoChannel(channelKey, map);
  } catch {}
}

// ─── FFZ ─────────────────────────────────────────────────────────────────────

function ffzUrl(url: string): string {
  return url.startsWith("//") ? `https:${url}` : url;
}

type FFZEmoticon = { name: string; urls: Record<string, string> };
type FFZSet = { emoticons: FFZEmoticon[] };

function parseFFZSets(sets: Record<string, FFZSet>, keys: (number | string)[]): Map<string, EmoteUrl> {
  const map = new Map<string, EmoteUrl>();
  for (const key of keys) {
    const set = sets[String(key)];
    for (const e of set?.emoticons ?? []) {
      const url = e.urls?.["2"] ?? e.urls?.["1"];
      if (e.name && url) map.set(e.name, ffzUrl(url));
    }
  }
  return map;
}

async function fetchFFZGlobal(): Promise<void> {
  try {
    const res = await fetch("https://api.frankerfacez.com/v1/set/global");
    if (!res.ok) return;
    const data = await res.json() as { default_sets?: number[]; sets?: Record<string, FFZSet> };
    for (const [k, v] of parseFFZSets(data.sets ?? {}, data.default_sets ?? [])) globalMap.set(k, v);
  } catch {}
}

async function fetchFFZChannel(twitchUserId: string, channelKey: string): Promise<void> {
  try {
    const res = await fetch(`https://api.frankerfacez.com/v1/room/id/${twitchUserId}`);
    if (!res.ok) return;
    const data = await res.json() as { sets?: Record<string, FFZSet> };
    const sets = data.sets ?? {};
    mergeIntoChannel(channelKey, parseFFZSets(sets, Object.keys(sets)));
  } catch {}
}

// ─── Public API ──────────────────────────────────────────────────────────────

let globalFetched = false;

export function initGlobalEmotes(): void {
  if (globalFetched) return;
  globalFetched = true;
  fetch7TVGlobal();
  fetchBTTVGlobal();
  fetchFFZGlobal();
}

export function initChannelEmotes(twitchUserId: string, channelKey: string): void {
  fetch7TVChannel(twitchUserId, channelKey);
  fetchBTTVChannel(twitchUserId, channelKey);
  fetchFFZChannel(twitchUserId, channelKey);
}

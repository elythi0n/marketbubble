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

/** Combined emote record for parseSegments(). Read live, so EventAPI updates take effect at once. */
export function getEmoteRecord(channelKey?: string): Record<string, { url: string }> {
  const out: Record<string, { url: string }> = {};
  for (const [code, url] of globalMap) out[code] = { url };
  if (channelKey) {
    const ch = channelMaps.get(channelKey);
    if (ch) for (const [code, url] of ch) out[code] = { url };
  }
  return out;
}

function channelMap(key: string): Map<string, EmoteUrl> {
  const existing = channelMaps.get(key) ?? new Map<string, EmoteUrl>();
  channelMaps.set(key, existing);
  return existing;
}

function mergeIntoChannel(key: string, incoming: Map<string, EmoteUrl>): void {
  const map = channelMap(key);
  for (const [k, v] of incoming) map.set(k, v);
}

// ─── 7TV ─────────────────────────────────────────────────────────────────────

interface SevenTVEmote {
  name?: string;
  data?: { host?: { url?: string; files?: { name: string }[] } };
}

/** Resolve one 7TV emote to [name, url], preferring 2x webp (animated emotes ship animated webp). */
function parse7TVEmote(e: SevenTVEmote): { name: string; url: string } | null {
  const name = e?.name;
  const hostUrl = e?.data?.host?.url;
  const files = e?.data?.host?.files ?? [];
  const file = (files.find((f) => f.name === "2x.webp") ?? files.find((f) => f.name === "1x.webp") ?? files[0])?.name;
  if (!name || !hostUrl || !file) return null;
  return { name, url: `https:${hostUrl}/${file}` };
}

function parse7TVEmotes(emotes: unknown[]): Map<string, EmoteUrl> {
  const map = new Map<string, EmoteUrl>();
  for (const e of emotes) {
    const parsed = parse7TVEmote(e as SevenTVEmote);
    if (parsed) map.set(parsed.name, parsed.url);
  }
  return map;
}

interface SevenTVUser {
  emote_set?: { id?: string; emotes?: unknown[] };
}

async function fetch7TVGlobal(): Promise<void> {
  try {
    const res = await fetch("https://7tv.io/v3/emote-sets/global");
    if (!res.ok) return;
    const data = (await res.json()) as { id?: string; emotes?: unknown[] };
    for (const [k, v] of parse7TVEmotes(data.emotes ?? [])) globalMap.set(k, v);
    if (data.id) subscribeSet(data.id, { scope: "global" });
  } catch {}
}

async function fetch7TVForUser(path: string, channelKey: string): Promise<void> {
  try {
    const res = await fetch(`https://7tv.io/v3/users/${path}`);
    if (!res.ok) return;
    const data = (await res.json()) as SevenTVUser;
    const set = data.emote_set;
    mergeIntoChannel(channelKey, parse7TVEmotes(set?.emotes ?? []));
    if (set?.id) subscribeSet(set.id, { scope: "channel", key: channelKey });
  } catch {}
}

const fetch7TVTwitch = (twitchUserId: string, channelKey: string) => fetch7TVForUser(`twitch/${twitchUserId}`, channelKey);
const fetch7TVKick = (kickUserId: string, channelKey: string) => fetch7TVForUser(`kick/${kickUserId}`, channelKey);

// ─── 7TV EventAPI (live emote-set updates) ─────────────────────────────────────
//
// One shared WebSocket. We subscribe to each active emote set's `emote_set.update` and apply
// pushed/pulled changes to the matching map, so emotes added or removed mid-stream show up on the
// next message without a reconnect. (BTTV/FFZ have no comparable public event stream.)

const SEVENTV_EVENTS = "wss://events.7tv.io/v3";
type SetTarget = { scope: "global" } | { scope: "channel"; key: string };

const subscribedSets = new Map<string, SetTarget>();
let eventSocket: WebSocket | null = null;
let eventBackoff = 1_000;
let eventReconnect: ReturnType<typeof setTimeout> | null = null;

function sendSubscribe(ws: WebSocket, setId: string): void {
  try {
    ws.send(JSON.stringify({ op: 35, d: { type: "emote_set.update", condition: { object_id: setId } } }));
  } catch {}
}

function ensureEventSocket(): void {
  if (typeof window === "undefined") return;
  if (eventSocket && (eventSocket.readyState === WebSocket.OPEN || eventSocket.readyState === WebSocket.CONNECTING)) return;

  const ws = new WebSocket(SEVENTV_EVENTS);
  eventSocket = ws;
  ws.addEventListener("open", () => {
    eventBackoff = 1_000;
    for (const setId of subscribedSets.keys()) sendSubscribe(ws, setId);
  });
  ws.addEventListener("message", (e) => handleEvent(typeof e.data === "string" ? e.data : String(e.data)));
  ws.addEventListener("close", () => {
    if (eventSocket === ws) eventSocket = null;
    if (subscribedSets.size > 0) scheduleEventReconnect();
  });
  ws.addEventListener("error", () => {
    try {
      ws.close();
    } catch {}
  });
}

function scheduleEventReconnect(): void {
  if (eventReconnect) return;
  const wait = eventBackoff;
  eventBackoff = Math.min(wait * 2, 30_000);
  eventReconnect = setTimeout(() => {
    eventReconnect = null;
    if (subscribedSets.size > 0) ensureEventSocket();
  }, wait);
}

function subscribeSet(setId: string, target: SetTarget): void {
  if (!setId || subscribedSets.has(setId)) return;
  subscribedSets.set(setId, target);
  if (eventSocket && eventSocket.readyState === WebSocket.OPEN) sendSubscribe(eventSocket, setId);
  else ensureEventSocket();
}

interface EmoteSetUpdate {
  op: number;
  d?: {
    type?: string;
    body?: {
      id?: string;
      pushed?: { value?: SevenTVEmote }[];
      pulled?: { old_value?: { name?: string } }[];
    };
  };
}

function handleEvent(raw: string): void {
  let msg: EmoteSetUpdate;
  try {
    msg = JSON.parse(raw) as EmoteSetUpdate;
  } catch {
    return;
  }
  if (msg.op !== 0 || msg.d?.type !== "emote_set.update") return;

  const body = msg.d.body;
  const target = body?.id ? subscribedSets.get(body.id) : undefined;
  if (!target || !body) return;

  const map = target.scope === "global" ? globalMap : channelMap(target.key);
  for (const p of body.pushed ?? []) {
    const parsed = p.value ? parse7TVEmote(p.value) : null;
    if (parsed) map.set(parsed.name, parsed.url);
  }
  for (const p of body.pulled ?? []) {
    if (p.old_value?.name) map.delete(p.old_value.name);
  }
}

// ─── BTTV (Twitch only; no Kick / no event stream) ─────────────────────────────

function bttvUrl(id: string): string {
  return `https://cdn.betterttv.net/emote/${id}/2x`;
}

async function fetchBTTVGlobal(): Promise<void> {
  try {
    const res = await fetch("https://api.betterttv.net/3/cached/emotes/global");
    if (!res.ok) return;
    const data = (await res.json()) as { code?: string; id?: string }[];
    for (const e of data) {
      if (e.code && e.id) globalMap.set(e.code, bttvUrl(e.id));
    }
  } catch {}
}

async function fetchBTTVChannel(twitchUserId: string, channelKey: string): Promise<void> {
  try {
    const res = await fetch(`https://api.betterttv.net/3/cached/users/twitch/${twitchUserId}`);
    if (!res.ok) return;
    const data = (await res.json()) as { channelEmotes?: { code: string; id: string }[]; sharedEmotes?: { code: string; id: string }[] };
    const map = new Map<string, EmoteUrl>();
    for (const e of [...(data.channelEmotes ?? []), ...(data.sharedEmotes ?? [])]) {
      if (e.code && e.id) map.set(e.code, bttvUrl(e.id));
    }
    mergeIntoChannel(channelKey, map);
  } catch {}
}

// ─── FFZ (Twitch only; prefers animated URLs when present) ──────────────────────

function ffzUrl(url: string): string {
  return url.startsWith("//") ? `https:${url}` : url;
}

type FFZEmoticon = { name: string; urls: Record<string, string>; animated?: Record<string, string> };
type FFZSet = { emoticons: FFZEmoticon[] };

function parseFFZSets(sets: Record<string, FFZSet>, keys: (number | string)[]): Map<string, EmoteUrl> {
  const map = new Map<string, EmoteUrl>();
  for (const key of keys) {
    const set = sets[String(key)];
    for (const e of set?.emoticons ?? []) {
      // Animated FFZ emotes expose a separate `animated` URL map; prefer it over the static `urls`.
      const url = e.animated?.["2"] ?? e.animated?.["1"] ?? e.urls?.["2"] ?? e.urls?.["1"];
      if (e.name && url) map.set(e.name, ffzUrl(url));
    }
  }
  return map;
}

async function fetchFFZGlobal(): Promise<void> {
  try {
    const res = await fetch("https://api.frankerfacez.com/v1/set/global");
    if (!res.ok) return;
    const data = (await res.json()) as { default_sets?: number[]; sets?: Record<string, FFZSet> };
    for (const [k, v] of parseFFZSets(data.sets ?? {}, data.default_sets ?? [])) globalMap.set(k, v);
  } catch {}
}

async function fetchFFZChannel(twitchUserId: string, channelKey: string): Promise<void> {
  try {
    const res = await fetch(`https://api.frankerfacez.com/v1/room/id/${twitchUserId}`);
    if (!res.ok) return;
    const data = (await res.json()) as { sets?: Record<string, FFZSet> };
    const sets = data.sets ?? {};
    mergeIntoChannel(channelKey, parseFFZSets(sets, Object.keys(sets)));
  } catch {}
}

// ─── Public API ──────────────────────────────────────────────────────────────

let globalFetched = false;
const fetchedChannels = new Set<string>(); // channelKey, so reconnects don't refetch

export function initGlobalEmotes(): void {
  if (globalFetched) return;
  globalFetched = true;
  fetch7TVGlobal();
  fetchBTTVGlobal();
  fetchFFZGlobal();
}

/** Twitch channel: 7TV + BTTV + FFZ (all keyed by the Twitch user id). */
export function initChannelEmotes(twitchUserId: string, channelKey: string): void {
  if (fetchedChannels.has(channelKey)) return;
  fetchedChannels.add(channelKey);
  fetch7TVTwitch(twitchUserId, channelKey);
  fetchBTTVChannel(twitchUserId, channelKey);
  fetchFFZChannel(twitchUserId, channelKey);
}

/** Kick channel: 7TV (keyed by the Kick user id). BTTV/FFZ don't index Kick channels. */
export function initKickChannelEmotes(kickUserId: string, channelKey: string): void {
  if (fetchedChannels.has(channelKey)) return;
  fetchedChannels.add(channelKey);
  fetch7TVKick(kickUserId, channelKey);
}

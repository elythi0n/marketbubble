// MarketBubble live-chat relay.
//
// Maintains shared upstream connections to the SHOW ROSTER's Twitch + Kick chats (never anyone
// else's), merges them into a single feed, fans it out to site visitors over Server-Sent Events,
// and tallies top chatters for the leaderboard. The roster is fixed by the CHANNELS /
// KICK_CHATROOM_ID env — there is deliberately no auto-picking of popular channels, so the
// leaderboard only ever counts the real streamers' viewers.
//
// Why a relay (not per-visitor scraping): one shared upstream connection instead of one per visitor,
// and Kick's chatroom lookup is behind Cloudflare — a server is the only place that can do it.
//
// Run:  node relay/server.mjs   (or: npm run relay)
// Node 21+ (global WebSocket). Zero dependencies.
//
// Env:
//   PORT                  listen port (default 8787)
//   ALLOW_ORIGIN          CORS allow-origin (default *)
//   CHANNELS              comma-separated Twitch logins of the show roster (all are joined)
//   KICK_CHATROOM_ID      comma-separated Kick chatroom ids for the roster (ids can't be looked up
//                         past Cloudflare here; provide them, or run where the lookup succeeds)
//   KICK_CHANNEL          display label for the Kick side (optional)

import http from "node:http";
import fs from "node:fs";

const PORT = Number(process.env.PORT || 8787);
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || "*";
// The show roster — the ONLY channels the relay follows and tallies.
const ROSTER = (process.env.CHANNELS || "fazebanks")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

const KICK_PUSHER_KEY = "32cbd69e4b950bf97679";
const KICK_PUSHER_CLUSTER = "us2";

// ---- shared state -----------------------------------------------------------
const clients = new Set();
const recent = []; // ring buffer for backfilling new SSE clients
const RECENT_MAX = 40;
let channel = { name: null, twitch: false, kick: false };
let windowCount = 0; // messages since last rate tick
let mps = 0;

function pushRecent(evt) {
  recent.push(evt);
  if (recent.length > RECENT_MAX) recent.shift();
}

// ---- top chatters tally -----------------------------------------------------
// Lightweight in-memory count of messages per user, optionally persisted to a JSON file (set
// CHATTERS_FILE; mount a volume in docker-compose). Powers the leaderboard's real top-chatters.
const CHATTERS_FILE = process.env.CHATTERS_FILE || "";
const CHATTERS_MAX = 500; // cap distinct users tracked (bounds memory)
const chatters = new Map(); // `${platform}:${lowerName}` -> { name, platform, count }

// Chat bots never belong on a human leaderboard.
const BOTS = new Set([
  "nightbot", "streamelements", "fossabot", "moobot", "wizebot", "sery_bot", "botrix", "kickbot",
  "streamlabs", "soundalerts", "pokemoncommunitygame",
]);

function tallyChatter(msg) {
  const name = (msg.name || "").trim();
  if (!name || name.toLowerCase() === "anon" || BOTS.has(name.toLowerCase())) return;
  const key = `${msg.platform}:${name.toLowerCase()}`;
  const cur = chatters.get(key);
  if (cur) {
    cur.count += 1;
    return;
  }
  chatters.set(key, { name, platform: msg.platform, count: 1 });
  if (chatters.size > CHATTERS_MAX) {
    let minKey = null;
    let min = Infinity;
    for (const [k, v] of chatters) if (v.count < min) ((min = v.count), (minKey = k));
    if (minKey) chatters.delete(minKey);
  }
}

function topChatters(limit = 20) {
  return [...chatters.values()].sort((a, b) => b.count - a.count).slice(0, limit);
}

function loadChatters() {
  if (!CHATTERS_FILE) return;
  try {
    const arr = JSON.parse(fs.readFileSync(CHATTERS_FILE, "utf8"));
    if (Array.isArray(arr)) {
      for (const c of arr) {
        if (c?.name && c?.platform) {
          chatters.set(`${c.platform}:${String(c.name).toLowerCase()}`, {
            name: c.name,
            platform: c.platform,
            count: Number(c.count) || 0,
          });
        }
      }
    }
    console.log(`[relay] loaded ${chatters.size} chatters from ${CHATTERS_FILE}`);
  } catch {
    /* no file yet */
  }
}

function saveChatters() {
  if (!CHATTERS_FILE) return;
  try {
    fs.writeFileSync(CHATTERS_FILE, JSON.stringify(topChatters(CHATTERS_MAX)));
  } catch {
    /* ignore */
  }
}

if (CHATTERS_FILE) {
  loadChatters();
  setInterval(saveChatters, 30_000);
}

// ---- chat poll voting ---------------------------------------------------------
// The dashboard registers the active poll here; the relay — holding the one server-side
// connection to roster chat — parses votes from messages and serves merged counts. Voters can
// change their vote until the dashboard ends the poll (it deletes the spec).
let pollSpec = null; // { id, options: [{ id, keywords: [string] }] }
let pollVoters = new Map(); // `${platform}:${lowerName}` -> optionId
let pollCounts = {}; // optionId -> count

function setPoll(spec) {
  pollSpec = spec;
  pollVoters = new Map();
  pollCounts = {};
  if (spec) for (const o of spec.options) pollCounts[o.id] = 0;
}

function matchPollOption(body) {
  if (!pollSpec) return null;
  let text = String(body || "").trim().toLowerCase();
  if (text.startsWith("!vote ")) text = text.slice(6).trim();
  if (!text || text.length > 60) return null;
  for (const o of pollSpec.options) {
    for (const kw of o.keywords || []) {
      if (text === String(kw).toLowerCase()) return o.id;
    }
  }
  return null;
}

function tallyPollVote(msg) {
  if (!pollSpec) return;
  const optionId = matchPollOption(msg.body);
  if (!optionId) return;
  const name = (msg.name || "").trim().toLowerCase();
  if (!name || name === "anon" || BOTS.has(name)) return;
  if (pollVoters.size >= 50_000 && !pollVoters.has(`${msg.platform}:${name}`)) return;
  const key = `${msg.platform}:${name}`;
  const previous = pollVoters.get(key);
  if (previous === optionId) return;
  if (previous && pollCounts[previous] > 0) pollCounts[previous] -= 1;
  pollCounts[optionId] = (pollCounts[optionId] || 0) + 1;
  pollVoters.set(key, optionId);
}

function broadcast(event, data) {
  const frame = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) {
    try {
      res.write(frame);
    } catch {
      /* dropped on next tick */
    }
  }
}

function emitMessage(msg) {
  windowCount++;
  tallyChatter(msg);
  tallyPollVote(msg);
  pushRecent({ event: "message", data: msg });
  broadcast("message", msg);
}

function emitEvent(evt) {
  pushRecent({ event: "event", data: evt });
  broadcast("event", evt);
}

function setChannel(next) {
  channel = { ...channel, ...next };
  broadcast("channel", channel);
}

// rate ticker: real messages/sec, averaged over a short window
setInterval(() => {
  mps = Math.round((windowCount / 2) * 10) / 10;
  windowCount = 0;
  broadcast("rate", { mps });
}, 2000);

// ---- Twitch (anonymous IRC over WebSocket) ----------------------------------
function parseTags(raw) {
  const tags = {};
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i === -1) continue;
    tags[part.slice(0, i)] = part.slice(i + 1);
  }
  return tags;
}

function parseIrc(line) {
  let rest = line;
  let tags = {};
  if (rest[0] === "@") {
    const sp = rest.indexOf(" ");
    tags = parseTags(rest.slice(1, sp));
    rest = rest.slice(sp + 1);
  }
  let prefix = "";
  if (rest[0] === ":") {
    const sp = rest.indexOf(" ");
    prefix = rest.slice(1, sp);
    rest = rest.slice(sp + 1);
  }
  const sp = rest.indexOf(" ");
  const command = sp === -1 ? rest : rest.slice(0, sp);
  const params = sp === -1 ? "" : rest.slice(sp + 1);
  return { tags, prefix, command, params };
}

let twitchSocket = null;

/** Joins every roster channel on one anonymous IRC socket; messages keep their source channel. */
function connectTwitch(logins) {
  if (logins.length === 0) return;
  const ws = new WebSocket("wss://irc-ws.chat.twitch.tv:443");
  twitchSocket = ws;
  ws.onopen = () => {
    ws.send("PASS SCHMOOPIIE");
    ws.send("NICK justinfan" + Math.floor(Math.random() * 80000 + 1000));
    ws.send("CAP REQ :twitch.tv/tags twitch.tv/commands");
    ws.send("JOIN " + logins.map((l) => "#" + l).join(","));
  };
  ws.onmessage = (e) => {
    for (const line of String(e.data).split("\r\n")) {
      if (!line) continue;
      if (line.startsWith("PING")) {
        ws.send("PONG :tmi.twitch.tv");
        continue;
      }
      const { tags, prefix, command, params } = parseIrc(line);
      if (command === "001") {
        setChannel({ twitch: true });
      } else if (command === "PRIVMSG") {
        const body = params.slice(params.indexOf(" :") + 2);
        const name = tags["display-name"] || prefix.split("!")[0] || "anon";
        const source = params.startsWith("#") ? params.slice(1, params.indexOf(" ")) : null;
        emitMessage({
          platform: "twitch",
          channel: source,
          name,
          color: tags.color || null,
          badges: badgeList(tags.badges),
          body,
          ts: Date.now(),
        });
      } else if (command === "USERNOTICE") {
        const text = noticeText(tags);
        if (text) emitEvent({ platform: "twitch", text, ts: Date.now() });
      }
    }
  };
  ws.onclose = () => {
    setChannel({ twitch: false });
    if (twitchSocket === ws) setTimeout(() => connectTwitch(logins), 4000);
  };
  ws.onerror = () => {
    try {
      ws.close();
    } catch {}
  };
}

function badgeList(raw) {
  if (!raw) return [];
  const out = [];
  for (const b of raw.split(",")) {
    const key = b.split("/")[0];
    if (key === "moderator") out.push("MOD");
    else if (key === "vip") out.push("VIP");
    else if (key === "subscriber") out.push("SUB");
    else if (key === "broadcaster") out.push("HOST");
  }
  return out.slice(0, 2);
}

function noticeText(tags) {
  const id = tags["msg-id"];
  const user = tags["display-name"] || tags.login || "someone";
  if (id === "sub" || id === "resub") return `${user} subscribed`;
  if (id === "subgift" || id === "submysterygift") return `${user} gifted subs`;
  if (id === "raid") return `${tags["msg-param-displayName"] || user} raided`;
  return null;
}

// ---- Kick (Pusher over WebSocket) -------------------------------------------
let kickSocket = null;

/** Subscribes to every roster chatroom on one Pusher socket. */
function connectKick(chatroomIds) {
  if (chatroomIds.length === 0) return;
  const url = `wss://ws-${KICK_PUSHER_CLUSTER}.pusher.com/app/${KICK_PUSHER_KEY}?protocol=7&client=js&version=8.4.0&flash=false`;
  const ws = new WebSocket(url);
  kickSocket = ws;
  ws.onmessage = (e) => {
    let frame;
    try {
      frame = JSON.parse(String(e.data));
    } catch {
      return;
    }
    if (frame.event === "pusher:connection_established") {
      for (const id of chatroomIds) {
        ws.send(JSON.stringify({ event: "pusher:subscribe", data: { auth: "", channel: `chatrooms.${id}.v2` } }));
      }
      setChannel({ kick: true });
      return;
    }
    if (frame.event === "App\\Events\\ChatMessageEvent") {
      let d;
      try {
        d = JSON.parse(frame.data);
      } catch {
        return;
      }
      emitMessage({
        platform: "kick",
        name: d?.sender?.username || "anon",
        color: d?.sender?.identity?.color || null,
        badges: (d?.sender?.identity?.badges || []).map((b) => String(b.type || "").toUpperCase()).filter(Boolean).slice(0, 2),
        body: d?.content || "",
        ts: Date.now(),
      });
    }
  };
  ws.onclose = () => {
    setChannel({ kick: false });
    if (kickSocket === ws) setTimeout(() => connectKick(chatroomIds), 5000);
  };
  ws.onerror = () => {
    try {
      ws.close();
    } catch {}
  };
}

// ---- startup ------------------------------------------------------------------
// The relay follows exactly the configured roster. No Helix top-channel auto-pick, no live
// probing — those followed strangers' chats and polluted the leaderboard with their viewers.
function start() {
  setChannel({ name: ROSTER.join(", "), twitch: false, kick: false });
  console.log(`[relay] following roster: ${ROSTER.join(", ")}`);
  connectTwitch(ROSTER);

  const kickIds = (process.env.KICK_CHATROOM_ID || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (kickIds.length > 0) {
    console.log(`[relay] kick chatrooms: ${kickIds.join(", ")}`);
    connectKick(kickIds);
  } else {
    console.log("[relay] kick disabled (set KICK_CHATROOM_ID to enable)");
  }
}

// ---- HTTP / SSE -------------------------------------------------------------
const cors = {
  "Access-Control-Allow-Origin": ALLOW_ORIGIN,
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const server = http.createServer((req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, cors);
    res.end();
    return;
  }
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/health") {
    res.writeHead(200, { ...cors, "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, channel, mps, clients: clients.size, chatters: chatters.size }));
    return;
  }
  if (url.pathname === "/poll") {
    if (req.method === "POST") {
      let raw = "";
      req.on("data", (chunk) => {
        raw += chunk;
        if (raw.length > 16384) req.destroy();
      });
      req.on("end", () => {
        try {
          const spec = JSON.parse(raw);
          if (!spec || typeof spec.id !== "string" || !Array.isArray(spec.options)) throw new Error("bad spec");
          setPoll(spec);
          res.writeHead(200, { ...cors, "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true, id: spec.id }));
          console.log(`[relay] poll started: ${spec.id} (${spec.options.length} options)`);
        } catch {
          res.writeHead(400, cors);
          res.end("invalid poll spec");
        }
      });
      return;
    }
    if (req.method === "DELETE") {
      setPoll(null);
      res.writeHead(200, { ...cors, "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    res.writeHead(405, cors);
    res.end();
    return;
  }
  if (url.pathname === "/poll-votes") {
    res.writeHead(200, { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(JSON.stringify({ id: pollSpec ? pollSpec.id : null, counts: pollCounts, voters: pollVoters.size }));
    return;
  }
  if (url.pathname === "/top-chatters") {
    const limit = Math.min(50, Number(url.searchParams.get("limit")) || 20);
    res.writeHead(200, { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(JSON.stringify({ source: "Live chat", channel: channel.name, chatters: topChatters(limit) }));
    return;
  }
  if (url.pathname === "/feed") {
    res.writeHead(200, {
      ...cors,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.write("retry: 3000\n\n");
    res.write(`event: channel\ndata: ${JSON.stringify(channel)}\n\n`);
    res.write(`event: rate\ndata: ${JSON.stringify({ mps })}\n\n`);
    for (const evt of recent) res.write(`event: ${evt.event}\ndata: ${JSON.stringify(evt.data)}\n\n`);
    clients.add(res);
    const ka = setInterval(() => {
      try {
        res.write(": ka\n\n");
      } catch {}
    }, 15000);
    req.on("close", () => {
      clearInterval(ka);
      clients.delete(res);
    });
    return;
  }
  res.writeHead(404, cors);
  res.end("not found");
});

server.listen(PORT, () => {
  console.log(`[relay] listening on :${PORT} (SSE at /feed)`);
  start();
});

// Virta marketing live-chat relay.
//
// Maintains ONE upstream connection to a live channel's Twitch + Kick chat, merges it into a single
// feed, and fans it out to every site visitor over Server-Sent Events. The site (the unified-feed
// mock) consumes `${NEXT_PUBLIC_RELAY_URL}/feed`; with no relay configured it falls back to a
// simulated demo, so the marketing page stays static-by-default.
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
//   CHANNELS              comma-separated Twitch logins to auto-pick from when no Helix creds
//   TWITCH_CLIENT_ID      \ set both to auto-pick the current top live channel via Helix
//   TWITCH_CLIENT_SECRET  /
//   KICK_CHATROOM_ID      enable Kick chat for the chosen channel (id can't be looked up past
//                         Cloudflare here; provide it, or run where the lookup succeeds)
//   KICK_CHANNEL          display label for the Kick side (optional)

import http from "node:http";
import fs from "node:fs";

const PORT = Number(process.env.PORT || 8787);
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || "*";
const FALLBACK_CHANNELS = (process.env.CHANNELS ||
  "jynxzi,kaicenat,caseoh_,jasontheween,zackrawrr,tarik,summit1g,xqc,ironmouse,loud_coringa")
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

function tallyChatter(msg) {
  const name = (msg.name || "").trim();
  if (!name || name.toLowerCase() === "anon") return;
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

function connectTwitch(login) {
  const ws = new WebSocket("wss://irc-ws.chat.twitch.tv:443");
  twitchSocket = ws;
  ws.onopen = () => {
    ws.send("PASS SCHMOOPIIE");
    ws.send("NICK justinfan" + Math.floor(Math.random() * 80000 + 1000));
    ws.send("CAP REQ :twitch.tv/tags twitch.tv/commands");
    ws.send("JOIN #" + login);
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
        emitMessage({
          platform: "twitch",
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
    if (twitchSocket === ws) setTimeout(() => connectTwitch(login), 4000);
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

function connectKick(chatroomId) {
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
      ws.send(JSON.stringify({ event: "pusher:subscribe", data: { auth: "", channel: `chatrooms.${chatroomId}.v2` } }));
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
    if (kickSocket === ws) setTimeout(() => connectKick(chatroomId), 5000);
  };
  ws.onerror = () => {
    try {
      ws.close();
    } catch {}
  };
}

// ---- channel selection ------------------------------------------------------
async function helixTopLive() {
  const id = process.env.TWITCH_CLIENT_ID;
  const secret = process.env.TWITCH_CLIENT_SECRET;
  if (!id || !secret) return null;
  try {
    const tokRes = await fetch(
      `https://id.twitch.tv/oauth2/token?client_id=${id}&client_secret=${secret}&grant_type=client_credentials`,
      { method: "POST" },
    );
    const tok = await tokRes.json();
    const res = await fetch("https://api.twitch.tv/helix/streams?first=1&language=en", {
      headers: { "Client-ID": id, Authorization: `Bearer ${tok.access_token}` },
    });
    const json = await res.json();
    const s = json?.data?.[0];
    return s ? { login: s.user_login, name: s.user_name } : null;
  } catch {
    return null;
  }
}

// Without Helix creds: probe each fallback channel briefly and keep the first that's chatting.
function sampleLive(login, ms = 5000) {
  return new Promise((resolve) => {
    const ws = new WebSocket("wss://irc-ws.chat.twitch.tv:443");
    let got = 0;
    const done = (live) => {
      try {
        ws.close();
      } catch {}
      resolve(live);
    };
    ws.onopen = () => {
      ws.send("PASS SCHMOOPIIE");
      ws.send("NICK justinfan" + Math.floor(Math.random() * 80000 + 1000));
      ws.send("JOIN #" + login);
    };
    ws.onmessage = (e) => {
      if (String(e.data).includes("PRIVMSG")) {
        got++;
        if (got >= 2) done(true);
      } else if (String(e.data).startsWith("PING")) {
        ws.send("PONG :tmi.twitch.tv");
      }
    };
    ws.onerror = () => done(false);
    setTimeout(() => done(got >= 1), ms);
  });
}

async function pickChannel() {
  const helix = await helixTopLive();
  if (helix) return helix;
  for (const login of FALLBACK_CHANNELS) {
    const live = await sampleLive(login);
    if (live) return { login, name: login };
  }
  return { login: FALLBACK_CHANNELS[0], name: FALLBACK_CHANNELS[0] };
}

async function start() {
  const picked = await pickChannel();
  setChannel({ name: picked.name, twitch: false, kick: false });
  console.log(`[relay] following ${picked.name} (#${picked.login})`);
  connectTwitch(picked.login);
  const kickId = process.env.KICK_CHATROOM_ID;
  if (kickId) {
    console.log(`[relay] kick chatroom ${kickId}`);
    connectKick(kickId);
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

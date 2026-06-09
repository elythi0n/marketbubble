# Live-chat relay

An optional, zero-dependency Node service. Its **only required role** today is powering the
**top-chatters leaderboard** — it keeps one shared upstream connection to Twitch + Kick, tallies
every message per user, and exposes a `/top-chatters` endpoint that the dashboard's leaderboard
page reads via the `RELAY_URL` server-side env var.

> **The live chat feed works without the relay.** Twitch IRC and Kick Pusher connect directly from
> each visitor's browser tab (one connection per tab, not one per visitor via a relay). X chat is
> handled separately via the Chrome extension → `/api/x/chat`. The relay does not touch X chat.

Without a relay configured, the leaderboard chatters tab falls back to message counts derived from
the current X chat session buffer. That data is ephemeral (resets on process restart) but is
real — no sample data is shown.

## Run

```bash
node relay/server.mjs     # listens on :8787
```

Point the dashboard at it with a **server-side** env var (not `NEXT_PUBLIC_`):

```bash
# .env.local
RELAY_URL=http://localhost:8787
```

## Configuration

| Var | Purpose |
|---|---|
| `PORT` | Listen port (default `8787`). |
| `ALLOW_ORIGIN` | CORS allow-origin (default `*`; set to your dashboard origin in prod). |
| `CHANNELS` | Comma-separated Twitch logins to probe when no Helix creds are set. First live one wins. |
| `TWITCH_CLIENT_ID` + `TWITCH_CLIENT_SECRET` | Auto-pick the current top-live Twitch channel via Helix. Without these, `CHANNELS` is used. |
| `KICK_CHATROOM_ID` | Enable Kick chat. The chatroom ID can't be looked up through Cloudflare on every host — provide it directly or run the relay somewhere the lookup resolves. |
| `KICK_CHANNEL` | Display label for the Kick side (optional). |
| `CHATTERS_FILE` | Path to a JSON file for persisting chatter counts across restarts (e.g. `/data/chatters.json`). Without this, counts reset when the process exits. |

**Channel selection:** with Helix credentials the relay follows whoever is biggest-live right now.
Without them it probes each login in `CHANNELS` briefly and follows the first that's actively
chatting.

## Endpoints

| Endpoint | Description |
|---|---|
| `GET /top-chatters?limit=N` | JSON `{ source, channel, chatters: [{name, platform, count}] }`. Used by `RELAY_URL` in the dashboard leaderboard API. |
| `GET /health` | JSON status — current channel, msg/s, connected SSE clients, distinct chatters tracked. |
| `GET /feed` | `text/event-stream`. Legacy SSE feed (unused by the current dashboard). Events: `channel`, `message`, `event`, `rate`. Available for external integrations. |

## Deploy

Run it anywhere that allows a long-lived process — a small VM, container, Fly.io, Render, or
Railway. It holds open WebSocket connections to Twitch IRC and Kick Pusher, so a serverless
function is not suitable.

```bash
ALLOW_ORIGIN=https://yourdomain.com \
RELAY_URL=https://relay.yourdomain.com   # set this in the dashboard's environment
```

## Architecture overview

```
Browser tab
  ├─ Twitch IRC (wss://irc-ws.chat.twitch.tv)   ← direct, no relay
  ├─ Kick Pusher (wss://ws-us2.pusher.com)       ← direct, no relay
  └─ polls /api/x/chat every 2 s                ← fed by Chrome extension

Chrome extension (streamer's browser)
  └─ POSTs batches → /api/x/chat (authenticated with X_CHAT_API_KEY)

Relay (this service)                             ← optional
  ├─ Twitch IRC  ─┐
  └─ Kick Pusher ─┴─ tallies chatters → GET /top-chatters
                                         ↑
                              /api/leaderboard/chatters (server-side)
```

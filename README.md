# MarketBubble

**Live at [marketbubble.virta.lol](https://marketbubble.virta.lol)** — nothing to install. If the show is offline, hit **Try Demo** and watch the dashboard run on busy live channels.

**One dashboard for a show that lives on three platforms.** Twitch, Kick and X chat merged into a single live feed, beside the stream, live market data and Polymarket predictions, in a workspace you can rearrange like an IDE.

Built for [MarketBubble](https://x.com/marketbubble), the live show about speculation, attention and culture hosted by Banks and Blknoiz06, Thursdays 1PM PT.

## Why it's different

- **Calm by design.** The default view is three panels: stream, chat, gifts. Everything else (markets, news, predictions, the assistant, settings) stays out of sight until you add it from the launcher, and closes back down when you're done. No permanent toolbars, no always-on ticker walls, no search bar until `Ctrl+K` summons one. One quiet graphite theme, tuned for hours of watching, instead of four loud ones.
- **Right-click anything.** Right-click a chat message or a sidebar channel and open that streamer's chat as its own panel, or just their Kick chat, or just their Twitch chat. Drag it, split it, tab it, pop it out into its own window. Competing "columns views" are fixed layouts; these are first-class panels.
- **Your keys never touch our server.** The AI assistant runs bring-your-own-key entirely in the browser: keys live in memory, die on reload, and requests go straight to the provider. Operators can instead set keys server-side, where they're locked, invisible to clients, and rate-limited per visitor.
- **Ships à la carte.** No database required. The AI assistant is opt-in at runtime and removable at build time with one env var. Demo mode previews the whole dashboard with busy real channels when the show is offline.
- **Calm under fire.** Virtualized rendering, combo-collapse for spam, read helper to slow the feed, keyword highlight/mute filters, and per-channel toggles keep a three-platform firehose readable.
- **Built to run all day.** This is a second-screen app people leave open for hours, and it's engineered like one: every buffer is capped, every cache is pruned, every socket reconnects with backoff, and hidden tabs drop to one update a second. It's as fast at hour six as at minute one.

## Feature tour

**Unified chat**
- Twitch IRC + Kick Pusher + X live chat in one time-ordered feed, with emotes (native + 7TV), badges, name colors, replies, and event rows for subs, raids and gifts
- Per-streamer and per-platform chat panels, opened from a right-click context menu
- Channel filter dropdown (choose which live channels appear in the merged feed), author focus (click a username to see only them), broadcaster emphasis (the streamer's messages get a tint)
- Highlight/mute keyword filters, search with click-to-jump (click a result and the live feed scrolls to that message and flashes it)
- Mention Inbox panel: every message across all channels that names you, collected even while the panel is closed
- Activity dots on background tabs when new messages arrive

**Workspace**
- Dockable panels (drag, split, tab, resize, pop out to a separate window), layout persisted
- `Ctrl+K` command palette: switch channels, toggle settings, open panels, enter Stage, everything searchable
- Tabbed Settings panel: chat density, timestamps, filters, mention names, assistant, layout reset
- **Stage**: a broadcast overlay over the running dashboard (stream + chat + tickers, OBS-ready presentation mode)
- **`/overlay`**: a zero-chrome chat feed for OBS browser sources (`?channel=<id>&scale=1.4&bg=transparent&ts=0`)

**AI assistant (opt-in)**
- Native tool calling against live dashboard data: search this session's chat, top chatters, who's live, market quotes, Polymarket predictions, feed stats, show info
- Tool calls stream into the conversation as live cards, so you watch it work
- Providers: Anthropic, OpenAI, xAI, OpenRouter, with live model lists fetched per provider
- Privacy model: chat is archived in memory only (size configurable, wiped on reload); BYOK keys are in-memory and browser-direct; server-held keys are proxied, locked and rate-limited per visitor (defaults 5/min, 50/day)

**Markets**
- Live quotes for stocks and crypto, top movers, market news with article drawer
- Polymarket predictions, Hyperliquid trade feed, Fear & Greed
- Cashtags detected in chat with hover cards showing live price and change

**Streams & audience**
- Embeds the right player automatically (Twitch/Kick, picks the platform with more viewers, with a manual toggle when simulcasting)
- Per-platform viewer counts in the sidebar, combined stats in the stat band
- Offline view with next-show countdown, recent clips and trending markets
- Leaderboard of top chatters (relay-backed, roster channels only) and on-chain traders

**Pages**: `/` dashboard · `/markets` · `/leaderboard` · `/about` (the show and the hosts) · `/overlay` (OBS)

## Performance & durability

Fast chat is a rendering problem and a memory problem; both are handled deliberately:

- **One render per burst, not per message.** Incoming chat is coalesced on a ~90ms timer, so a 50-messages-per-second firehose triggers ~11 renders a second, each painting only the rows on screen (TanStack Virtual). Memoized rows mean an untouched message never re-renders.
- **Nothing grows forever.** The feed buffer (500), the read-helper queue (200), the mention inbox (500), the assistant archive (configurable), the pre-flush buffer, and the virtualizer's measurement cache are all capped or pruned. Memory at hour six looks like memory at minute one.
- **Background tabs go quiet.** Hidden tabs batch chat once a second instead of 11 times, so a pinned dashboard doesn't cook a laptop. Everything catches up instantly on focus.
- **Connections heal themselves.** Twitch IRC and Kick Pusher reconnect with exponential backoff and answer keepalives; an overnight network blip recovers without a reload.
- **Launch doesn't wait for streams.** The splash clears as soon as the app is interactive (never blocking on player iframes), optional panels are code-split and load on first open, and recent chat is restored from localStorage so a reload doesn't start from a blank feed.

## Platform support

| Platform | Chat | Stream embed | Live status | Viewer count |
|---|---|---|---|---|
| Twitch | Anonymous IRC WebSocket | Twitch player iframe | GQL + Helix API | GQL + Helix API |
| Kick | Anonymous Pusher WebSocket | Kick player iframe | Page scraping | Page scraping |
| X (live broadcasts) | Server broadcast bridge + optional Chrome extension | Link to x.com | Guest GraphQL + broadcasts/show | broadcasts/show + chat occupancy |

X has no official third-party chat API. The server watches each streamer's `xBroadcasts` list (handles or broadcast links), discovers live broadcasts via guest GraphQL, and reads chat over the same WebSocket the X web player uses. An optional Chrome extension complements the bridge by forwarding chat from your browser (including Spaces); both paths de-duplicate by message id. See [Chrome extension](#chrome-extension).

## Quick start

```bash
npm install
npm run dev          # http://localhost:3000
```

No credentials needed to try it: chat connects anonymously from the browser, and Demo mode (top right) fills the dashboard with busy live channels.

Production with Docker (app + relay):

```bash
cp .env.example .env   # fill in what you need
docker compose up -d
```

## Configuration

### Channel roster

Create `streamers.json` at the project root, or set `STREAMERS_JSON` to a JSON array:

```json
[
  {
    "id": "yourhandle",
    "name": "Your Name",
    "handles": { "twitch": "yourhandle", "kick": "yourhandle", "x": "YourHandle" },
    "platforms": ["twitch", "kick", "x"],
    "xBroadcasts": ["YourHandle", "MarketBubble"],
    "schedule": { "label": "FRIDAYS 3PM ET", "weekday": 5, "hour": 15 }
  }
]
```

`handles.x` is the creator's profile handle (avatar, links). `xBroadcasts` is what the server watches for live X chat; list a shared show account alongside the creator's own, duplicates are de-duplicated.

### Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `TWITCH_CLIENT_ID` / `TWITCH_CLIENT_SECRET` | Recommended | Helix API for viewer counts and badges (anonymous GQL fallback without) |
| `X_CHAT_API_KEY` | For the extension | Authenticates the Chrome extension |
| `X_BROADCAST_SOURCES` | Optional | Extra `@handles` or broadcast links for the X bridge |
| `X_MENTION_QUERIES` | Optional | Search terms for the X Mentions pane |
| `STREAMERS_JSON` | Optional | Channel roster as an env var instead of `streamers.json` |
| `RELAY_URL` | Optional | Relay for the persistent top-chatters leaderboard |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `XAI_API_KEY` / `OPENROUTER_API_KEY` | Optional | Server-held assistant keys: locked in the UI, proxied so they never reach the browser |
| `ASSISTANT_RPM` / `ASSISTANT_RPD` | Optional | Per-visitor limits for server-held keys (default 5/min, 50/day; BYOK is unlimited) |
| `NEXT_PUBLIC_AI_DISABLED=1` | Optional | Ship the dashboard without the AI assistant entirely |
| `NEXT_PUBLIC_DEMO_DISABLED=1` | Optional | Ship live-only (hides the Live/Demo switch) |

### AI assistant key handling

Two modes, combinable per provider:

1. **Bring your own key** (default): pasted in the panel, held in plain JS memory, cleared on reload, sent only to the provider, directly from the browser. No limits; usage is between the user and their provider.
2. **Server-held** (set the env var): the provider shows as "Active · server" and is locked in the UI. The browser still builds prompts and runs tools locally; only the streaming inference call passes through `/api/assistant/proxy`, which attaches the key and enforces per-IP rate and daily limits.

Either way there is no database: the assistant's chat archive is in-memory, session-only and opt-in.

## Chrome extension

Optional, for X chat capture from your browser (including Spaces). It runs as a content script on X broadcast pages, batches messages to `/api/x/chat`, and only activates for handles whitelisted in `public/x.json`.

Options: API URL (your deployment), API key (`X_CHAT_API_KEY`), flush interval. Install via `chrome://extensions` → developer mode → load `extension/` unpacked.

## Virta plugin

Optional, for mods who run [Virta](https://github.com/elythi0n/virta) against the show's channels: a GUI plugin that docks a MarketBubble control room (show status, top chatters, predictions, X chat) next to Virta's moderation tools. The plugin brings all of its own UI; Virta only provides the sandbox and API bridge. See [virta-plugin/README.md](virta-plugin/README.md) — install from URL: `https://marketbubble.virta.lol/marketbubble-virta-plugin.zip`.

## Relay

Optional. Chat connects directly from each visitor's browser; the relay's job is the persistent top-chatters leaderboard (and a shared SSE chat feed). It follows **only the configured roster channels** (`CHANNELS`, default `fazebanks`), joins them all at once, ignores chat bots, and persists tallies to `CHATTERS_FILE`.

```bash
node relay/server.mjs   # :8787; set RELAY_URL=http://localhost:8787 on the app
```

## Stack

Next.js 15 · React 19 · TypeScript · Tailwind v4 · Dockview · TanStack Virtual · Framer Motion. No database, no message broker; platform connections are plain WebSockets from the browser, server routes are thin proxies for things browsers can't reach (Kick's Cloudflare, X GraphQL, provider keys).

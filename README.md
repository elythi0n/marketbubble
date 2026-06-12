# MarketBubble

**Live at [marketbubble.virta.lol](https://marketbubble.virta.lol)** — nothing to install. If the show is offline, hit **Try Demo** and watch the dashboard run on busy live channels.

**One dashboard for a show that lives on three platforms.** Twitch, Kick and X chat merged into a single live feed, beside the stream, live market data and Polymarket predictions, in a workspace you can rearrange like an IDE.

Built for [MarketBubble](https://x.com/marketbubble), the live show about speculation, attention and culture hosted by Banks and Blknoiz06, Thursdays 1PM PT.

## Why it's different

- **Calm by design.** The default view is three panels: stream, chat, gifts. Everything else (markets, news, predictions, the assistant, settings) stays out of sight until you add it from the launcher, and closes back down when you're done. No permanent toolbars, no always-on ticker walls, no search bar until `Ctrl+K` summons one. One quiet graphite theme, tuned for hours of watching, instead of four loud ones.
- **Right-click anything.** Right-click a chat message or a sidebar channel and open that streamer's chat as its own panel, or just their Kick chat, or just their Twitch chat. Drag it, split it, tab it, pop it out into its own window. Competing "columns views" are fixed layouts; these are first-class panels.
- **Your keys never touch our server.** The AI assistant runs bring-your-own-key entirely in the browser: keys live in memory, die on reload, and requests go straight to the provider. Operators can instead set keys server-side, where they're locked, invisible to clients, and rate-limited per visitor.
- **Always listening.** Twitch and Kick chat stays connected around the clock — even while every channel is offline (both platforms keep their chatrooms open between streams). The all-time leaderboard, giveaway entry pools, user-card stats and analytics keep accumulating between shows instead of starting cold at airtime.
- **Ships à la carte.** No database required — everything runs in-memory out of the box, with the honest caveat that live-production state (polls mid-vote, roster and schedule overrides, chatter tallies, clip-radar moments, hosted share links) resets when the process restarts. Point `DATABASE_PATH` at a SQLite file and all of it becomes durable; the schema migrates itself. The AI assistant is opt-in at runtime and removable at build time with one env var. Demo mode previews the whole dashboard with busy real channels when the show is offline.
- **Calm under fire.** Virtualized rendering, combo-collapse for spam, read helper to slow the feed, keyword highlight/mute filters, and per-channel toggles keep a three-platform firehose readable.
- **Built to run all day.** This is a second-screen app people leave open for hours, and it's engineered like one: every buffer is capped, every cache is pruned, every socket reconnects with backoff, and hidden tabs drop to one update a second. It's as fast at hour six as at minute one.
- **Built to be run.** The admin control room gives hosts live tools during the show: push announcements to all viewers, run audience polls with real-time tallies, draw giveaways from the chatter rolls, manage the cast and weekly schedule on a calendar, watch analytics, arm an auto-clipper, and share branded highlight cards to X — all without touching the codebase or reloading anything. Shared highlights are hosted at stable `/share/<id>` links whose previews unfurl into full picture cards on X, so the image travels with the post instead of dying in a screenshot folder.

## Feature tour

**Unified chat**
- Twitch IRC + Kick Pusher + X live chat in one time-ordered feed, with emotes (native + 7TV), badges, name colors, replies, and event rows for subs, raids and gifts
- Per-streamer and per-platform chat panels, opened from a right-click context menu
- Channel filter dropdown (choose which live channels appear in the merged feed), broadcaster emphasis (the streamer's messages get a tint)
- **User cards**: click any username for their card — session message count and share of chat, all-time tally with overall rank (from the durable leaderboard), recent message history, and one-click author focus
- **Chat never sleeps**: Twitch and Kick chats stay connected even while channels are offline, so the leaderboard, giveaway pools and analytics keep filling between shows
- Highlight/mute keyword filters, search with click-to-jump (click a result and the live feed scrolls to that message and flashes it)
- Mention Inbox panel: every message across all channels that names you, collected even while the panel is closed
- Activity dots on background tabs when new messages arrive
- **Chat Roster** with live message counts, per-platform filter pills, username search, and a sort toggle (message count or most recent)

**Workspace**
- Dockable panels (drag, split, tab, resize, pop out to a separate window), layout persisted
- `Ctrl+K` command palette: switch channels, toggle settings, open panels, enter Stage, everything searchable
- Tabbed Settings panel: chat density, timestamps, filters, mention names, assistant, layout reset
- **Stage**: a broadcast overlay over the running dashboard (stream + chat + tickers, OBS-ready presentation mode), with one-click full screen that hides the idle cursor
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
- **Hype Meter**: 30-minute sparkline of chat activity with triangle markers at spike positions, click any bucket to jump to that moment in the chat archive
- **Highlights panel**: notable chat moments with relative timestamps (just now · 3m ago · 2h 5m ago), linked to the Hype Meter markers
- **Leaderboard** of top chatters (relay-backed, roster channels only) with platform-colored subscriber badges, and on-chain traders

**News** (`/news`)
- Wall Street broadsheet layout: Walburn masthead, double rule, full-width hero + editorial sidebar — the same hierarchy a print front page uses, not a list of links
- Live RSS from CoinDesk, CoinTelegraph, Decrypt and Yahoo Finance, refreshed every 5 minutes; color-coded category chips (Crypto · Markets)
- Full-width "Latest" grid below the fold, with the leading article spanning two columns for editorial weight
- Recent Clips & Broadcasts row pulls from the streamer's Twitch clip history and YouTube channel, opening inline with the same player dialog as the main dashboard

**Admin control room** (`/admin/*`)
- Routed, password-protected pages behind one login (the key is held in memory, never stored); falls back to a real 404 when no key is configured, so it's invisible to visitors
- **Engage**: broadcast a full-screen announcement to all connected viewers; run live audience polls with option voting and inline chat-vote detection, real-time bar chart tallies, lock and clear controls
- **Roster & schedule**: the show's cast lives here — introduce new characters or shows under the MarketBubble umbrella, retire them, edit handles, and **pin** a channel so it leads every viewer's sidebar with a golden card and pin badge. A weekly **calendar** (Pacific Time, the show's clock) lays the whole cast out as avatar chips: click a cell to schedule someone, click a chip to move or clear them — slots drive the dashboard's next-show countdowns and live-discovery polling, and everything publishes live to every open dashboard
- **Giveaway**: draw a random viewer from every chatter the show has ever recorded, filtered by platform, minimum messages, or recent activity — a deterministic slot-machine roll plays identically on the admin screen and the OBS overlay, decelerates onto the winner (the name it lands on *is* the winner), and the result stays up until cleared
- **Controls**: push global keyword filters (highlight/mute) and feature flags to every visitor in real time; arm the **clip radar** — off by default, it watches combined chat velocity server-side, fires while a spike is still building, snapshots the surrounding chat, and (with a Twitch token) cuts a real Twitch clip whose footage starts *before* the trigger, since Twitch clips retroactively
- **Analytics**: viewer history with a hover crosshair, a GitHub-style activity heatmap (click a day to inspect it in the chart), a stream session log that can merge overlapping channels into one "unified show", per-channel totals, top chatters, and the clip-radar review strip (keep · re-trim on Twitch · dismiss)
- **Share to X**: any highlight — a day's peak viewers, a stream session with its viewer curve, a giveaway winner — renders as a letterpress-styled portrait card (the lettermark stamped on light stock, Walburn type). Copy it, download it, or post it: posting hosts the PNG and opens X with a link that unfurls into a large picture card
- **Health**: live platform connection status, relay/bridge/database state, and viewer counts across the roster
- **Rehearsal mode**: `/admin/giveaway?demo=1` and `/admin/analytics?demo=1` run on generated data, so you can demo or practice without a database or live chat
- **OBS sources** with one-click URL copy: `/overlay-poll` (the active poll, invisible when idle) and `/overlay-giveaway` (the roll + winner) — both take `?bg=transparent&scale=1.4`

**Pages**: `/` dashboard · `/markets` · `/news` · `/leaderboard` · `/about` (the show and the hosts) · `/overlay` (OBS chat) · `/overlay-poll` (OBS poll) · `/overlay-giveaway` (OBS giveaway) · `/share/<id>` (hosted highlight cards) · `/admin/*` (producer tools)

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
    "schedule": { "label": "THURSDAYS 1PM PT", "weekday": 4, "hour": 13 }
  }
]
```

`handles.x` is the creator's profile handle (avatar, links). `xBroadcasts` is what the server watches for live X chat; list a shared show account alongside the creator's own, duplicates are de-duplicated.

### Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `TWITCH_CLIENT_ID` / `TWITCH_CLIENT_SECRET` | Recommended | Helix API for viewer counts and badges (anonymous GQL fallback without) |
| `TWITCH_CLIP_TOKEN` | Optional | Twitch user token with `clips:edit` so the clip radar cuts real clips (moments-only without) |
| `X_CHAT_API_KEY` | For the extension | Authenticates the Chrome extension |
| `X_BROADCAST_SOURCES` | Optional | Extra `@handles` or broadcast links for the X bridge |
| `X_MENTION_QUERIES` | Optional | Search terms for the X Mentions pane |
| `STREAMERS_JSON` | Optional | Channel roster as an env var instead of `streamers.json` |
| `RELAY_URL` | Optional | Relay for the persistent top-chatters leaderboard |
| `DATABASE_PATH` | Optional | SQLite file for persistence (e.g. `/data/marketbubble.db`); unset = in-memory |
| `ADMIN_API_KEY` | Optional | Password for `/admin` (falls back to `X_CHAT_API_KEY`; route is a 404 until one is set) |
| `ADMIN_DISABLED=1` | Optional | Force the admin route to 404 regardless of key configuration |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `XAI_API_KEY` / `OPENROUTER_API_KEY` | Optional | Server-held assistant keys: locked in the UI, proxied so they never reach the browser |
| `ASSISTANT_RPM` / `ASSISTANT_RPD` | Optional | Per-visitor limits for server-held keys (default 5/min, 50/day; BYOK is unlimited) |
| `NEXT_PUBLIC_AI_DISABLED=1` | Optional | Ship the dashboard without the AI assistant entirely |
| `NEXT_PUBLIC_DEMO_DISABLED=1` | Optional | Ship live-only (hides the Live/Demo switch) |

### Database (optional)

The dashboard runs with or without a database — same features either way, the database only adds durability and history.

- **Without** (default): everything is in-memory. Announcements, flags, polls, roster and schedule overrides, chat filters, chatter tallies, clip-radar moments, giveaway state and hosted share links reset when the process restarts. Zero setup, nothing to back up.
- **With** (`DATABASE_PATH=/data/marketbubble.db`): the admin control plane hydrates from SQLite at boot and writes through on every change — an open poll survives a deploy mid-vote (per-voter dedup included), and finished polls accumulate as history. The leaderboard becomes all-time (chatter counts accumulate across app and relay restarts), which is also what the giveaway draws from and what user cards rank against. A sampler records viewer counts and chat load every minute while live, powering the admin Analytics page (navigable 1h–30d charts, the activity heatmap, the session log; 90-day retention). Clip-radar moments and shared highlight images persist too, so review queues and `/share/<id>` links survive restarts. Uses Node's built-in SQLite driver: no extra container, no native module, no migration step (the schema migrates itself at boot).

The compose file already mounts a persistent volume at `/data`, so enabling persistence is just uncommenting `DATABASE_PATH` in `.env`. Backups are a file copy of `marketbubble.db` (plus its `-wal` sidecar), or snapshot the volume. If the file can't be opened the app logs the error and falls back to in-memory rather than failing the show.

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

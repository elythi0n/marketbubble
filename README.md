# MarketBubble

A live stream dashboard built for finance and markets content. It combines a unified chat feed, live stream embeds, real-time market data, and audience stats into a single dockable workspace.

## What it does

**Chat**
- Unified feed merging Twitch IRC, Kick Pusher, and X live chat in real time
- Platform-tagged messages with badges, emotes, name colors, and event rows (subs, raids, gifts)
- Switches to the selected channel's chat automatically when you change streams
- Read helper for slowing down fast chat, zoom controls, per-platform connection status

**Streams**
- Embeds the correct platform player automatically based on where the streamer is live
- Polls both Twitch and Kick every 30 s for the selected stream; picks the platform with more viewers
- Live viewer count in the stat bar updated from real data
- Stream thumbnails in the channel sidebar, refreshed on every poll
- Offline panel shows next-stream countdown, recent clips, and trending markets while waiting

**Market data**
- Live quotes for stocks and crypto with price and change
- Market news feed with descriptions, authors, tags, and a full article drawer
- Predictions market
- Hyperliquid trade feed
- Cashtag detection in chat with hover cards showing live price and change

**Audience**
- Viewer count, unique chatters, top cashtag, and gift/event count in the stat band
- Leaderboard tab with top chatters from the live X chat session

**Workspace**
- Dockable panel layout: drag, split, tab, and resize any pane
- Sidebar with per-channel live status, viewer count, and thumbnail
- Mobile layout with bottom nav and swipeable workspace
- Demo mode for previewing with sample data

## Platform support

| Platform | Chat | Stream embed | Live status | Viewer count |
|---|---|---|---|---|
| Twitch | Anonymous IRC WebSocket | Twitch player iframe | GQL + Helix API | GQL + Helix API |
| Kick | Anonymous Pusher WebSocket | Kick player iframe | Page scraping | Page scraping |
| X (live broadcasts) | Server broadcast bridge + optional Chrome extension | Link to x.com | Guest GraphQL + broadcasts/show | broadcasts/show + chat occupancy |

X has no official third-party chat API. The server watches each streamer's `xBroadcasts` list (handles or broadcast links), discovers live broadcasts via guest GraphQL, and reads chat over the same WebSocket the X web player uses. Live/offline comes from `broadcasts/show` (RUNNING state); viewer count from `total_watching` and live occupancy frames on the chat socket. No extension required for plain live broadcasts.

The optional Chrome extension still works and complements the bridge: it forwards chat from your browser (including Spaces) into the same feed. Both paths de-duplicate by message id.

## Chrome extension

Optional. Use it when you want chat from Spaces or prefer browser-side capture. Plain X live broadcasts are already covered by the server bridge when `xBroadcasts` is configured.

**How it works**

1. Runs as a content script on X broadcast pages in your browser
2. Intercepts chat messages from the page context
3. Batches are flushed to `/api/x/chat` on the dashboard at a configurable interval
4. The dashboard merges X messages into the unified feed alongside Twitch and Kick

**Streamer whitelist**

The extension only activates on authorized streams. On first save it fetches `/x.json` from your dashboard and caches the list of approved handles. It will not forward chat from any stream not on that list.

Edit `public/x.json` to manage the whitelist:

```json
{
  "streamers": [
    { "handle": "yourhandle" }
  ]
}
```

**Options**

| Setting | Description |
|---|---|
| API URL | Base URL of your dashboard deployment |
| API Key | Must match `X_CHAT_API_KEY` on the server |
| Flush interval | How often batches are sent: 500 ms, 1 s (default), 2 s, or 5 s |

To install: open `chrome://extensions`, enable developer mode, and load the `extension/` folder as an unpacked extension.

## Setup

```bash
pnpm install
pnpm dev
```

### Channel roster

Create `streamers.json` at the project root, or set the `STREAMERS_JSON` environment variable to a JSON array:

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

`handles.x` is the creator's profile handle (avatar, social links). `xBroadcasts` is what the server watches for live chat: each entry is an `@handle` or a broadcast link. List a shared show account (e.g. `MarketBubble`) alongside the creator's own handle; duplicates across streamers are de-duplicated automatically.

### Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `TWITCH_CLIENT_ID` | Recommended | Twitch Helix API for viewer counts and badges |
| `TWITCH_CLIENT_SECRET` | Recommended | Twitch app access token |
| `X_CHAT_API_KEY` | For X chat extension | Authenticates the Chrome extension |
| `X_BROADCAST_SOURCES` | Optional | Extra `@handles` or broadcast links for the server bridge (additive to `xBroadcasts`) |
| `RELAY_URL` | Optional | Relay server for persistent leaderboard chatters |
| `X_MENTION_QUERIES` | Optional | Comma-separated search terms for the X mentions pane |
| `STREAMERS_JSON` | Optional | JSON channel roster as an alternative to streamers.json |

Without Twitch credentials the app falls back to the public anonymous GQL endpoint for live status. Badges require credentials.

## Relay (optional)

Live chat connects directly from each visitor's browser. No relay needed for chat. The relay's only role is providing a persistent top-chatters leaderboard across sessions.

Without a relay the leaderboard falls back to message counts from the current X chat session buffer, which resets on server restart.

```bash
node relay/server.mjs   # listens on :8787
```

Set `RELAY_URL=http://localhost:8787` (server-side only, not `NEXT_PUBLIC_`) to connect the dashboard. See `relay/README.md` for full configuration.

## Stack

Next.js 15, Tailwind v4, TypeScript, Dockview

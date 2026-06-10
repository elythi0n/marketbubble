# MarketBubble × Virta plugin

A [Virta](https://github.com/elythi0n/virta) plugin that puts a MarketBubble control room inside
Virta's dock: show status with per-platform live state, the top-chatters leaderboard, Polymarket
predictions, and the live X chat feed. Mods run Virta against the show's channels (moderation,
held-queue, durable logging); this panel gives them the show's pulse next to those tools.

MarketBubble itself stays database-free — the plugin only reads the dashboard's public APIs, and
anything durable lives in Virta if the streamer opts into logging there.

## Install

1. Build the archive (also committed to `public/`, so the deployed site serves it):

   ```bash
   ./build.sh
   ```

2. In Virta: **Plugins → Install from URL** and paste:

   ```
   https://marketbubble.virta.lol/marketbubble-virta-plugin.zip
   ```

3. Open the **MarketBubble** panel from the panel catalog (or the command palette).

## Configuration

Plugins → MarketBubble → settings:

| Setting | Meaning |
|---|---|
| **MarketBubble URL** | Base URL of the dashboard deployment (default `https://marketbubble.virta.lol`). |
| **API key** | The dashboard's `X_CHAT_API_KEY` — the same key the Chrome extension uses. Public show data works without it; it authenticates operator endpoints and is sent as `x-api-key` on every bridged request. |

## How it works

- **Sandboxed GUI**: static HTML/CSS/JS served by the Virta daemon under a strict CSP — the panel
  itself can make no network calls.
- **Scoped HTTP bridge**: all requests go through Virta's `POST /v1/plugins/{id}/http`, which only
  allows the endpoints declared in `virta-plugin.json` (plus the configured base URL).
- **Config bridge**: settings come from Virta's per-plugin config store via the `config.get`
  postMessage call; nothing is stored in the page.

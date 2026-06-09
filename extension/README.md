# MarketBubble Chat Bridge

A Chrome extension that bridges X (Twitter) livestream chat to the MarketBubble dashboard in real time.

## How to install (Chrome)

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** → select this `extension/` folder
4. The extension icon appears in the toolbar

## Configuration

Click the extension icon (or right-click → **Options**) to open Settings.

| Field | Value |
|---|---|
| **API Base URL** | Your deployed dashboard URL, e.g. `https://marketbubble.com` |
| **API Key** | The value of `X_CHAT_API_KEY` in your server's environment |

The Settings page tests the connection before saving — you'll see a confirmation or an error message.

## Server setup

Add to your deployment environment:

```env
X_CHAT_API_KEY=<generate a long random string, e.g. openssl rand -hex 32>
```

Without this env var the POST endpoint rejects all requests.

## How messages flow

```
X livestream tab (your browser)
  └─ content.js intercepts chat
       ├─ WebSocket frames  (Periscope/X protocol)
       ├─ fetch() responses (REST / GraphQL)
       └─ DOM MutationObserver (fallback)
         └─ batched every 2s → POST /api/x/chat
              └─ server deduplicates by message ID
                   └─ chat pane polls GET /api/x/chat every 2.5s
                        └─ messages appear with the X platform glyph
```

## Multiple instances

Two admins running the extension simultaneously is safe — the server deduplicates by X message ID, so each unique message appears exactly once regardless of how many instances push it.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Settings page says "Wrong API key" | Check `X_CHAT_API_KEY` matches on the server |
| Settings page says "Could not reach server" | Check API URL has no trailing slash and HTTPS is working |
| No messages appear in chat | Open the X livestream tab **after** saving settings; check the browser console for `[MB Bridge] active on …` |
| Messages stopped flowing | X may have changed their internal WebSocket protocol — the DOM fallback should still work; open a GitHub issue |

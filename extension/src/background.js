/**
 * Service worker — manages tab detection, settings relay, and state persistence.
 * All chrome.storage access goes through here since content scripts run in MAIN world.
 */

const LIVENESS_ALARM = "mb-liveness-check";
const STATE_KEY = "mb_bridge_state";
const DEFAULT_FLUSH_MS = 1000;

const LIVE_URL_PATTERNS = [
  /x\.com\/i\/broadcasts\//i,
  /x\.com\/[^/]+\/live/i,
  /twitter\.com\/i\/broadcasts\//i,
  /twitter\.com\/[^/]+\/live/i,
];

// ─── Lifecycle ───────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(LIVENESS_ALARM, { periodInMinutes: 2 });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === LIVENESS_ALARM) pingLiveTabs();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete") return;
  if (tab.url && isLiveUrl(tab.url)) {
    sendToContent(tabId, { type: "START" });
  } else if (tab.url && isXUrl(tab.url)) {
    clearLiveState();
  }
});

chrome.tabs.onRemoved.addListener(() => {
  chrome.tabs.query({ url: ["https://x.com/*", "https://twitter.com/*"] }, (tabs) => {
    const hasLive = tabs.some((t) => t.url && isLiveUrl(t.url));
    if (!hasLive) clearLiveState();
  });
});

// ─── Message handling ────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  switch (msg.type) {
    case "GET_SETTINGS":
      chrome.storage.local.get(["apiUrl", "apiKey", "flushMs", "streamers"]).then((data) => {
        sendResponse({
          apiUrl: data.apiUrl ?? "",
          apiKey: data.apiKey ?? "",
          flushMs: data.flushMs ?? DEFAULT_FLUSH_MS,
          streamers: data.streamers ?? [],
        });
      });
      return true; // async

    case "UPDATE_STATE":
      chrome.storage.local.set({ [STATE_KEY]: msg.state });
      return;

    case "GET_STATE":
      chrome.storage.local.get([STATE_KEY, "apiUrl", "apiKey", "streamers"]).then((data) => {
        sendResponse({
          state: data[STATE_KEY] ?? null,
          configured: !!(data.apiUrl && data.apiKey),
          apiUrl: data.apiUrl ?? null,
          streamers: data.streamers ?? [],
        });
      });
      return true; // async
  }
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isLiveUrl(url) {
  return LIVE_URL_PATTERNS.some((re) => re.test(url));
}

function isXUrl(url) {
  return /x\.com|twitter\.com/i.test(url);
}

function sendToContent(tabId, message) {
  chrome.tabs.sendMessage(tabId, message).catch(() => { /* not ready */ });
}

async function pingLiveTabs() {
  const { apiUrl } = await chrome.storage.local.get("apiUrl");
  if (!apiUrl) return;
  const tabs = await chrome.tabs.query({ url: ["https://x.com/*", "https://twitter.com/*"] });
  for (const tab of tabs) {
    if (tab.id && tab.url && isLiveUrl(tab.url)) sendToContent(tab.id, { type: "PING" });
  }
}

function clearLiveState() {
  chrome.storage.local.get(STATE_KEY, (data) => {
    const s = data[STATE_KEY];
    if (s?.active) {
      chrome.storage.local.set({ [STATE_KEY]: { ...s, active: false, updatedAt: Date.now() } });
    }
  });
}

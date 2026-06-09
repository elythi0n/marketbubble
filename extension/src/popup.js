const STALE_MS = 15_000;

const badge         = document.getElementById("badge");
const badgeLabel    = document.getElementById("badgeLabel");
const viewUnconfigured = document.getElementById("viewUnconfigured");
const viewIdle      = document.getElementById("viewIdle");
const viewLive      = document.getElementById("viewLive");
const viewWarning   = document.getElementById("viewWarning");
const liveUrl       = document.getElementById("liveUrl");
const statTotal     = document.getElementById("statTotal");
const statLast      = document.getElementById("statLast");
const pillWs        = document.getElementById("pillWs");
const pillFetch     = document.getElementById("pillFetch");
const pillDom       = document.getElementById("pillDom");
const warningText   = document.getElementById("warningText");
const ftUrl         = document.getElementById("ftUrl");
const btnSettings   = document.getElementById("btnSettings");

btnSettings.addEventListener("click", () => chrome.runtime.openOptionsPage());

// ─── Helpers ──────────────────────────────────────────────────────────────────

function show(...active) {
  [viewUnconfigured, viewIdle, viewLive, viewWarning].forEach(
    (el) => el.classList.toggle("hidden", !active.includes(el))
  );
}

function fmt(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000)    return `${(n / 1_000).toFixed(0)}K`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function ago(ms) {
  if (!ms) return "—";
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 5)  return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

function shortUrl(url) {
  if (!url) return "";
  try {
    const u = new URL(url);
    const p = u.pathname.replace(/^\//, "");
    return p ? p.slice(0, 26) : u.hostname;
  } catch { return url.slice(0, 26); }
}

function setPill(el, on) {
  el.className = `s-pill${on ? " on" : ""}`;
}

function setBadge(cls, label) {
  badge.className = `hd-badge ${cls}`;
  badgeLabel.textContent = label;
}

// ─── Render ───────────────────────────────────────────────────────────────────

function render({ state, configured, apiUrl }) {
  ftUrl.textContent = apiUrl ? apiUrl.replace(/^https?:\/\//, "") : "";

  if (!configured) {
    setBadge("", "—");
    show(viewUnconfigured);
    return;
  }

  if (!state) {
    setBadge("ok", "Connected");
    show(viewIdle);
    return;
  }

  const stale = state.updatedAt && (Date.now() - state.updatedAt) > STALE_MS;

  if (!state.active || stale) {
    setBadge("ok", "Connected");
    show(viewIdle);
    return;
  }

  // Live
  setBadge("live", "Live");
  const views = [viewLive];
  if (state.schemaWarning) views.push(viewWarning);
  show(...views);

  liveUrl.textContent  = shortUrl(state.pageUrl);
  statTotal.textContent = fmt(state.messagesTotal ?? 0);
  statLast.textContent  = ago(state.lastMessageAt);

  setPill(pillWs,    !!(state.strategies?.websocket));
  setPill(pillFetch, !!(state.strategies?.fetch));
  setPill(pillDom,   !!(state.strategies?.dom));

  if (state.schemaWarning && state.schemaWarningReason) {
    warningText.textContent = state.schemaWarningReason;
  }
}

// ─── Poll ─────────────────────────────────────────────────────────────────────

function load() {
  chrome.runtime.sendMessage({ type: "GET_STATE" }, (data) => {
    if (chrome.runtime.lastError || !data) return;
    render(data);
  });
}

load();
setInterval(load, 2000);

const apiUrlInput  = document.getElementById("apiUrl");
const apiKeyInput  = document.getElementById("apiKey");
const btnSave      = document.getElementById("btnSave");
const btnClear     = document.getElementById("btnClear");
const toastEl      = document.getElementById("toast");
const connPill     = document.getElementById("connPill");
const connLabel    = document.getElementById("connLabel");
const ivPills      = document.querySelectorAll(".iv-pill");
const streamerList = document.getElementById("streamerList");
const sbServer     = document.getElementById("sbServer");
const sbStreamers  = document.getElementById("sbStreamers");
const sbFlush      = document.getElementById("sbFlush");

let currentFlushMs = 1000;

// ─── Load saved values ────────────────────────────────────────────────────────

chrome.storage.local.get(["apiUrl", "apiKey", "flushMs", "streamers"], (data) => {
  if (data.apiUrl) apiUrlInput.value = data.apiUrl;
  if (data.apiKey) apiKeyInput.value = data.apiKey;

  currentFlushMs = data.flushMs ?? 1000;
  setActiveInterval(currentFlushMs);

  const streamers = data.streamers ?? [];
  renderStreamers(streamers);
  updateStatusRow(data.apiUrl ?? null, streamers, currentFlushMs);
  setPill(data.apiUrl && data.apiKey ? "idle" : "none");
});

// ─── Interval picker ──────────────────────────────────────────────────────────

ivPills.forEach((btn) => {
  btn.addEventListener("click", async () => {
    const ms = parseInt(btn.dataset.ms, 10);
    currentFlushMs = ms;
    setActiveInterval(ms);
    await chrome.storage.local.set({ flushMs: ms });
    updateFlushStat(ms);
  });
});

function setActiveInterval(ms) {
  ivPills.forEach((btn) => {
    btn.classList.toggle("active", parseInt(btn.dataset.ms, 10) === ms);
  });
}

// ─── Save & verify ────────────────────────────────────────────────────────────

btnSave.addEventListener("click", async () => {
  const apiUrl = apiUrlInput.value.trim().replace(/\/$/, "");
  const apiKey = apiKeyInput.value.trim();

  if (!apiUrl)                       { showToast("Dashboard URL is required.", "err"); return; }
  if (!apiUrl.startsWith("http"))    { showToast("URL must start with https://", "err"); return; }
  if (!apiKey)                       { showToast("API key is required.", "err"); return; }

  showToast("Verifying…", "");
  setPill("none");

  // 1. Verify the API endpoint
  try {
    const res = await fetch(`${apiUrl}/api/x/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Api-Key": apiKey },
      body: JSON.stringify({ messages: [] }),
    });
    if (res.status === 401) { showToast("Wrong API key.", "err"); setPill("err"); return; }
    if (!res.ok)             { showToast(`Server error ${res.status}.`, "err"); setPill("err"); return; }
  } catch {
    showToast("Cannot reach server.", "err"); setPill("err");
    sbServer.textContent = "unreachable";
    sbServer.className = "sb-val err";
    return;
  }

  // 2. Fetch streamer list from /x.json
  let streamers = [];
  try {
    const xRes = await fetch(`${apiUrl}/x.json`, { cache: "no-store" });
    if (xRes.ok) {
      const json = await xRes.json();
      streamers = Array.isArray(json.streamers) ? json.streamers : [];
    }
  } catch { /* x.json missing or malformed — activate for all streams */ }

  // 3. Persist everything
  await chrome.storage.local.set({ apiUrl, apiKey, flushMs: currentFlushMs, streamers });

  setPill("ok");
  renderStreamers(streamers);
  updateStatusRow(apiUrl, streamers, currentFlushMs);
  showToast(
    streamers.length
      ? `Saved — watching ${streamers.length} streamer${streamers.length > 1 ? "s" : ""}.`
      : "Saved — no streamers in /x.json, will activate for all streams.",
    "ok"
  );
});

// ─── Clear ────────────────────────────────────────────────────────────────────

btnClear.addEventListener("click", async () => {
  await chrome.storage.local.remove(["apiUrl", "apiKey", "streamers"]);
  apiUrlInput.value = "";
  apiKeyInput.value = "";
  setPill("none");
  renderStreamers([]);
  updateStatusRow(null, [], currentFlushMs);
  showToast("Cleared.", "ok");
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

let toastTimer = null;
function showToast(msg, type) {
  toastEl.textContent = msg;
  toastEl.className = `toast${type ? " " + type : ""} show`;
  clearTimeout(toastTimer);
  if (type) toastTimer = setTimeout(() => { toastEl.className = "toast"; }, 4000);
}

function setPill(state) {
  const map = {
    ok:   ["ok",  "connected"],
    err:  ["err", "error"],
    idle: ["",    "configured"],
    none: ["",    "not configured"],
  };
  const [cls, label] = map[state] ?? ["", state];
  connPill.className = `conn-pill ${cls}`.trim();
  connLabel.textContent = label;
}

function renderStreamers(streamers) {
  if (!streamers.length) {
    streamerList.innerHTML = '<div class="streamer-empty">No streamers configured.</div>';
    return;
  }
  streamerList.innerHTML = streamers.map((s) => `
    <div class="streamer-row">
      <span class="streamer-dot"></span>
      <span class="streamer-handle">@${s.handle}</span>
    </div>
  `).join("");
}

function updateFlushStat(ms) {
  sbFlush.textContent = ms >= 1000 ? `${ms / 1000} s` : `${ms} ms`;
  sbFlush.className = "sb-val";
}

function updateStatusRow(apiUrl, streamers, flushMs) {
  // Server
  if (apiUrl) {
    try {
      sbServer.textContent = new URL(apiUrl).hostname;
      sbServer.className = "sb-val ok";
    } catch {
      sbServer.textContent = apiUrl;
      sbServer.className = "sb-val";
    }
  } else {
    sbServer.textContent = "—";
    sbServer.className = "sb-val";
  }

  // Streamers
  sbStreamers.textContent = streamers.length
    ? `${streamers.length} handle${streamers.length > 1 ? "s" : ""}`
    : "all streams";
  sbStreamers.className = "sb-val" + (streamers.length ? "" : "");

  // Flush
  updateFlushStat(flushMs);
}

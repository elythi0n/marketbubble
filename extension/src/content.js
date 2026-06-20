/**
 * Content script — injected into X livestream pages (world: MAIN so it can patch window APIs).
 *
 * Capture strategies (in priority order):
 *   1. WebSocket interception  — patches window.WebSocket for X/Periscope chat frames
 *   2. fetch() interception    — patches window.fetch for REST/GraphQL chat responses
 *   3. MutationObserver        — DOM fallback; reads rendered chat elements
 *
 * Only activates for streamers listed in /x.json on the configured server.
 * State is broadcast to the popup every flushMs so it can show live stats and warnings.
 */

(function () {
  "use strict";

  const MAX_BATCH = 50;
  const SCHEMA_WARN_AFTER_MS = 120_000;
  const SCHEMA_DRIFT_MS = 300_000;

  // ─── Runtime state ───────────────────────────────────────────────────────────

  let apiUrl = null;
  let apiKey = null;
  let flushMs = 1000;
  let streamers = [];
  let active = false;
  let flushTimer = null;
  let stateTimer = null;
  const pending = new Map(); // id → XChatMessage (pre-flush queue)

  const stats = {
    startedAt: null,
    messagesTotal: 0,
    lastMessageAt: null,
    strategies: { websocket: false, fetch: false, dom: false },
  };

  // ─── Settings & authorization ─────────────────────────────────────────────

  function loadSettings(callback) {
    chrome.runtime.sendMessage({ type: "GET_SETTINGS" }, (s) => {
      if (chrome.runtime.lastError || !s) return;
      apiUrl    = (s.apiUrl || "").replace(/\/$/, "");
      apiKey    = s.apiKey || "";
      flushMs   = s.flushMs || 1000;
      streamers = s.streamers || [];
      if (apiUrl && apiKey) callback();
    });
  }

  /**
   * Capture every open X livestream — no handle whitelist.
   *
   * The manifest only injects this script on broadcast and "/live" pages, so "always authorized"
   * means "any live X tab we're actually on". We dropped handle matching because broadcast URLs
   * carry no handle and the page
   * title can lead with a sponsor mention (e.g. "… Presented by @Polymarket"), both of which made
   * matching unreliable and left the bridge stuck on "Waiting for stream".
   */
  function isAuthorizedStream() {
    return true;
  }

  // ─── Message queuing ─────────────────────────────────────────────────────────

  function queueMessage(msg, strategy) {
    if (!msg || !msg.id || !msg.text) return;
    if (!pending.has(msg.id)) {
      pending.set(msg.id, msg);
      stats.strategies[strategy] = true;
      stats.lastMessageAt = Date.now();
    }
  }

  function generateId(prefix) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  // ─── Flush loop ──────────────────────────────────────────────────────────────

  async function flush() {
    if (!apiUrl || !apiKey || pending.size === 0) return;

    const batch = [...pending.values()].slice(0, MAX_BATCH);
    batch.forEach((m) => pending.delete(m.id));

    try {
      const res = await fetch(`${apiUrl}/api/x/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Api-Key": apiKey },
        body: JSON.stringify({ messages: batch }),
      });
      if (res.ok) {
        stats.messagesTotal += batch.length;
      } else {
        batch.forEach((m) => { if (!pending.has(m.id)) pending.set(m.id, m); });
      }
    } catch {
      batch.forEach((m) => { if (!pending.has(m.id)) pending.set(m.id, m); });
    }
  }

  // ─── State broadcast ─────────────────────────────────────────────────────────

  function broadcastState() {
    const now = Date.now();
    const elapsed = stats.startedAt ? now - stats.startedAt : 0;
    const neverCaptured = stats.messagesTotal === 0 && elapsed > SCHEMA_WARN_AFTER_MS;
    const drifted = stats.messagesTotal > 0 && stats.lastMessageAt !== null &&
      (now - stats.lastMessageAt) > SCHEMA_DRIFT_MS;

    chrome.runtime.sendMessage({
      type: "UPDATE_STATE",
      state: {
        active: true,
        pageUrl: window.location.href,
        messagesTotal: stats.messagesTotal,
        lastMessageAt: stats.lastMessageAt,
        strategies: { ...stats.strategies },
        schemaWarning: neverCaptured || drifted,
        schemaWarningReason: neverCaptured
          ? "No messages detected after 2 min. X may have updated their format."
          : drifted
          ? "No messages for 5 min. Stream may have ended or format changed."
          : null,
        startedAt: stats.startedAt,
        updatedAt: now,
      },
    }).catch(() => { /* background may not be ready */ });
  }

  // ─── Strategy 1: WebSocket interception ──────────────────────────────────────

  (function patchWebSocket() {
    const OrigWS = window.WebSocket;

    window.WebSocket = function (url, ...args) {
      const ws = new OrigWS(url, ...args);
      if (/chatman|pscp\.tv|broadcast|live\.twitter|live\.x\.com/i.test(url)) {
        ws.addEventListener("message", (ev) => {
          try { handleWSFrame(ev.data); } catch { /* ignore parse errors */ }
        });
      }
      return ws;
    };
    Object.setPrototypeOf(window.WebSocket, OrigWS);

    function handleWSFrame(data) {
      if (typeof data !== "string") return;
      const payload = JSON.parse(data);
      const chat = extractPeriscope(payload) || extractGeneric(payload);
      if (chat) queueMessage(chat, "websocket");
    }

    function extractPeriscope(p) {
      const chat = p?.body?.event?.chat;
      if (!chat?.body) return null;
      return {
        id: String(chat.id || generateId("ws")),
        authorHandle: String(chat.username || ""),
        authorName: String(chat.displayName || chat.username || ""),
        text: String(chat.body),
        timestamp: chat.timestamp ? new Date(chat.timestamp).toISOString() : new Date().toISOString(),
      };
    }

    function extractGeneric(p) {
      const candidates = [p, p?.data, p?.event, p?.message].filter(Boolean);
      for (const c of candidates) {
        const text = c.text || c.body || c.message;
        const handle = c.username || c.handle || c.author_handle;
        const name = c.displayName || c.display_name || c.name || handle;
        if (text && handle) {
          return {
            id: String(c.id || c.message_id || generateId("ws-generic")),
            authorHandle: String(handle),
            authorName: String(name || handle),
            text: String(text),
            timestamp: c.timestamp ? new Date(c.timestamp).toISOString() : new Date().toISOString(),
          };
        }
      }
      return null;
    }
  })();

  // ─── Strategy 2: fetch() interception ────────────────────────────────────────

  (function patchFetch() {
    const origFetch = window.fetch.bind(window);

    window.fetch = async function (input, init) {
      const res = await origFetch(input, init);
      const url = typeof input === "string" ? input : (input?.url ?? "");
      if (/\/graphql\/|\/1\.1\/|live_video_stream|chatnow/i.test(url)) {
        res.clone().json().then(handleFetchPayload).catch(() => { /* not JSON */ });
      }
      return res;
    };

    function handleFetchPayload(payload) {
      findChatItems(payload).forEach((msg) => queueMessage(msg, "fetch"));
    }

    function findChatItems(node, depth = 0) {
      if (depth > 8 || !node || typeof node !== "object") return [];
      const found = [];
      if (Array.isArray(node)) {
        for (const item of node) {
          const msg = tryChatItem(item);
          if (msg) found.push(msg);
          else found.push(...findChatItems(item, depth + 1));
        }
      } else {
        for (const val of Object.values(node)) {
          found.push(...findChatItems(val, depth + 1));
        }
      }
      return found;
    }

    function tryChatItem(item) {
      if (!item || typeof item !== "object") return null;
      const text = item.full_text || item.text || item.body;
      const handle = item.user?.screen_name || item.username || item.handle || item.author_handle;
      const name = item.user?.name || item.display_name || item.displayName || item.name || handle;
      if (!text || !handle || typeof text !== "string" || text.length > 2000) return null;
      return {
        id: String(item.id_str || item.id || item.message_id || generateId("fetch")),
        authorHandle: String(handle),
        authorName: String(name || handle),
        text,
        timestamp: item.created_at ? new Date(item.created_at).toISOString() : new Date().toISOString(),
      };
    }
  })();

  // ─── Strategy 3: MutationObserver DOM fallback ───────────────────────────────

  (function observeDOM() {
    const seen = new Set();

    function extractMessage(el) {
      const text = el.innerText?.trim();
      if (!text || text.length < 2 || text.length > 500) return null;
      const handleEl = el.querySelector("[data-testid='User-Name'] span, [href*='/'] span");
      const handle = handleEl?.textContent?.replace("@", "").trim() ||
        el.closest("[data-testid]")?.dataset?.testid || "";
      if (!handle) return null;
      const key = `${handle}:${text}`;
      if (seen.has(key)) return null;
      seen.add(key);
      return {
        id: generateId("dom"),
        authorHandle: handle,
        authorName: handle,
        text,
        timestamp: new Date().toISOString(),
      };
    }

    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;
          const msg = extractMessage(node);
          if (msg) queueMessage(msg, "dom");
        }
      }
    });

    function attach() {
      const container =
        document.querySelector('[data-testid="chatPane"]') ||
        document.querySelector('[aria-label*="Chat"]') ||
        document.body;
      observer.observe(container, { childList: true, subtree: true });
    }

    if (document.readyState === "complete") attach();
    else window.addEventListener("load", attach, { once: true });
  })();

  // ─── Activation ──────────────────────────────────────────────────────────────

  function activate() {
    if (active) return;

    // Check against the streamer whitelist. For broadcast pages the DOM may not be
    // ready yet, so retry a few times before giving up.
    function tryActivate(attemptsLeft) {
      if (isAuthorizedStream()) {
        active = true;
        stats.startedAt = Date.now();
        flushTimer = setInterval(flush, flushMs);
        stateTimer = setInterval(broadcastState, flushMs);
        broadcastState();
      } else if (attemptsLeft > 0) {
        setTimeout(() => tryActivate(attemptsLeft - 1), 2000);
      }
    }

    tryActivate(5);
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "START" || msg.type === "PING") loadSettings(activate);
  });

  loadSettings(activate);
})();

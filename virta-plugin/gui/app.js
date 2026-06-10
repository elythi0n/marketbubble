/*
 * MarketBubble control room — Virta plugin GUI.
 *
 * Sandboxed: this page makes no network calls itself (CSP blocks them). Everything goes through
 * the window.__virta postMessage bridge: config from the plugin's saved settings, HTTP via the
 * daemon's bridge, which enforces the manifest's declared endpoints.
 */
(function () {
  "use strict";
  var v = window.__virta;

  var cfg = { api_base_url: "https://marketbubble.virta.lol", api_key: "" };

  function base() {
    return String(cfg.api_base_url || "https://marketbubble.virta.lol").replace(/\/+$/, "");
  }

  function fetchJSON(path) {
    var headers = cfg.api_key ? { "x-api-key": cfg.api_key } : {};
    return v.send({ type: "http.fetch", payload: { url: base() + path, headers: headers } }).then(function (res) {
      if (!res || res.status >= 400) throw new Error("HTTP " + (res ? res.status : "?"));
      return JSON.parse(res.body);
    });
  }

  // ── tiny DOM helpers (textContent only — never innerHTML with remote data) ──
  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function fill(listEl, items) {
    listEl.textContent = "";
    items.forEach(function (i) { listEl.appendChild(i); });
    if (items.length === 0) listEl.appendChild(el("li", "muted", "Nothing yet"));
  }

  function setConn(ok, label) {
    var dot = document.getElementById("conn-dot");
    dot.className = "dot " + (ok === null ? "dot-wait" : ok ? "dot-ok" : "dot-err");
    document.getElementById("conn-label").textContent = label;
  }

  function fmtViewers(n) {
    return n >= 1000 ? (n / 1000).toFixed(1) + "K" : String(n);
  }

  // ── Show status: roster + per-platform live status ──────────────────────────
  function loadShow() {
    fetchJSON("/api/streamers")
      .then(function (roster) {
        if (!Array.isArray(roster) || roster.length === 0) throw new Error("empty roster");
        setConn(true, new URL(base()).host);
        return Promise.all(
          roster.map(function (s) {
            var twitch = s.handles && s.handles.twitch
              ? fetchJSON("/api/twitch/stream?login=" + encodeURIComponent(s.handles.twitch)).catch(function () { return null; })
              : Promise.resolve(null);
            var kick = s.handles && s.handles.kick
              ? fetchJSON("/api/kick/stream?slug=" + encodeURIComponent(s.handles.kick)).catch(function () { return null; })
              : Promise.resolve(null);
            return Promise.all([twitch, kick]).then(function (r) {
              var t = r[0], k = r[1];
              var live = !!((t && t.live) || (k && k.live));
              var viewers = ((t && t.live && t.viewerCount) || 0) + ((k && k.live && k.viewerCount) || 0);
              var title = (t && t.live && t.title) || (k && k.live && k.title) || (s.schedule && s.schedule.label) || "Offline";
              return { s: s, live: live, viewers: viewers, title: title };
            });
          })
        );
      })
      .then(function (rows) {
        rows.sort(function (a, b) { return Number(b.live) - Number(a.live) || b.viewers - a.viewers; });
        fill(
          document.getElementById("roster"),
          rows.map(function (row) {
            var li = el("li");
            li.appendChild(el("span", "dot " + (row.live ? "dot-ok" : "dot-wait")));
            var who = el("div", "who");
            var name = el("div", "name", row.s.name);
            (row.s.platforms || []).forEach(function (p) {
              name.appendChild(el("span", "plat plat-" + p, p));
            });
            who.appendChild(name);
            who.appendChild(el("div", "title", row.title));
            li.appendChild(who);
            li.appendChild(el("span", "viewers", row.live ? fmtViewers(row.viewers) + " watching" : ""));
            return li;
          })
        );
      })
      .catch(function (e) {
        setConn(false, e && e.message ? e.message : "unreachable");
        fill(document.getElementById("roster"), [el("li", "muted", "Couldn't reach the dashboard — check the URL in plugin settings.")]);
      });
  }

  // ── Top chatters (relay-backed leaderboard) ─────────────────────────────────
  function loadChatters() {
    fetchJSON("/api/leaderboard/chatters")
      .then(function (data) {
        var list = (data && data.chatters) || [];
        fill(
          document.getElementById("chatters"),
          list.slice(0, 10).map(function (c, i) {
            var li = el("li");
            li.appendChild(el("span", "rank rank-" + (i + 1), String(i + 1)));
            li.appendChild(el("span", "cname", c.name));
            li.appendChild(el("span", "plat plat-" + (c.platform || "x"), c.platform || "x"));
            li.appendChild(el("span", "count", String(c.count)));
            return li;
          })
        );
      })
      .catch(function () {
        fill(document.getElementById("chatters"), [el("li", "muted", "No tallies yet")]);
      });
  }

  // ── Polymarket predictions ──────────────────────────────────────────────────
  function loadPredictions() {
    fetchJSON("/api/markets/predictions")
      .then(function (rows) {
        fill(
          document.getElementById("predictions"),
          (rows || []).slice(0, 6).map(function (p) {
            var li = el("li");
            var q = el("div", "q");
            q.appendChild(el("span", null, p.question));
            q.appendChild(el("span", "pct", p.yesPercent + "%"));
            li.appendChild(q);
            var bar = el("div", "bar");
            var inner = el("span");
            inner.style.width = Math.max(0, Math.min(100, p.yesPercent)) + "%";
            bar.appendChild(inner);
            li.appendChild(bar);
            return li;
          })
        );
      })
      .catch(function () {
        fill(document.getElementById("predictions"), [el("li", "muted", "Predictions unavailable")]);
      });
  }

  // ── Live X chat feed ────────────────────────────────────────────────────────
  function loadXChat() {
    fetchJSON("/api/x/chat")
      .then(function (messages) {
        var list = (messages || []).slice(-25);
        var ul = document.getElementById("xchat");
        var stick = ul.scrollHeight - ul.scrollTop - ul.clientHeight < 40;
        fill(
          ul,
          list.map(function (m) {
            var li = el("li");
            li.appendChild(el("span", "author", m.authorName || m.authorHandle || "anon"));
            if (m.authorHandle) li.appendChild(el("span", "handle", "@" + m.authorHandle));
            li.appendChild(el("span", null, m.text || ""));
            return li;
          })
        );
        if (stick) ul.scrollTop = ul.scrollHeight;
        document.getElementById("x-live-tag").style.display = list.length > 0 ? "" : "none";
      })
      .catch(function () {
        fill(document.getElementById("xchat"), [el("li", "muted", "X chat bridge idle")]);
      });
  }

  // ── boot ────────────────────────────────────────────────────────────────────
  function start() {
    loadShow();
    loadChatters();
    loadPredictions();
    loadXChat();
    setInterval(loadShow, 30000);
    setInterval(loadChatters, 60000);
    setInterval(loadPredictions, 120000);
    setInterval(loadXChat, 5000);
  }

  v.send({ type: "config.get" })
    .then(function (saved) {
      if (saved && typeof saved === "object") {
        if (saved.api_base_url) cfg.api_base_url = saved.api_base_url;
        if (saved.api_key) cfg.api_key = saved.api_key;
      }
    })
    .catch(function () { /* defaults are fine */ })
    .then(start);
})();

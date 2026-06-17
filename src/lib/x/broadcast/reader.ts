/**
 * Reads the live chat of a single X broadcast over the same chatman WebSocket the X web player uses.
 *
 * The flow is entirely anonymous and read-only (a logged-out browser does exactly this):
 *   broadcasts/show          -> is it RUNNING? + media_key, title, occupancy
 *   live_video_stream/status -> chatToken
 *   accessChatPublic         -> ws endpoint + per-broadcast read-only token + room id
 *   wss .../chatapi/v1/chatnow:
 *       send  AUTH      { kind: 3, payload: {"access_token": ...} }
 *       send  SUBSCRIBE { kind: 2, payload: {"kind":1,"body":{"room": ...}} }
 *       recv  frames    inner kind 1 = chat (text), inner kind 4 = occupancy
 *
 * One reader owns one broadcast. It reconnects through transient socket drops on its own; when the
 * broadcast actually ends (or was never live) it reports `ended` and stops, leaving rediscovery to
 * the manager above it.
 */

import { guestHeaders, guestToken, X_USER_AGENT } from "./guest";

export interface BroadcastChatMessage {
  /** Stable id for dedup (chat frame uuid, or a synthesised fallback). */
  id: string;
  user: string;
  text: string;
  /** Epoch ms. */
  ts: number;
}

export type ReaderState = "resolving" | "live" | "ended" | "error" | "stopped";

export interface ReaderHooks {
  onMessage(msg: BroadcastChatMessage): void;
  onState?(state: ReaderState): void;
  onMeta?(meta: { title?: string; occupancy?: number; broadcaster?: string }): void;
  log?(line: string): void;
}

interface ChatCredentials {
  socketUrl: string;
  accessToken: string;
  roomId: string;
}

interface BroadcastInfo {
  state?: string;
  media_key?: string;
  twitter_username?: string;
  user_display_name?: string;
  username?: string;
  total_watching?: string;
  status?: string;
}
interface ShowResponse {
  broadcasts?: Record<string, BroadcastInfo | undefined>;
}
interface StreamStatusResponse {
  chatToken?: string;
}
interface AccessResponse {
  endpoint?: string;
  access_token?: string;
  room_id?: string;
}

/** Outer chatman frame; payload is a JSON string carrying the inner frame. */
interface Frame {
  payload?: unknown;
}
interface InnerFrame {
  body?: unknown;
  sender?: { username?: string; display_name?: string; user_id?: string };
}
interface ChatBody {
  body?: string;
  text?: string;
  username?: string;
  displayName?: string;
  uuid?: string;
  timestamp?: string | number;
  occupancy?: number;
}

const PUBLIC_ACCESS_CHAT = "https://proxsee.pscp.tv/api/v2/accessChatPublic";
const MAX_BACKOFF_MS = 15_000;
const SEEN_CAP = 4_000;

/**
 * Health-poll cadence. A chatty broadcast emits chat AND occupancy frames continuously, so we don't
 * touch X's HTTP surface in steady state. After SILENCE_THRESHOLD_MS of no frames we run a single
 * show.json check — at most one HTTP call per HEALTH_CHECK_MS while a broadcast is genuinely quiet.
 * This catches the edge case where the broadcast ends but the socket stays open.
 *
 * Opt-in via X_BROADCAST_HEALTH_POLL=1 — when disabled (the default), end-detection falls back to
 * socket close. The poll uses the same guest-token flow as discovery (no paid X API key), but it
 * still costs outbound HTTP to X, so operators choose whether the belt-and-suspenders is worth it.
 */
const HEALTH_CHECK_MS = 30_000;
const SILENCE_THRESHOLD_MS = 90_000;
const HEALTH_POLL_ENABLED = process.env.X_BROADCAST_HEALTH_POLL === "1";

export class XBroadcastReader {
  readonly broadcastId: string;
  private readonly hooks: ReaderHooks;

  private socket: WebSocket | null = null;
  private state: ReaderState = "resolving";
  private stopped = false;
  private backoff = 1_000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private healthTimer: ReturnType<typeof setInterval> | null = null;
  private lastFrameAt = 0;
  private readonly seen = new Set<string>();
  private broadcaster?: string;

  constructor(broadcastId: string, hooks: ReaderHooks) {
    this.broadcastId = broadcastId;
    this.hooks = hooks;
  }

  /** Resolve credentials and open the chat socket. Resolves once the first connection attempt is made. */
  async start(): Promise<void> {
    this.stopped = false;
    await this.connect();
  }

  stop(): void {
    this.stopped = true;
    this.clearReconnect();
    this.clearHealthCheck();
    this.closeSocket();
    this.setState("stopped");
  }

  isLive(): boolean {
    return this.state === "live";
  }

  // --- lifecycle ---------------------------------------------------------------

  private async connect(): Promise<void> {
    if (this.stopped) return;
    this.setState("resolving");
    let creds: ChatCredentials | null;
    try {
      creds = await this.resolveCredentials();
    } catch (err) {
      this.log(`resolve failed: ${(err as Error).message}`);
      this.scheduleReconnect();
      return;
    }
    if (this.stopped) return;
    if (!creds) {
      // broadcasts/show said it isn't RUNNING — the broadcast is over (or never started).
      this.setState("ended");
      return;
    }
    this.openSocket(creds);
  }

  private scheduleReconnect(refreshGuest = false): void {
    if (this.stopped) return;
    this.setState("error");
    const wait = this.backoff;
    this.backoff = Math.min(wait * 2, MAX_BACKOFF_MS);
    this.clearReconnect();
    this.reconnectTimer = setTimeout(() => {
      if (refreshGuest) void guestToken(true);
      void this.connect();
    }, wait);
  }

  private clearReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  // --- credential resolution (HTTP) -------------------------------------------

  private async resolveCredentials(): Promise<ChatCredentials | null> {
    const token = await guestToken();
    const headers = guestHeaders(token);

    const show = await this.json<ShowResponse>(
      `https://api.x.com/1.1/broadcasts/show.json?ids=${this.broadcastId}`,
      { headers },
    );
    const b = show.broadcasts?.[this.broadcastId];
    if (!b) throw new Error("broadcast not found");

    this.broadcaster = b.twitter_username || b.user_display_name || b.username || undefined;
    const occupancy = Number.parseInt(b.total_watching ?? "", 10);
    this.hooks.onMeta?.({
      title: b.status || undefined,
      broadcaster: this.broadcaster,
      occupancy: Number.isFinite(occupancy) ? occupancy : undefined,
    });

    if (b.state && b.state !== "RUNNING") return null;

    const status = await this.json<StreamStatusResponse>(
      `https://api.x.com/1.1/live_video_stream/status/${b.media_key}?client=web`,
      { headers },
    );
    if (!status.chatToken) throw new Error("no chat token");

    const access = await this.json<AccessResponse>(PUBLIC_ACCESS_CHAT, {
      method: "POST",
      headers: { "content-type": "application/json", "User-Agent": X_USER_AGENT },
      body: JSON.stringify({ chat_token: status.chatToken }),
    });
    if (!access.endpoint || !access.access_token || !access.room_id) {
      throw new Error("no chat access");
    }

    return {
      socketUrl: `${access.endpoint.replace(/^https/, "wss")}/chatapi/v1/chatnow`,
      accessToken: access.access_token,
      roomId: access.room_id,
    };
  }

  // --- chat socket -------------------------------------------------------------

  private openSocket(creds: ChatCredentials): void {
    let socket: WebSocket;
    try {
      socket = new WebSocket(creds.socketUrl);
    } catch (err) {
      this.log(`socket open failed: ${(err as Error).message}`);
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;

    socket.addEventListener("open", () => {
      this.backoff = 1_000;
      this.send(socket, { kind: 3, payload: JSON.stringify({ access_token: creds.accessToken }) });
      this.send(socket, {
        kind: 2,
        payload: JSON.stringify({ kind: 1, body: JSON.stringify({ room: creds.roomId }) }),
      });
      this.setState("live");
      this.lastFrameAt = Date.now();
      this.startHealthCheck();
      this.log("chat connected");
    });

    socket.addEventListener("message", (ev) => {
      this.lastFrameAt = Date.now();
      this.handleFrame(typeof ev.data === "string" ? ev.data : String(ev.data));
    });

    socket.addEventListener("close", () => {
      if (this.socket === socket) this.socket = null;
      this.clearHealthCheck();
      if (!this.stopped) this.scheduleReconnect(true);
    });

    socket.addEventListener("error", () => {
      try {
        socket.close();
      } catch {
        /* already closing */
      }
    });
  }

  private send(socket: WebSocket, frame: { kind: number; payload: string }): void {
    try {
      socket.send(JSON.stringify(frame));
    } catch {
      /* socket closing */
    }
  }

  private handleFrame(raw: string): void {
    const payload = safeJson<Frame>(raw)?.payload;
    const inner = typeof payload === "string" ? safeJson<InnerFrame>(payload) : null;
    if (!inner) return;

    const body = typeof inner.body === "string" ? safeJson<ChatBody>(inner.body) : null;

    if (body && typeof body.occupancy === "number") {
      this.hooks.onMeta?.({ occupancy: body.occupancy, broadcaster: this.broadcaster });
    }

    const text: unknown = body?.body ?? body?.text;
    if (typeof text !== "string" || !text) return;

    const sender = inner.sender ?? {};
    const user =
      body?.username || body?.displayName || sender.username || sender.display_name || "guest";
    const id = body?.uuid || `${sender.user_id ?? ""}:${body?.timestamp ?? ""}:${text}`;
    if (this.seen.has(id)) return;
    this.seen.add(id);
    if (this.seen.size > SEEN_CAP) this.seen.clear();

    this.hooks.onMessage({ id, user: String(user), text, ts: Date.now() });
  }

  // --- helpers -----------------------------------------------------------------

  private async json<T>(url: string, init: RequestInit): Promise<T> {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`${url.split("?")[0]} -> ${res.status}`);
    return res.json() as Promise<T>;
  }

  private closeSocket(): void {
    if (this.socket) {
      try {
        this.socket.close();
      } catch {
        /* ignore */
      }
      this.socket = null;
    }
  }

  // --- silence-triggered health check ----------------------------------------
  // Only spends an HTTP call when the socket has gone quiet — chatty streams cost zero polls.

  private startHealthCheck(): void {
    this.clearHealthCheck();
    if (!HEALTH_POLL_ENABLED) return; // opt-in via X_BROADCAST_HEALTH_POLL=1
    this.healthTimer = setInterval(() => {
      void this.runHealthCheck();
    }, HEALTH_CHECK_MS);
  }

  private clearHealthCheck(): void {
    if (this.healthTimer) {
      clearInterval(this.healthTimer);
      this.healthTimer = null;
    }
  }

  /**
   * Catches the edge case where X holds the WebSocket open after a broadcast ends but stops
   * emitting frames. Skips outright when the socket has been emitting (chat or occupancy)
   * in the last SILENCE_THRESHOLD_MS, so we never poll X during normal operation.
   */
  private async runHealthCheck(): Promise<void> {
    if (this.stopped || !this.socket) return;
    if (Date.now() - this.lastFrameAt < SILENCE_THRESHOLD_MS) return;

    try {
      const token = await guestToken();
      const res = await fetch(
        `https://api.x.com/1.1/broadcasts/show.json?ids=${this.broadcastId}`,
        { headers: guestHeaders(token), signal: AbortSignal.timeout(10_000) },
      );
      if (!res.ok) return; // transient failure → try again next tick
      const json = (await res.json()) as ShowResponse;
      const b = json.broadcasts?.[this.broadcastId];
      if (!b) return;
      if (b.state && b.state !== "RUNNING") {
        this.log(`silence + state=${b.state} → ended`);
        this.clearHealthCheck();
        this.closeSocket();
        this.setState("ended");
        return;
      }
      // Still RUNNING but quiet — refresh occupancy/title and bump the silence window so we
      // don't poll again immediately if X keeps holding the socket open without frames.
      const occupancy = Number.parseInt(b.total_watching ?? "", 10);
      this.hooks.onMeta?.({
        title: b.status || undefined,
        broadcaster: this.broadcaster,
        occupancy: Number.isFinite(occupancy) ? occupancy : undefined,
      });
      this.lastFrameAt = Date.now();
    } catch {
      /* network blip — pretend it didn't happen */
    }
  }

  private setState(state: ReaderState): void {
    if (state === this.state) return;
    this.state = state;
    this.hooks.onState?.(state);
  }

  private log(line: string): void {
    this.hooks.log?.(`[x:${this.broadcastId}] ${line}`);
  }
}

function safeJson<T = unknown>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

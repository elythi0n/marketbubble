import { type NextRequest, NextResponse } from "next/server";

import {
  AI_ENABLED,
  ANTHROPIC_URL,
  MODEL_PATTERN,
  OPENAI_COMPAT_URL,
  PROVIDERS,
  type AssistantProvider,
} from "@/lib/assistant/config";
import { serverProviderKey } from "../keys";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 256 * 1024;
const MAX_OUTPUT_TOKENS = 16000;

// ── Per-chatter limits ────────────────────────────────────────────────────────
// Keyed by client IP (no auth system exists; the dashboard is public). In-memory: fine for the
// single-process standalone/Docker deploy; resets on restart, not shared across serverless
// instances. Tune via ASSISTANT_RPM / ASSISTANT_RPD.
const RPM = Number(process.env.ASSISTANT_RPM || 5);
const RPD = Number(process.env.ASSISTANT_RPD || 50);

interface Quota {
  minuteStart: number;
  minuteCount: number;
  dayStart: number;
  dayCount: number;
}

const quotas = new Map<string, Quota>();

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
}

/** Returns an error message when over a limit, null when the request is allowed (and counted). */
function checkLimits(ip: string): string | null {
  const now = Date.now();
  let q = quotas.get(ip);
  if (!q) {
    q = { minuteStart: now, minuteCount: 0, dayStart: now, dayCount: 0 };
    quotas.set(ip, q);
    // Opportunistic cleanup so the map can't grow unbounded.
    if (quotas.size > 10_000) {
      for (const [k, v] of quotas) if (now - v.dayStart > 86_400_000) quotas.delete(k);
    }
  }
  if (now - q.minuteStart >= 60_000) {
    q.minuteStart = now;
    q.minuteCount = 0;
  }
  if (now - q.dayStart >= 86_400_000) {
    q.dayStart = now;
    q.dayCount = 0;
  }
  if (q.dayCount >= RPD) return `Daily limit reached (${RPD} questions/day). Try again tomorrow or use your own API key.`;
  if (q.minuteCount >= RPM) {
    const wait = Math.ceil((60_000 - (now - q.minuteStart)) / 1000);
    return `Slow down — ${RPM} questions/minute. Try again in ${wait}s.`;
  }
  q.minuteCount += 1;
  q.dayCount += 1;
  return null;
}

function errorJson(message: string, status: number) {
  // Provider-shaped error body so the client surfaces it like any upstream error.
  return NextResponse.json({ error: { message } }, { status });
}

/** Model listing for server-configured providers (?list=models). Booleans-and-ids only. */
export async function GET(req: NextRequest) {
  if (!AI_ENABLED) return new NextResponse(null, { status: 404 });
  if (req.nextUrl.searchParams.get("list") !== "models") return errorJson("unknown request", 400);

  const provider = req.nextUrl.searchParams.get("provider") as AssistantProvider | null;
  if (!provider || !PROVIDERS.includes(provider)) return errorJson("unknown provider", 400);
  const key = serverProviderKey(provider);
  if (!key) return errorJson(`${provider} is not configured on this server`, 403);

  const upstream =
    provider === "anthropic"
      ? await fetch(`${ANTHROPIC_URL.replace("/messages", "/models")}?limit=100`, {
          headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
          next: { revalidate: 3600 },
        })
      : await fetch(OPENAI_COMPAT_URL[provider].replace("/chat/completions", "/models"), {
          headers: { Authorization: `Bearer ${key}` },
          next: { revalidate: 3600 },
        });
  if (!upstream.ok) return errorJson("model list unavailable", 502);

  const json = (await upstream.json()) as { data?: { id?: string; display_name?: string; name?: string }[] };
  // Strip everything except id/label fields before it leaves the server.
  const data = (json.data ?? []).map((m) => ({ id: m.id, display_name: m.display_name, name: m.name }));
  return NextResponse.json({ data }, { headers: { "Cache-Control": "public, max-age=3600" } });
}

/**
 * Streaming proxy for server-configured providers. The browser sends the full request body
 * (system, messages, tools — all built client-side); this route only attaches the secret key and
 * pipes the SSE stream back. Keys never reach the client; chatters are rate-limited per IP.
 */
export async function POST(req: NextRequest) {
  if (!AI_ENABLED) return new NextResponse(null, { status: 404 });

  const provider = req.nextUrl.searchParams.get("provider") as AssistantProvider | null;
  if (!provider || !PROVIDERS.includes(provider)) return errorJson("unknown provider", 400);

  const key = serverProviderKey(provider);
  if (!key) return errorJson(`${provider} is not configured on this server`, 403);

  const limited = checkLimits(clientIp(req));
  if (limited) return errorJson(limited, 429);

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return errorJson("request too large", 413);
  let body: { model?: string; stream?: boolean; max_tokens?: number; max_completion_tokens?: number };
  try {
    body = JSON.parse(raw);
  } catch {
    return errorJson("invalid JSON", 400);
  }

  // The proxy serves only this app's assistant: plausible chat models, streaming, capped output.
  if (!body.model || !MODEL_PATTERN[provider].test(body.model)) return errorJson("model not allowed", 400);
  if (body.stream !== true) return errorJson("stream required", 400);
  if ((body.max_tokens ?? 0) > MAX_OUTPUT_TOKENS || (body.max_completion_tokens ?? 0) > MAX_OUTPUT_TOKENS) {
    return errorJson("max_tokens too large", 400);
  }

  const upstream =
    provider === "anthropic"
      ? await fetch(ANTHROPIC_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": key,
            "anthropic-version": "2023-06-01",
          },
          body: raw,
          signal: req.signal,
        })
      : await fetch(OPENAI_COMPAT_URL[provider], {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
            ...(provider === "openrouter" ? { "X-Title": "MarketBubble" } : {}),
          },
          body: raw,
          signal: req.signal,
        });

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "text/event-stream",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}

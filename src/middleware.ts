/**
 * Per-IP rate limit for /api/admin/*. Sits in front of the constant-time key check in
 * each route handler — that protects against timing attacks; this protects against the
 * dumb-but-effective brute-force-the-key attack (lots of attempts cheaply).
 *
 * Token bucket: 60 burst + 2/sec refill. Comfortable for a legit admin session (dashboard
 * load + ~3s polling) while making sustained guessing painfully slow.
 *
 * Caveat: the bucket map is in-process. Multi-instance hosts (Vercel, Render scale-up)
 * each keep their own buckets, so the effective rate is per-IP-per-instance, not strictly
 * global. Good enough — and combined with the constant-time compare against a
 * cryptographically random ADMIN_API_KEY, brute force is infeasible either way.
 */

import { NextResponse, type NextRequest } from "next/server";

// Run under Node, not Edge — instrumentation.ts (auto-included in the middleware bundle by
// Next) imports node:sqlite/node:child_process which the Edge runtime can't handle.
export const runtime = "nodejs";

const CAPACITY = 60;
const REFILL_PER_SEC = 2;
const PRUNE_AFTER_MS = 5 * 60_000;

interface Bucket {
  tokens: number;
  lastRefill: number;
}

const buckets = new Map<string, Bucket>();

function clientIp(req: NextRequest): string {
  // x-forwarded-for is a comma-separated list left-to-right; the first entry is the
  // originating client (everything after is intermediate proxies).
  //
  // Trust model: this assumes the app sits behind a proxy that strips any client-supplied
  // x-forwarded-for / x-real-ip and writes its own. Vercel, Render, Railway, Coolify, and
  // Cloudflare all do this. If you deploy directly to the internet with no fronting proxy,
  // a client can spoof these headers to evade the rate limit — front the app with Caddy /
  // nginx / Cloudflare in that case (or fall back to remoteAddress, which Next doesn't
  // expose on NextRequest).
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0].trim();
    if (first) return first;
  }
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}

export function middleware(req: NextRequest) {
  const ip = clientIp(req);
  const now = Date.now();

  let bucket = buckets.get(ip);
  if (!bucket) {
    bucket = { tokens: CAPACITY, lastRefill: now };
    buckets.set(ip, bucket);
  } else {
    const elapsedSec = Math.max(0, (now - bucket.lastRefill) / 1000);
    bucket.tokens = Math.min(CAPACITY, bucket.tokens + elapsedSec * REFILL_PER_SEC);
    bucket.lastRefill = now;
  }

  // Probabilistic prune so the map can't grow unbounded under a flood of unique IPs.
  if (Math.random() < 0.01) {
    for (const [k, v] of buckets) {
      if (now - v.lastRefill > PRUNE_AFTER_MS) buckets.delete(k);
    }
  }

  if (bucket.tokens < 1) {
    return new NextResponse(JSON.stringify({ error: "rate limited" }), {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(Math.ceil((1 - bucket.tokens) / REFILL_PER_SEC)),
      },
    });
  }

  bucket.tokens -= 1;
  return NextResponse.next();
}

export const config = {
  matcher: ["/api/admin/:path*"],
};

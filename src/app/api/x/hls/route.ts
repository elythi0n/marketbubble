import { type NextRequest, NextResponse } from "next/server";

import { X_USER_AGENT } from "@/lib/x/broadcast/guest";

export const dynamic = "force-dynamic";

/**
 * HLS reverse-proxy for X broadcasts. The Periscope/X video CDN rejects browser Origins (403), so
 * the player can't hit it directly — it loads `/api/x/hls?url=<master .m3u8>` (same-origin) and we
 * fetch server-side (no Origin) and stream it back. Playlists are rewritten so every variant /
 * segment / key URL routes through this same proxy.
 *
 * SSRF guard: only X's video hosts may be proxied — never an arbitrary URL.
 */
function allowedHost(host: string): boolean {
  return /(^|\.)pscp\.tv$/i.test(host) || /(^|\.)video\.twimg\.com$/i.test(host);
}

function rewritePlaylist(text: string, baseUrl: string): string {
  const proxied = (u: string): string => {
    try {
      return `/api/x/hls?url=${encodeURIComponent(new URL(u, baseUrl).toString())}`;
    } catch {
      return u;
    }
  };
  return text
    .split("\n")
    .map((line) => {
      const t = line.trim();
      if (t === "") return line;
      // Tag lines: rewrite any URI="..." (EXT-X-KEY / EXT-X-MAP / EXT-X-MEDIA, …).
      if (t.startsWith("#")) return line.replace(/URI="([^"]+)"/g, (_m, u) => `URI="${proxied(u)}"`);
      // Resource line: a variant playlist or a media segment.
      return proxied(t);
    })
    .join("\n");
}

export async function GET(req: NextRequest) {
  const target = req.nextUrl.searchParams.get("url");
  if (!target) return NextResponse.json({ error: "missing url" }, { status: 400 });

  let u: URL;
  try {
    u = new URL(target);
  } catch {
    return NextResponse.json({ error: "bad url" }, { status: 400 });
  }
  if (u.protocol !== "https:" || !allowedHost(u.hostname)) {
    return NextResponse.json({ error: "host not allowed" }, { status: 403 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(u, { headers: { "User-Agent": X_USER_AGENT }, signal: AbortSignal.timeout(15_000) });
  } catch {
    return NextResponse.json({ error: "upstream fetch failed" }, { status: 502 });
  }
  if (!upstream.ok) return new NextResponse(null, { status: upstream.status });

  const ct = upstream.headers.get("content-type") ?? "";
  const isPlaylist = u.pathname.endsWith(".m3u8") || ct.includes("mpegurl");

  if (isPlaylist) {
    const body = rewritePlaylist(await upstream.text(), u.toString());
    return new NextResponse(body, {
      headers: {
        "content-type": "application/vnd.apple.mpegurl",
        "access-control-allow-origin": "*",
        "cache-control": "no-store",
      },
    });
  }

  // Media segment / init / key — stream the bytes straight through.
  return new NextResponse(upstream.body, {
    status: 200,
    headers: {
      "content-type": ct || "application/octet-stream",
      "access-control-allow-origin": "*",
      "cache-control": "public, max-age=5",
    },
  });
}

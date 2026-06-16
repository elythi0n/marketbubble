"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import { Feed } from "@/components/feed/feed";
import { createKickProvider } from "@/lib/chat/providers/kick-pusher";
import { createTwitchIRCProvider } from "@/lib/chat/providers/twitch-irc";
import { createXChatProvider } from "@/lib/chat/providers/x-chat";
import type { ChatProvider } from "@/lib/chat/provider";
import { useFeed } from "@/lib/chat/use-feed";
import { DEMO_ENABLED } from "@/lib/demo-mode-context";
import { DEMO_STREAMERS } from "@/lib/streamers/demo";
import { MOCK_STREAMERS, type Streamer } from "@/lib/streamers/mock";
import { useStreamers } from "@/lib/streamers/use-streamers";
import { usePinDark } from "@/lib/theme/use-pin-dark";

/**
 * Zero-install OBS overlay: a bare chat feed with no chrome, meant for a browser source.
 *
 * Query params:
 *   channel=<id>        one roster channel (default: every roster channel, merged)
 *   scale=<0.8–2.5>     font scale (default 1.2)
 *   ts=0                hide timestamps
 *   bg=transparent      transparent background for OBS (default: graphite, for previewing in a tab)
 *   demo=1              use the demo roster (busy channels) instead of the show roster
 */
function Overlay() {
  usePinDark();
  const params = useSearchParams();
  const channelId = params.get("channel");
  const scale = Math.min(2.5, Math.max(0.8, Number(params.get("scale")) || 1.2));
  const showTimestamps = params.get("ts") !== "0";
  const bg = params.get("bg") ?? "dark";
  // Demo roster only exists in demo-enabled builds; live-only builds ignore the param entirely.
  const demo = DEMO_ENABLED && params.get("demo") === "1";

  // Same roster source as the dashboard: bundled fallback, then the configured roster.
  const [roster, setRoster] = useState<Streamer[]>(MOCK_STREAMERS);
  useEffect(() => {
    if (demo) return;
    fetch("/api/streamers")
      .then((r) => r.json())
      .then((data: Streamer[]) => {
        if (Array.isArray(data) && data.length > 0) setRoster(data);
      })
      .catch(() => {});
  }, [demo]);
  const { streamers } = useStreamers(demo ? DEMO_STREAMERS : roster);

  // OBS browser sources composite transparency; page backgrounds must go fully clear.
  useEffect(() => {
    if (bg !== "transparent") return;
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
    return () => {
      document.documentElement.style.background = "";
      document.body.style.background = "";
    };
  }, [bg]);

  // Join every source channel regardless of live status — offline channels are just silent, and
  // chat starts flowing the moment they go live. (Filtering to live-only made the overlay blank
  // whenever the roster was offline.)
  const selected = channelId ? streamers.find((s) => s.id === channelId) : undefined;
  const sources = selected ? [selected] : streamers;
  const merged = !selected;

  const sourceKey = sources.map((s) => s.id).sort().join(",");
  const makeProviders = useMemo(
    () => () => {
      const providers: ChatProvider[] = sources.flatMap((s) => [
        ...(s.handles.twitch ? [createTwitchIRCProvider({ channel: s.handles.twitch })] : []),
        ...(s.handles.kick ? [createKickProvider({ slug: s.handles.kick })] : []),
      ]);
      if (!demo) providers.push(createXChatProvider());
      return providers;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sourceKey],
  );
  const { messages } = useFeed(makeProviders, sourceKey);

  return (
    <div
      className="overlay-root flex h-dvh flex-col overflow-hidden"
      style={{ background: bg === "transparent" ? "transparent" : bg === "dark" ? "#141416" : bg }}
    >
      <Feed
        messages={messages}
        showSource={merged}
        showTimestamps={showTimestamps}
        scale={scale}
        // Visible hint when previewing in a tab; fully silent on a transparent OBS source.
        emptyLabel={bg === "transparent" ? "" : "Waiting for chat…"}
        emptySubtext={
          bg === "transparent"
            ? ""
            : DEMO_ENABLED
              ? "Messages appear as people chat (try ?demo=1 for busy channels)"
              : "Messages appear as people chat"
        }
      />
    </div>
  );
}

export default function OverlayPage() {
  return (
    <Suspense fallback={null}>
      <Overlay />
    </Suspense>
  );
}

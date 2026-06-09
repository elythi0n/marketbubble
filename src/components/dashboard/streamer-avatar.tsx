"use client";

import { useState } from "react";

import { PlatformGlyph } from "@/components/feed/platform-glyph";
import { avatarUrl, primaryPlatform, type Streamer } from "@/lib/streamers/mock";
import { cn } from "@/lib/utils";

function initials(name: string): string {
  const parts = name.replace(/[^a-z0-9 ]/gi, "").trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

interface Props {
  streamer: Streamer;
  size?: number;
  rounded?: "full" | "lg";
  badge?: boolean;
  showLive?: boolean;
  dim?: boolean;
}

/** Profile picture (from the platform via unavatar) with an initials fallback, platform badge, and live dot. */
export function StreamerAvatar({ streamer, size = 30, rounded = "full", badge = true, showLive = true, dim = true }: Props) {
  const [errored, setErrored] = useState(false);
  const url = avatarUrl(streamer);
  const radius = rounded === "lg" ? "rounded-[20%]" : "rounded-full";

  return (
    <span
      className={cn("relative shrink-0", dim && !streamer.live && "opacity-50 grayscale")}
      style={{ width: size, height: size }}
    >
      {url && !errored ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={streamer.name}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setErrored(true)}
          className={cn("size-full border border-white/10 object-cover", radius)}
        />
      ) : (
        <span
          className={cn(
            "flex size-full items-center justify-center border border-white/10 bg-white/[0.06] font-semibold text-foreground/85",
            radius,
          )}
          style={{ fontSize: size * 0.34 }}
        >
          {initials(streamer.name)}
        </span>
      )}
      {badge ? (
        <span className="absolute -bottom-0.5 -right-0.5 flex size-[14px] items-center justify-center rounded-full bg-[#161619]">
          <PlatformGlyph platform={primaryPlatform(streamer)} className="size-[9px]" />
        </span>
      ) : null}
      {showLive && streamer.live ? (
        <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full border-2 border-[#161619] bg-[#46c45a]" />
      ) : null}
    </span>
  );
}

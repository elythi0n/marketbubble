import type { CSSProperties } from "react";

import type { Platform } from "@/lib/feed/types";

const COLOR: Record<Platform, string> = {
  twitch: "var(--plat-twitch)",
  kick: "var(--plat-kick)",
  x: "var(--plat-x)",
};

interface GlyphProps {
  platform: Platform;
  className?: string;
  /** When false, render in currentColor instead of the platform brand color. */
  tinted?: boolean;
  title?: string;
}

/** Brand glyph for a platform, drawn in the platform accent color (small-accent use only). */
export function PlatformGlyph({ platform, className, tinted = true, title }: GlyphProps) {
  const style: CSSProperties | undefined = tinted ? { color: COLOR[platform] } : undefined;
  const common = { className, style, fill: "currentColor", role: title ? "img" : "presentation" } as const;

  switch (platform) {
    case "twitch":
      return (
        <svg viewBox="31.28 -0.01 449.33 512" aria-hidden={!title} {...common}>
          {title ? <title>{title}</title> : null}
          <g transform="matrix(1.33333 0 0 -1.33333 -180.534 935.798)">
            <g transform="translate(420.064 651.157)">
              <path d="M44.5-153.1-10.4-208h-86.2l-47-47v47h-70.5V19.3H44.5zm-290 203.8L-261.2-12v-282.1h70.5v-39.2h39.2l39.2 39.2h62.7L75.8-168.7V50.7z" />
            </g>
            <path d="M292.1 513.8h31.3v94.1h-31.3zm86.2 0h31.3v94.1h-31.3z" />
          </g>
        </svg>
      );
    case "kick":
      return (
        <svg viewBox="216 216 1107 1107" aria-hidden={!title} {...common}>
          {title ? <title>{title}</title> : null}
          <path
            fillRule="evenodd"
            d="M278.26 216.86H646.7v245.62h122.81V339.67h122.81V216.86h368.43v368.43h-122.81V708.1h-122.81v122.81h122.81v122.81h122.81v368.44H892.32v-122.81H769.51v-122.81H646.7v245.62H278.26z"
          />
        </svg>
      );
    case "x":
      return (
        <svg viewBox="0 0 512 512" aria-hidden={!title} {...common}>
          {title ? <title>{title}</title> : null}
          <path d="M304.7 216.8 495.2 0h-45.1L284.6 188.2 152.6 0H.2l199.7 284.7L.2 512h45.1L220 313.2 359.4 512h152.3M61.6 33.3h69.3l319.1 447h-69.3" />
        </svg>
      );
  }
}

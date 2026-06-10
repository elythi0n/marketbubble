import { ImageResponse } from "next/og";

import { LOGO_PATHS } from "@/components/dashboard/market-bubble-logo";

export const alt = "MarketBubble: Twitch, Kick and X chat unified into one live dashboard";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Social/OG card: lettermark on the graphite floor with the platform lockup. */
export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#141416",
          backgroundImage: "radial-gradient(90% 70% at 50% 0%, rgba(255,255,255,0.07), rgba(20,20,22,0) 65%)",
        }}
      >
        <svg width="340" height="340" viewBox="0 0 400 400" fill="#ededed">
          {LOGO_PATHS.map((d) => (
            <path key={d} d={d} />
          ))}
        </svg>
        <div
          style={{
            display: "flex",
            marginTop: 6,
            fontSize: 26,
            letterSpacing: 14,
            textTransform: "uppercase",
            color: "rgba(237,237,237,0.6)",
          }}
        >
          Invest in Yourself
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 18,
            marginTop: 34,
            fontSize: 22,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: 4,
          }}
        >
          <span style={{ color: "#a970ff" }}>Twitch</span>
          <span style={{ color: "rgba(237,237,237,0.35)" }}>·</span>
          <span style={{ color: "#53fc18" }}>Kick</span>
          <span style={{ color: "rgba(237,237,237,0.35)" }}>·</span>
          <span style={{ color: "#e7e9ea" }}>X</span>
          <span style={{ color: "rgba(237,237,237,0.35)" }}>·</span>
          <span style={{ color: "rgba(237,237,237,0.75)" }}>One dashboard</span>
        </div>
      </div>
    ),
    { ...size },
  );
}

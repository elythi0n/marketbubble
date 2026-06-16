import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // The dev-mode toast (bottom-left "N" circle) leaks into screenshots. Off by default.
  devIndicators: false,
  images: {
    remotePatterns: [
      // Twitch/Kick avatars and emote CDNs, X profile images (used by the unified feed).
      { protocol: "https", hostname: "**.jtvnw.net" },
      { protocol: "https", hostname: "**.kick.com" },
      { protocol: "https", hostname: "files.kick.com" },
      { protocol: "https", hostname: "**.twimg.com" },
    ],
  },
};

export default nextConfig;

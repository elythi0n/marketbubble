import type { MetadataRoute } from "next";

import { getSiteUrl } from "@/lib/site";

const staticPaths = ["", "/markets", "/leaderboard"];

export default function sitemap(): MetadataRoute.Sitemap {
  const base = getSiteUrl();
  const lastModified = new Date();

  return staticPaths.map((path) => ({
    url: `${base}${path || "/"}`,
    lastModified,
    changeFrequency: "daily" as const,
    priority: path === "" ? 1 : 0.7,
  }));
}

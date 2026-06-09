import { readFileSync } from "fs";
import { join } from "path";
import { NextResponse } from "next/server";

import { MOCK_STREAMERS, type Streamer } from "@/lib/streamers/mock";

export const revalidate = 300; // re-read the file every 5 minutes

function loadStreamers(): Streamer[] {
  // 1. STREAMERS_JSON env var — useful on servers where you can't edit files
  const env = process.env.STREAMERS_JSON;
  if (env) {
    try {
      return JSON.parse(env) as Streamer[];
    } catch {
      console.error("[/api/streamers] STREAMERS_JSON is not valid JSON, ignoring");
    }
  }

  // 2. streamers.json at project root
  try {
    const raw = readFileSync(join(process.cwd(), "streamers.json"), "utf-8");
    return JSON.parse(raw) as Streamer[];
  } catch {
    // file missing or malformed
  }

  // 3. Hardcoded fallback
  return MOCK_STREAMERS;
}

export async function GET() {
  try {
    const streamers = loadStreamers();
    // Normalise: ensure live/viewers/title have defaults (they come from Twitch polling client-side)
    const normalised = streamers.map((s) => ({
      ...s,
      live: false,
      viewers: 0,
      title: s.title ?? "",
    }));
    return NextResponse.json(normalised);
  } catch (err) {
    console.error("[/api/streamers]", err);
    return NextResponse.json(MOCK_STREAMERS);
  }
}

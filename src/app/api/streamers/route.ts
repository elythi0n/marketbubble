import { NextResponse } from "next/server";

import { MOCK_STREAMERS } from "@/lib/streamers/mock";
import { loadRoster } from "@/lib/streamers/load";

export const revalidate = 300; // re-read the file every 5 minutes

export async function GET() {
  try {
    const streamers = loadRoster();
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
    const normalised = MOCK_STREAMERS.map((s) => ({
      ...s,
      live: false,
      viewers: 0,
      title: s.title ?? "",
    }));
    return NextResponse.json(normalised);
  }
}

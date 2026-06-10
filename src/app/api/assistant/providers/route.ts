import { NextResponse } from "next/server";

import { AI_ENABLED, PROVIDERS, type AssistantProvider } from "@/lib/assistant/config";
import { serverProviderKey } from "../keys";

export const dynamic = "force-dynamic";

export interface ProvidersPayload {
  /** Providers with a server-side key — usable through the proxy, locked in the UI. */
  managed: AssistantProvider[];
  limits: { perMinute: number; perDay: number };
}

/**
 * Which providers are configured server-side. Booleans only — keys never leave the server.
 */
export async function GET() {
  if (!AI_ENABLED) return new NextResponse(null, { status: 404 });
  const managed = PROVIDERS.filter((p) => serverProviderKey(p) !== null);
  return NextResponse.json({
    managed,
    limits: {
      perMinute: Number(process.env.ASSISTANT_RPM || 5),
      perDay: Number(process.env.ASSISTANT_RPD || 50),
    },
  } satisfies ProvidersPayload);
}

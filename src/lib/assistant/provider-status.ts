"use client";

import { useEffect, useState } from "react";

import type { ProvidersPayload } from "@/app/api/assistant/providers/route";
import { AI_ENABLED } from "./config";

const EMPTY: ProvidersPayload = { managed: [], limits: { perMinute: 0, perDay: 0 } };

let cached: ProvidersPayload | null = null;
let pending: Promise<ProvidersPayload> | null = null;

/** Which providers have server-side keys (booleans only — keys never reach the client). */
export function fetchProviderStatus(): Promise<ProvidersPayload> {
  if (!AI_ENABLED) return Promise.resolve(EMPTY);
  if (cached) return Promise.resolve(cached);
  pending ??= fetch("/api/assistant/providers")
    .then((r) => (r.ok ? (r.json() as Promise<ProvidersPayload>) : EMPTY))
    .catch(() => EMPTY)
    .then((d) => {
      cached = d;
      return d;
    });
  return pending;
}

/** null while loading. */
export function useProviderStatus(): ProvidersPayload | null {
  const [status, setStatus] = useState<ProvidersPayload | null>(cached);
  useEffect(() => {
    let alive = true;
    fetchProviderStatus().then((s) => {
      if (alive) setStatus(s);
    });
    return () => {
      alive = false;
    };
  }, []);
  return status;
}

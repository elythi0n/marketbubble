"use client";

import { useSyncExternalStore } from "react";

import type { ControlState } from "@/lib/server/control";

/**
 * Client side of the control stream. One EventSource per tab, shared by every consumer
 * (announcement banner, poll card, flag checks) — important when thousands of viewers each hold
 * a connection. EventSource reconnects on its own and the server replays current state on
 * connect, so consumers can treat `useControl()` as always-current.
 */
const EMPTY: ControlState = { announcement: null, flags: {}, poll: null, roster: null, filters: [], giveaway: null };

let state: ControlState = EMPTY;
let started = false;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function ensureStream() {
  if (started || typeof window === "undefined") return;
  started = true;
  const source = new EventSource("/api/control/stream");
  source.onmessage = (ev) => {
    try {
      // Spread over EMPTY so fields this client knows about but an older server doesn't
      // (e.g. a not-yet-restarted dev process) come through as their defaults, not undefined.
      state = { ...EMPTY, ...(JSON.parse(ev.data) as ControlState) };
      emit();
    } catch {
      /* malformed frame — ignore */
    }
  };
  // One-shot snapshot when the stream can't connect (EventSource keeps retrying on its own).
  source.onerror = () => {
    fetch("/api/control", { cache: "no-store" })
      .then((r) => r.json())
      .then((s: ControlState) => {
        state = { ...EMPTY, ...s };
        emit();
      })
      .catch(() => {});
  };
}

export function useControl(): ControlState {
  return useSyncExternalStore(
    (cb) => {
      ensureStream();
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
    () => EMPTY,
  );
}

/** Runtime feature flag: missing key means enabled; the operator can turn features off live. */
export function useFlag(key: string): boolean {
  return useControl().flags[key] !== false;
}

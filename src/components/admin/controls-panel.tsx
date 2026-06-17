"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Clapperboard, ExternalLink, Filter, Plus, Radio, Scissors, ToggleRight, Trash2 } from "lucide-react";

import type { ClipRadarPayload } from "@/app/api/admin/clip-radar/route";
import { useControl } from "@/lib/control/client";
import { normalizeXSource, parseBroadcastId } from "@/lib/streamers/x-source";
import { cn } from "@/lib/utils";
import { Card } from "./card";
import { useAdmin } from "./admin-shell";
import { CopyButton, INPUT, LiveChip, QUIET_BTN, Select, SOLID_BTN, StatusDot, Toggle } from "./ui";

interface FilterDraftRow {
  pattern: string;
  action: "mute" | "highlight";
  field: "text" | "author";
}

const COOLDOWNS = [
  { value: "60", label: "1 min between clips" },
  { value: "120", label: "2 min between clips" },
  { value: "300", label: "5 min between clips" },
] as const;

const SENSITIVITIES = [
  { value: "high", label: "High — fires early, more noise" },
  { value: "medium", label: "Medium — balanced" },
  { value: "low", label: "Low — only big spikes" },
] as const;

/**
 * Clip radar config. The radar itself runs server-side and is OFF by default — this card is
 * the only switch. Detected moments land under Analytics for review; nothing touches the
 * viewer-facing dashboard.
 */
function ClipRadarCard() {
  const { call } = useAdmin();
  const [data, setData] = useState<ClipRadarPayload | null>(null);
  const [channelDraft, setChannelDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await call("/api/admin/clip-radar");
      if (res.ok) setData((await res.json()) as ClipRadarPayload);
    } catch {
      /* leave previous state */
    }
  }, [call]);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 10_000);
    return () => clearInterval(id);
  }, [load]);

  const patch = async (p: Record<string, unknown>) => {
    setSaving(true);
    try {
      const res = await call("/api/admin/clip-radar", { method: "POST", body: JSON.stringify(p) });
      if (res.ok) setData((await res.json()) as ClipRadarPayload);
    } finally {
      setSaving(false);
    }
  };

  const cfg = data?.config;
  const st = data?.status;
  const channel = channelDraft ?? cfg?.clipChannel ?? "";

  return (
    <Card
      title="Clip radar"
      hint="Auto-detects chat spikes and cuts Twitch clips — off by default"
      icon={Scissors}
      status={cfg?.enabled ? <LiveChip label="armed" /> : undefined}
    >
      {!cfg || !st ? (
        <p className="text-[0.76rem] text-muted-foreground">Loading…</p>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1 leading-tight">
              <p className="text-[0.82rem] font-medium text-foreground">Auto clip radar</p>
              <p className="mt-0.5 text-[0.66rem] text-muted-foreground">
                Watches combined chat velocity via the relay; fires on spikes while they build.
              </p>
            </div>
            <Toggle checked={cfg.enabled} onChange={(v) => void patch({ enabled: v })} label="Auto clip radar" />
          </div>

          <ul className="flex flex-col gap-2 border-t border-hairline pt-3 text-[0.76rem]">
            <li className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <StatusDot ok={st.relayConfigured ? st.relayOk : null} />
              <span className="flex-1 text-foreground/90">Relay velocity</span>
              <span className="break-all font-mono text-[0.7rem] tabular-nums text-muted-foreground">
                {!st.relayConfigured
                  ? "RELAY_URL not set"
                  : !cfg.enabled
                    ? "idle"
                    : st.relayOk
                      ? `${st.currentMpm} msg/min · base ${st.baselineMpm} · score ${st.lastScore}`
                      : "unreachable"}
              </span>
            </li>
            <li className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <StatusDot ok={st.clipTokenConfigured ? true : null} />
              <span className="flex-1 text-foreground/90">Twitch clipping</span>
              <span className="break-all font-mono text-[0.7rem] text-muted-foreground">
                {st.clipTokenConfigured ? "token configured" : "moments only (set TWITCH_CLIP_TOKEN)"}
              </span>
            </li>
            {st.lastFireAt ? (
              <li className="flex items-center gap-2.5 pl-[18px]">
                <span className="flex-1 text-[0.72rem] text-muted-foreground">Last moment</span>
                <span className="font-mono text-[0.7rem] text-muted-foreground">
                  {new Date(st.lastFireAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </li>
            ) : null}
          </ul>

          <div className="grid grid-cols-1 gap-2 border-t border-hairline pt-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Sensitivity
              <Select
                value={cfg.sensitivity}
                onChange={(v) => void patch({ sensitivity: v })}
                ariaLabel="Clip radar sensitivity"
                options={[...SENSITIVITIES]}
              />
            </label>
            <label className="flex flex-col gap-1 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Cooldown
              <Select
                value={String(cfg.cooldownSec) as (typeof COOLDOWNS)[number]["value"]}
                onChange={(v) => void patch({ cooldownSec: Number(v) })}
                ariaLabel="Clip radar cooldown"
                options={[...COOLDOWNS]}
              />
            </label>
          </div>

          <div className="flex items-end gap-2">
            <label className="flex min-w-0 flex-1 flex-col gap-1 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Twitch channel to clip
              <input
                type="text"
                value={channel}
                onChange={(e) => setChannelDraft(e.target.value)}
                placeholder="login, e.g. fazebanks"
                aria-label="Twitch channel to clip"
                className={cn(INPUT, "py-1.5 font-mono text-[0.76rem]")}
              />
            </label>
            <button
              type="button"
              onClick={() => void patch({ clipChannel: channel }).then(() => setChannelDraft(null))}
              disabled={saving || channelDraft === null || channelDraft === cfg.clipChannel}
              className={SOLID_BTN}
            >
              <Check className="size-3.5" />
              Save
            </button>
          </div>

          <p className="text-[0.64rem] text-muted-foreground/70">
            Twitch cuts clips from footage before the trigger, so detected moments are still inside the clip.
            Moments land under Analytics for review — keep, re-trim via the edit link, or dismiss.
          </p>
        </div>
      )}
    </Card>
  );
}

/**
 * X broadcast override panel. The X bridge auto-discovers each configured handle's current live
 * broadcast (link → syndication → GraphQL), but discovery has more failure modes than a hard-coded
 * id: rate limits, rotated query IDs, syndication outages. This card is the operator safety valve
 * — paste a `x.com/i/broadcasts/<id>` URL (or the bare id) and the bridge connects to it directly,
 * bypassing discovery entirely until the override is cleared. Foolproof:
 *   - Inline validation (accepts URL or bare id; rejects anything else with a visible "INVALID" tag)
 *   - Save is disabled when the field is unchanged or invalid
 *   - Auto/Manual badge shows the current mode at a glance
 *   - Clear button restores auto-discovery
 *   - State persists across restarts (via the control plane's KV store)
 */
function XBroadcastOverrideCard() {
  const { call, busy, setBusy, streamers } = useAdmin();
  const { xBroadcastOverrides } = useControl();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  // Flatten every X source configured on any streamer (deduped). Env-only sources (X_BROADCAST_SOURCES)
  // aren't visible here on purpose — env is the operator config that drives the bridge in the first
  // place, and we don't want to expose it as editable in a UI without persistence rules.
  const sources = useMemo(() => {
    const seen = new Set<string>();
    const out: Array<{ source: string; key: string; label: string; streamer: string }> = [];
    for (const s of streamers) {
      for (const src of s.xBroadcasts ?? []) {
        const key = normalizeXSource(src);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        out.push({ source: src.trim(), key, label: src.trim().replace(/^@/, "@"), streamer: s.name });
      }
    }
    return out;
  }, [streamers]);

  const save = async (source: string, key: string, link: string | null) => {
    setBusy(true);
    setError(null);
    try {
      const res = await call("/api/admin/x-broadcast-override", {
        method: "POST",
        body: JSON.stringify({ source, link }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setError(j.error || `HTTP ${res.status}`);
        return;
      }
      // Drop the local draft for this row so the next render reflects the published value.
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      title="X broadcast override"
      hint="Manual fallback when X auto-discovery is misbehaving"
      icon={Radio}
      status={Object.keys(xBroadcastOverrides).length > 0 ? <LiveChip label={`${Object.keys(xBroadcastOverrides).length} pinned`} /> : undefined}
      className="lg:col-span-2"
    >
      {sources.length === 0 ? (
        <p className="text-[0.76rem] text-muted-foreground">
          No X sources configured on any streamer. Add an entry to <span className="font-mono">xBroadcasts</span> in the roster to manage it here.
        </p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {sources.map(({ source, key, label, streamer }) => {
            const pinned = xBroadcastOverrides[key];
            const draft = drafts[key];
            const draftValue = draft !== undefined ? draft : pinned ? `https://x.com/i/broadcasts/${pinned}` : "";
            const parsed = draftValue.trim() === "" ? "" : parseBroadcastId(draftValue);
            const isInvalid = draftValue.trim() !== "" && !parsed;
            const hasChange = draft !== undefined && parsed !== (pinned ?? "");
            return (
              <div key={key} className="flex flex-col gap-2 rounded-lg border border-hairline bg-overlay-weak p-2.5 sm:flex-row sm:items-center">
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className={cn(
                      "inline-flex h-5 items-center rounded-md border px-1.5 text-[0.58rem] font-bold uppercase tracking-[0.12em]",
                      pinned
                        ? "border-feed-warn/40 bg-feed-warn/10 text-feed-warn"
                        : "border-hairline-strong bg-overlay-medium text-muted-foreground",
                    )}
                  >
                    {pinned ? "Manual" : "Auto"}
                  </span>
                  <div className="min-w-0 leading-tight">
                    <p className="truncate text-[0.8rem] font-medium text-foreground">{label}</p>
                    <p className="mt-0.5 truncate text-[0.62rem] text-muted-foreground">
                      {streamer}
                      {pinned ? <> · pinned to <span className="font-mono">{pinned}</span></> : null}
                    </p>
                  </div>
                </div>
                <div className="flex flex-1 items-center gap-2 sm:justify-end">
                  <input
                    type="text"
                    value={draftValue}
                    onChange={(e) => setDrafts((p) => ({ ...p, [key]: e.target.value }))}
                    placeholder="https://x.com/i/broadcasts/<id> or bare id"
                    aria-label={`Pin broadcast for ${label}`}
                    className={cn(INPUT, "min-w-0 flex-1 py-1.5 font-mono text-[0.72rem]", isInvalid && "border-feed-danger/60")}
                  />
                  {isInvalid ? (
                    <span className="text-[0.58rem] font-bold uppercase tracking-[0.12em] text-feed-danger">Invalid</span>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void save(source, key, draftValue.trim() || null)}
                    disabled={busy || isInvalid || !hasChange}
                    className={SOLID_BTN}
                    title={hasChange ? "Pin this broadcast" : "No change"}
                  >
                    <Check className="size-3.5" />
                    Save
                  </button>
                  {pinned ? (
                    <button
                      type="button"
                      onClick={() => void save(source, key, null)}
                      disabled={busy}
                      className={QUIET_BTN}
                      title="Clear override and resume auto-discovery"
                    >
                      <Trash2 className="size-3.5" />
                      Clear
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
          {error ? (
            <p className="text-[0.7rem] font-medium text-feed-danger">{error}</p>
          ) : null}
          <p className="border-t border-hairline pt-2.5 text-[0.64rem] text-muted-foreground/80">
            X access happens once from this server — viewers never poll X directly. When a pin is set,
            the bridge skips auto-discovery for that source and reads the pinned broadcast until you
            clear it. State persists across restarts when <span className="font-mono">DATABASE_PATH</span> is set.
          </p>
        </div>
      )}
    </Card>
  );
}

/**
 * Every OBS browser source in one place: open a preview tab (dark background, readable) or copy
 * the transparent URL that goes straight into OBS.
 */
function ObsSourcesCard() {
  const { streamers } = useAdmin();
  const sources = [
    { label: "Unified chat", hint: "every roster channel, merged", path: "/overlay" },
    ...streamers.map((s) => ({ label: `${s.name} chat`, hint: "single channel", path: `/overlay?channel=${s.id}` })),
    { label: "Poll", hint: "active poll only, invisible when idle", path: "/overlay-poll" },
    { label: "Giveaway", hint: "the roll + winner, invisible when idle", path: "/overlay-giveaway" },
  ];
  const obsUrl = (path: string) => `${window.location.origin}${path}${path.includes("?") ? "&" : "?"}bg=transparent`;

  return (
    <Card title="OBS sources" hint="Browser-source URLs for live production" icon={Clapperboard} className="lg:col-span-2">
      <ul className="flex flex-col divide-y divide-hairline">
        {sources.map((s) => (
          <li key={s.path} className="flex items-center gap-2.5 py-2 first:pt-0 last:pb-0">
            <div className="min-w-0 flex-1 leading-tight">
              <p className="text-[0.8rem] font-medium text-foreground">{s.label}</p>
              <p className="mt-0.5 truncate font-mono text-[0.64rem] text-muted-foreground">
                {s.path}
                {s.path.includes("?") ? "&" : "?"}bg=transparent
              </p>
            </div>
            <span className="hidden text-[0.64rem] text-muted-foreground/70 sm:inline">{s.hint}</span>
            <CopyButton label={`Copy ${s.label} OBS URL`} value={() => obsUrl(s.path)} />
            <a
              href={s.path}
              target="_blank"
              rel="noreferrer noopener"
              title={`Preview ${s.label}`}
              aria-label={`Preview ${s.label}`}
              className="inline-flex size-6 flex-none items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-overlay-weak hover:text-foreground"
            >
              <ExternalLink className="size-3.5" />
            </a>
          </li>
        ))}
      </ul>
      <p className="mt-3 border-t border-hairline pt-2.5 text-[0.64rem] text-muted-foreground/70">
        Copied URLs include <span className="font-mono">bg=transparent</span> for OBS; the preview button opens the
        readable dark version. Add <span className="font-mono">&scale=1.4</span> to taste.
      </p>
    </Card>
  );
}

/** Feature flags, maintenance actions, and the global chat filter editor. */
export function ControlsPanel() {
  const { call, refresh, busy, setBusy } = useAdmin();
  const { flags, filters: globalFilters } = useControl();

  const setFlag = async (flagKey: string, enabled: boolean) => {
    await call("/api/admin/flags", { method: "POST", body: JSON.stringify({ key: flagKey, enabled }) });
  };

  const clearXBuffer = async () => {
    setBusy(true);
    try {
      await call("/api/admin/x-chat/clear", { method: "POST" });
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const [filterDraft, setFilterDraft] = useState<FilterDraftRow[] | null>(null);
  useEffect(() => {
    if (filterDraft !== null) return;
    setFilterDraft(globalFilters.map((f) => ({ pattern: f.pattern, action: f.action, field: f.field })));
  }, [filterDraft, globalFilters]);

  const publishFilters = async () => {
    if (!filterDraft) return;
    setBusy(true);
    try {
      await call("/api/admin/filters", {
        method: "POST",
        body: JSON.stringify({ filters: filterDraft.filter((f) => f.pattern.trim()) }),
      });
    } finally {
      setBusy(false);
    }
  };

  const clearFilters = async () => {
    setBusy(true);
    try {
      await call("/api/admin/filters", { method: "DELETE" });
      setFilterDraft([]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      <Card title="Live feature flags" hint="Pushed to every open dashboard instantly" icon={ToggleRight}>
        <ul className="flex flex-col divide-y divide-hairline">
          {[
            { key: "assistant", label: "AI Assistant", hint: "Panel, launcher and palette entries" },
            { key: "demo", label: "Demo mode", hint: "Switches and the offline nudge; demo viewers snap back to live" },
            { key: "predictions", label: "Predictions panel", hint: "Polymarket odds panel" },
          ].map(({ key: flagKey, label, hint }) => {
            const enabled = flags[flagKey] !== false;
            return (
              <li key={flagKey} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                <div className="min-w-0 flex-1 leading-tight">
                  <p className="text-[0.82rem] font-medium text-foreground">{label}</p>
                  <p className="mt-0.5 text-[0.66rem] text-muted-foreground">{hint}</p>
                </div>
                <Toggle checked={enabled} onChange={(v) => void setFlag(flagKey, v)} label={label} />
              </li>
            );
          })}
        </ul>
        <p className="mt-3 border-t border-hairline pt-2.5 text-[0.64rem] text-muted-foreground/70">
          In memory — a restart restores the build defaults.
        </p>
      </Card>

      <ClipRadarCard />

      <Card
        title="Chat filters"
        hint="Mute or highlight messages on every viewer's feed — applied before their own rules"
        icon={Filter}
        status={globalFilters.length > 0 ? <LiveChip label={`${globalFilters.length} active`} /> : undefined}
      >
        {filterDraft === null ? (
          <p className="text-[0.76rem] text-muted-foreground">Loading filters…</p>
        ) : (
          <div className="flex flex-col gap-2">
            {filterDraft.length > 0 ? (
              <div className="hidden grid-cols-[1fr_6.5rem_6.5rem_2rem] gap-2 px-1 text-[0.6rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground sm:grid">
                <span>Pattern</span>
                <span>Action</span>
                <span>Match</span>
                <span />
              </div>
            ) : (
              <p className="text-[0.76rem] text-muted-foreground">
                No filters yet. Add a rule to mute spam terms or highlight the hosts for everyone.
              </p>
            )}
            {filterDraft.map((f, i) => {
              const set = (patch: Partial<FilterDraftRow>) =>
                setFilterDraft((cur) => (cur ? cur.map((row, j) => (j === i ? { ...row, ...patch } : row)) : cur));
              return (
                <div key={i} className="grid grid-cols-2 gap-2 rounded-lg border border-hairline bg-overlay-weak p-2 sm:grid-cols-[1fr_6.5rem_6.5rem_2rem] sm:border-0 sm:bg-transparent sm:p-0">
                  <input
                    type="text"
                    value={f.pattern}
                    onChange={(e) => set({ pattern: e.target.value })}
                    placeholder="word, phrase or name"
                    aria-label={`Filter ${i + 1} pattern`}
                    className={cn(INPUT, "col-span-2 py-1.5 text-[0.78rem] sm:col-span-1")}
                  />
                  <Select
                    value={f.action}
                    onChange={(v) => set({ action: v })}
                    ariaLabel={`Filter ${i + 1} action`}
                    options={[
                      { value: "mute", label: "Mute" },
                      { value: "highlight", label: "Highlight" },
                    ]}
                  />
                  <Select
                    value={f.field}
                    onChange={(v) => set({ field: v })}
                    ariaLabel={`Filter ${i + 1} match field`}
                    options={[
                      { value: "text", label: "Message" },
                      { value: "author", label: "Author" },
                    ]}
                  />
                  <button
                    type="button"
                    onClick={() => setFilterDraft((cur) => (cur ? cur.filter((_, j) => j !== i) : cur))}
                    aria-label={`Remove filter ${f.pattern || i + 1}`}
                    className="inline-flex size-8 items-center justify-center justify-self-end rounded-lg text-muted-foreground transition-colors hover:bg-overlay-weak hover:text-feed-danger sm:justify-self-auto"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              );
            })}
            <div className="flex flex-wrap items-center gap-2 border-t border-hairline pt-3">
              {filterDraft.length < 20 ? (
                <button
                  type="button"
                  onClick={() => setFilterDraft((cur) => [...(cur ?? []), { pattern: "", action: "mute", field: "text" }])}
                  className={QUIET_BTN}
                >
                  <Plus className="size-3.5" />
                  Add rule
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => void clearFilters()}
                disabled={busy || globalFilters.length === 0}
                className={cn(QUIET_BTN, "ml-auto")}
              >
                Clear all
              </button>
              <button
                type="button"
                onClick={() => void publishFilters()}
                disabled={busy || filterDraft.every((f) => !f.pattern.trim())}
                className={SOLID_BTN}
              >
                <Check className="size-3.5" />
                Publish filters
              </button>
            </div>
            <p className="text-[0.64rem] text-muted-foreground/70">
              Mute drops matching messages, highlight emphasizes them — for every viewer. In memory — a
              restart clears the set.
            </p>
          </div>
        )}
      </Card>

      <XBroadcastOverrideCard />

      <Card title="Maintenance" hint="Housekeeping between sessions" icon={Trash2}>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void clearXBuffer()}
            disabled={busy}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-feed-danger/30 bg-feed-danger/[0.08] px-3 text-[0.76rem] font-medium text-feed-danger transition-colors hover:bg-feed-danger/[0.14] disabled:opacity-35"
          >
            <Trash2 className="size-3.5" />
            Clear X chat buffer
          </button>
          <span className="text-[0.7rem] text-muted-foreground">Fresh slate before a session.</span>
        </div>
      </Card>

      <ObsSourcesCard />
    </div>
  );
}

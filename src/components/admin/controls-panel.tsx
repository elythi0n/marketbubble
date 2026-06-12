"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Clapperboard, ExternalLink, Filter, Plus, Scissors, ToggleRight, Trash2 } from "lucide-react";

import type { ClipRadarPayload } from "@/app/api/admin/clip-radar/route";
import { useControl } from "@/lib/control/client";
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

          <ul className="flex flex-col gap-2 border-t border-white/[0.05] pt-3 text-[0.76rem]">
            <li className="flex items-center gap-2.5">
              <StatusDot ok={st.relayConfigured ? st.relayOk : null} />
              <span className="flex-1 text-foreground/90">Relay velocity</span>
              <span className="font-mono text-[0.7rem] tabular-nums text-muted-foreground">
                {!st.relayConfigured
                  ? "RELAY_URL not set"
                  : !cfg.enabled
                    ? "idle"
                    : st.relayOk
                      ? `${st.currentMpm} msg/min · base ${st.baselineMpm} · score ${st.lastScore}`
                      : "unreachable"}
              </span>
            </li>
            <li className="flex items-center gap-2.5">
              <StatusDot ok={st.clipTokenConfigured ? true : null} />
              <span className="flex-1 text-foreground/90">Twitch clipping</span>
              <span className="font-mono text-[0.7rem] text-muted-foreground">
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

          <div className="grid gap-2 border-t border-white/[0.05] pt-3 sm:grid-cols-2">
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
      <ul className="flex flex-col divide-y divide-white/[0.05]">
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
              className="inline-flex size-6 flex-none items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground"
            >
              <ExternalLink className="size-3.5" />
            </a>
          </li>
        ))}
      </ul>
      <p className="mt-3 border-t border-white/[0.05] pt-2.5 text-[0.64rem] text-muted-foreground/70">
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
    <div className="grid gap-3 lg:grid-cols-2">
      <Card title="Live feature flags" hint="Pushed to every open dashboard instantly" icon={ToggleRight}>
        <ul className="flex flex-col divide-y divide-white/[0.05]">
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
        <p className="mt-3 border-t border-white/[0.05] pt-2.5 text-[0.64rem] text-muted-foreground/70">
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
                <div key={i} className="grid grid-cols-2 gap-2 rounded-lg border border-white/[0.06] bg-white/[0.015] p-2 sm:grid-cols-[1fr_6.5rem_6.5rem_2rem] sm:border-0 sm:bg-transparent sm:p-0">
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
                    className="inline-flex size-8 items-center justify-center justify-self-end rounded-lg text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-[#ef6a61] sm:justify-self-auto"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              );
            })}
            <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.05] pt-3">
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

      <Card title="Maintenance" hint="Housekeeping between sessions" icon={Trash2}>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void clearXBuffer()}
            disabled={busy}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#ef6a61]/30 bg-[#ef6a61]/[0.08] px-3 text-[0.76rem] font-medium text-[#ef6a61] transition-colors hover:bg-[#ef6a61]/[0.14] disabled:opacity-35"
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

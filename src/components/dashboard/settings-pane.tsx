"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { Cast, Highlighter, KeyRound, Lock, Plus, RotateCcw, VolumeX, X } from "lucide-react";

import { AI_ENABLED, PROVIDERS, PROVIDER_LABEL } from "@/lib/assistant/config";
import { useProviderStatus } from "@/lib/assistant/provider-status";
import {
  useSettings,
  type ChatDensity,
  type FilterAction,
  type FilterField,
  type FilterRule,
} from "@/lib/settings/settings-context";
import { useTheme, type ThemeChoice } from "@/lib/theme/theme-context";
import { cn } from "@/lib/utils";
import { ProviderIcon } from "./provider-icon";

const TABS = [
  { id: "chat", label: "Chat" },
  { id: "filters", label: "Filters" },
  ...(AI_ENABLED ? ([{ id: "assistant", label: "Assistant" }] as const) : []),
  { id: "workspace", label: "Workspace" },
] as const;
type TabId = "chat" | "filters" | "assistant" | "workspace";

/** One settings entry: label + hint on the left, control on the right. */
function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-4 py-2.5">
      <div className="min-w-0 flex-1 leading-tight">
        <p className="text-[0.82rem] font-medium text-foreground">{label}</p>
        {hint ? <p className="mt-0.5 text-[0.7rem] text-muted-foreground">{hint}</p> : null}
      </div>
      <div className="flex-none">{children}</div>
    </div>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-[18px] w-8 flex-none rounded-full transition-colors",
        checked ? "bg-feed-ok/80" : "bg-overlay-strong",
      )}
    >
      <span
        className={cn(
          "absolute left-[2px] top-[2px] size-[14px] rounded-full bg-foreground transition-transform",
          checked ? "translate-x-[14px]" : "translate-x-0",
        )}
      />
    </button>
  );
}

/** Compact segmented control, shared by density and the filter form's action/field pickers. */
function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-hairline bg-overlay-weak p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={o.value === value}
          className={cn(
            "rounded-md px-2 py-1 text-[0.7rem] font-medium transition-colors",
            o.value === value ? "bg-overlay-medium text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function ChatTab() {
  const { settings, update } = useSettings();
  return (
    <div className="divide-y divide-hairline">
      <Row label="Density" hint="Row spacing and base font size in chat">
        <Segmented<ChatDensity>
          value={settings.density}
          onChange={(density) => update({ density })}
          options={[
            { value: "compact", label: "Compact" },
            { value: "cozy", label: "Cozy" },
            { value: "comfortable", label: "Comfy" },
          ]}
        />
      </Row>
      <Row label="Timestamps" hint="Show the time next to each message">
        <Toggle checked={settings.showTimestamps} onChange={(showTimestamps) => update({ showTimestamps })} label="Timestamps" />
      </Row>
      <Row label="Streamer emphasis" hint="Tint messages from the channel's broadcaster so they stand out">
        <Toggle checked={settings.emphasizeStreamer} onChange={(emphasizeStreamer) => update({ emphasizeStreamer })} label="Streamer emphasis" />
      </Row>
      <Row label="Deleted messages" hint="Show the original text struck through instead of a tombstone">
        <Toggle checked={settings.showDeleted} onChange={(showDeleted) => update({ showDeleted })} label="Deleted messages" />
      </Row>
      <Row label="Mention names" hint="Comma-separated names the Mention Inbox panel watches for">
        <input
          type="text"
          value={settings.mentionNames}
          onChange={(e) => update({ mentionNames: e.target.value })}
          placeholder="banks, marketbubble"
          aria-label="Mention names"
          className="w-44 rounded-lg border border-hairline bg-overlay-weak px-2.5 py-1.5 text-[0.76rem] text-foreground outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-hairline-strong"
        />
      </Row>
    </div>
  );
}

function FilterChip({ rule, onRemove }: { rule: FilterRule; onRemove: () => void }) {
  const highlight = rule.action === "highlight";
  return (
    <li
      className={cn(
        "flex items-center gap-2 rounded-lg border px-2.5 py-1.5",
        highlight ? "border-feed-link/25 bg-feed-link/[0.07]" : "border-feed-danger/25 bg-feed-danger/[0.06]",
      )}
    >
      {highlight ? (
        <Highlighter className="size-3.5 flex-none text-feed-link" />
      ) : (
        <VolumeX className="size-3.5 flex-none text-feed-danger" />
      )}
      <span className="min-w-0 flex-1 truncate font-mono text-[0.78rem] text-foreground">{rule.pattern}</span>
      <span className="flex-none rounded border border-hairline bg-overlay-weak px-1.5 py-0.5 text-[0.58rem] font-semibold uppercase tracking-wide text-muted-foreground">
        {rule.field === "author" ? "User" : "Text"}
      </span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove filter “${rule.pattern}”`}
        className="flex size-5 flex-none items-center justify-center rounded text-muted-foreground transition-colors hover:bg-overlay-medium hover:text-foreground"
      >
        <X className="size-3.5" />
      </button>
    </li>
  );
}

function FiltersTab() {
  const { settings, addFilter, removeFilter } = useSettings();
  const [pattern, setPattern] = useState("");
  const [action, setAction] = useState<FilterAction>("highlight");
  const [field, setField] = useState<FilterField>("text");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const p = pattern.trim();
    if (!p) return;
    addFilter({ pattern: p, action, field });
    setPattern("");
  };

  return (
    <div>
      <p className="text-[0.7rem] leading-relaxed text-muted-foreground">
        Highlight or mute chat by keyword or username. Matching is case-insensitive; muting only
        hides messages from view — stats and gift events still count everything.
      </p>

      <form onSubmit={submit} className="mt-3 flex flex-col gap-2">
        <div className="flex items-center gap-2 rounded-lg border border-hairline bg-overlay-weak px-2.5 py-1.5 transition-colors focus-within:border-hairline-strong focus-within:bg-overlay-medium">
          <input
            type="text"
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            placeholder={field === "author" ? "Username contains…" : "Message contains…"}
            aria-label="Filter pattern"
            className="min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground/45 md:text-[0.82rem]"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented<FilterAction>
            value={action}
            onChange={setAction}
            options={[
              { value: "highlight", label: "Highlight" },
              { value: "mute", label: "Mute" },
            ]}
          />
          <Segmented<FilterField>
            value={field}
            onChange={setField}
            options={[
              { value: "text", label: "Text" },
              { value: "author", label: "User" },
            ]}
          />
          <button
            type="submit"
            disabled={!pattern.trim()}
            className="ml-auto inline-flex h-[26px] items-center gap-1 rounded-lg border border-hairline-strong bg-overlay-weak px-2.5 text-[0.72rem] font-medium text-foreground transition-colors hover:bg-overlay-medium disabled:opacity-35 disabled:hover:bg-overlay-weak"
          >
            <Plus className="size-3.5" />
            Add
          </button>
        </div>
      </form>

      {settings.filters.length > 0 ? (
        <ul className="mt-4 flex flex-col gap-1.5">
          {settings.filters.map((rule) => (
            <FilterChip key={rule.id} rule={rule} onRemove={() => removeFilter(rule.id)} />
          ))}
        </ul>
      ) : (
        <p className="mt-5 text-center text-[0.72rem] text-muted-foreground/70">No filters yet</p>
      )}
    </div>
  );
}

function AssistantTab() {
  const { settings, update } = useSettings();
  const status = useProviderStatus();
  const managed = status?.managed ?? [];
  return (
    <div>
      <p className="text-[0.7rem] leading-relaxed text-muted-foreground">
        <b className="text-foreground/85">Opt-in feature.</b> When on, live chat is kept in memory only (never on disk, never
        on a server) so the assistant can search it. Reloading the page wipes everything. Bring-your-own keys are also held in
        memory only and go straight from your browser to the provider.
      </p>
      <div className="mt-2 divide-y divide-hairline">
        <Row label="AI Assistant" hint="Gather session chat in memory and enable the Assistant panel">
          <Toggle checked={settings.assistantOptIn} onChange={(assistantOptIn) => update({ assistantOptIn })} label="AI Assistant" />
        </Row>
        <Row label="Chat memory" hint="How many messages the in-memory archive keeps for the assistant">
          <Segmented<string>
            value={String(settings.assistantArchiveSize)}
            onChange={(v) => update({ assistantArchiveSize: Number(v) })}
            options={[
              { value: "1000", label: "1k" },
              { value: "5000", label: "5k" },
              { value: "10000", label: "10k" },
            ]}
          />
        </Row>
      </div>

      <h4 className="mb-1.5 mt-5 text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Providers</h4>
      <ul className="divide-y divide-hairline">
        {PROVIDERS.map((p) => {
          const active = managed.includes(p);
          return (
            <li key={p} className="flex items-center gap-2.5 py-2">
              <ProviderIcon provider={p} className="size-5" />
              <span className="min-w-0 flex-1 text-[0.82rem] font-medium text-foreground">{PROVIDER_LABEL[p]}</span>
              {active ? (
                <span
                  title="Configured via server environment — locked; the key never reaches the browser"
                  className="inline-flex items-center gap-1.5 rounded-md border border-feed-ok/25 bg-feed-ok/[0.08] px-2 py-1 text-[0.64rem] font-semibold text-feed-ok"
                >
                  <Lock className="size-3" />
                  Active · server
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-md border border-hairline bg-overlay-weak px-2 py-1 text-[0.64rem] font-medium text-muted-foreground">
                  <KeyRound className="size-3" />
                  Your own key
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {managed.length > 0 && status ? (
        <p className="mt-2 text-[0.66rem] leading-relaxed text-muted-foreground/80">
          Server providers are shared, so each visitor gets {status.limits.perMinute} questions per minute and{" "}
          {status.limits.perDay} per day. Server keys are locked and can&apos;t be viewed or changed from here. Your own key
          has no limits: you pay your provider directly.
        </p>
      ) : (
        <p className="mt-2 text-[0.66rem] leading-relaxed text-muted-foreground/80">
          With your own key there are no rate limits; usage is between you and your provider.
        </p>
      )}
    </div>
  );
}

function WorkspaceTab() {
  const { settings, update, reset } = useSettings();
  const { theme, setTheme } = useTheme();
  const [notifyBlocked, setNotifyBlocked] = useState(false);
  const resetLayout = () => {
    localStorage.removeItem("mb-dock-layout-v2");
    window.location.reload();
  };

  // Turning the toggle on walks the browser permission flow; a denied permission re-disables it.
  const setLiveNotifications = async (on: boolean) => {
    if (!on) {
      update({ liveNotifications: false });
      return;
    }
    if (typeof Notification === "undefined") return;
    let permission = Notification.permission;
    if (permission === "default") permission = await Notification.requestPermission();
    if (permission === "granted") {
      setNotifyBlocked(false);
      update({ liveNotifications: true });
    } else {
      setNotifyBlocked(permission === "denied");
      update({ liveNotifications: false });
    }
  };

  return (
    <div className="divide-y divide-hairline">
      <Row label="Theme" hint="Light, dark, or follow your system setting">
        <Segmented<ThemeChoice>
          value={theme}
          onChange={setTheme}
          options={[
            { value: "light", label: "Light" },
            { value: "dark", label: "Dark" },
            { value: "system", label: "Auto" },
          ]}
        />
      </Row>
      <Row label="Animations" hint="Interface motion — panel slides, shimmer, pulsing dots. Off = instant and calm">
        <Toggle checked={settings.animations} onChange={(animations) => update({ animations })} label="Animations" />
      </Row>
      <Row
        label="Go-live notifications"
        hint={
          notifyBlocked
            ? "Blocked by the browser — allow notifications for this site first"
            : "Browser notification when a channel on the roster goes live"
        }
      >
        <Toggle checked={settings.liveNotifications} onChange={(v) => void setLiveNotifications(v)} label="Go-live notifications" />
      </Row>
      <Row label="OBS overlay" hint="Bare chat feed for a browser source; add ?bg=transparent&channel=<id>&scale=1.4">
        <button
          type="button"
          onClick={() => window.open("/overlay", "_blank")}
          className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-hairline-strong bg-overlay-weak px-2.5 text-[0.72rem] font-medium text-foreground transition-colors hover:bg-overlay-medium"
        >
          <Cast className="size-3.5" />
          Open overlay
        </button>
      </Row>
      <Row label="Panel layout" hint="Restore the default arrangement of panels">
        <button
          type="button"
          onClick={resetLayout}
          className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-hairline-strong bg-overlay-weak px-2.5 text-[0.72rem] font-medium text-foreground transition-colors hover:bg-overlay-medium"
        >
          <RotateCcw className="size-3.5" />
          Reset layout
        </button>
      </Row>
      <Row label="Settings" hint="Restore every setting and remove all filters">
        <button
          type="button"
          onClick={reset}
          className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-feed-danger/30 bg-feed-danger/[0.08] px-2.5 text-[0.72rem] font-medium text-feed-danger transition-colors hover:bg-feed-danger/[0.14]"
        >
          <RotateCcw className="size-3.5" />
          Reset all
        </button>
      </Row>
    </div>
  );
}

/** Dockable settings panel: tabbed so new sections slot in without bloating the chat header. */
export function SettingsPane() {
  const [tab, setTab] = useState<TabId>("chat");
  return (
    <div className="flex h-full flex-col overflow-hidden bg-card">
      <header className="flex h-11 flex-none items-center gap-1 border-b border-hairline px-2.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            aria-pressed={tab === t.id}
            className={cn(
              "rounded-lg px-2.5 py-1.5 text-[0.76rem] font-medium transition-colors",
              tab === t.id ? "bg-overlay-medium text-foreground" : "text-muted-foreground hover:bg-overlay-weak hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </header>
      <div className="flex-1 overflow-y-auto px-4 py-3 mb-scroll">
        {tab === "chat" ? <ChatTab /> : tab === "filters" ? <FiltersTab /> : tab === "assistant" ? <AssistantTab /> : <WorkspaceTab />}
      </div>
    </div>
  );
}

"use client";

import { Activity, MonitorPlay, Sparkles } from "lucide-react";

import { PlatformGlyph } from "@/components/feed/platform-glyph";
import { Card } from "./card";
import { useAdmin } from "./admin-shell";
import { formatCount, LiveChip, StatusDot } from "./ui";

/** Show status (roster live state) and infrastructure health (relay, bridge, db, assistant). */
export function HealthPanel() {
  const { status, streamers } = useAdmin();
  const live = streamers.filter((s) => s.live);

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      <Card
        title="Show status"
        hint="Roster live state, straight from the platform APIs"
        icon={MonitorPlay}
        status={live.length > 0 ? <LiveChip label={`${live.length} live`} /> : undefined}
      >
        <ul className="flex flex-col gap-2.5">
          {streamers.map((s) => (
            <li key={s.id} className="flex items-center gap-2.5">
              <StatusDot ok={s.live} />
              <span className="min-w-0 flex-1 truncate text-[0.84rem] font-medium text-foreground">{s.name}</span>
              <span className="flex items-center gap-1">
                {s.platforms.map((p) => (
                  <PlatformGlyph key={p} platform={p} className="size-3" />
                ))}
              </span>
              <span className="w-20 text-right font-mono text-[0.72rem] tabular-nums text-muted-foreground">
                {s.live ? formatCount(s.viewers) : "offline"}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 border-t border-hairline pt-2.5 text-[0.68rem] text-muted-foreground/80">
          {live.length > 0
            ? `${formatCount(live.reduce((n, s) => n + s.viewers, 0))} combined viewers`
            : "Nobody is live right now"}
        </p>
      </Card>

      <Card title="Infrastructure" hint="Relay, X bridge, assistant, deployment flags" icon={Activity}>
        <ul className="flex flex-col gap-3 text-[0.8rem]">
          <li className="flex items-center gap-2.5">
            <StatusDot ok={status ? status.relay.configured && status.relay.ok : null} />
            <span className="flex-1 text-foreground/90">Relay</span>
            <span className="font-mono text-[0.7rem] text-muted-foreground">
              {!status?.relay.configured
                ? "not configured"
                : status.relay.ok
                  ? `${status.relay.chatters ?? 0} chatters · ${status.relay.mps ?? 0} msg/s`
                  : "unreachable"}
            </span>
          </li>
          <li className="flex items-center gap-2.5">
            <StatusDot ok={(status?.xBridge.buffered ?? 0) > 0 ? true : null} />
            <span className="flex-1 text-foreground/90">X bridge buffer</span>
            <span className="font-mono text-[0.7rem] text-muted-foreground">{status?.xBridge.buffered ?? 0} messages</span>
          </li>
          <li className="flex items-center gap-2.5">
            <StatusDot ok={status ? (status.database.configured ? status.database.ok : null) : null} />
            <span className="flex-1 text-foreground/90">Database</span>
            <span className="font-mono text-[0.7rem] text-muted-foreground">
              {!status
                ? "…"
                : !status.database.configured
                  ? "in-memory (state resets on restart)"
                  : status.database.ok
                    ? `sqlite · ${status.database.polls} polls stored`
                    : "configured but failed to open"}
            </span>
          </li>
          <li className="flex items-center gap-2.5">
            <Sparkles className="size-3.5 flex-none text-muted-foreground" />
            <span className="flex-1 text-foreground/90">Assistant</span>
            <span className="font-mono text-[0.7rem] text-muted-foreground">
              {!status
                ? "…"
                : !status.assistant.enabled
                  ? "disabled"
                  : status.assistant.managed.length > 0
                    ? `server: ${status.assistant.managed.join(", ")}`
                    : "BYOK only"}
            </span>
          </li>
          {status?.assistant.enabled && status.assistant.managed.length > 0 ? (
            <li className="flex items-center gap-2.5 pl-6">
              <span className="flex-1 text-[0.72rem] text-muted-foreground">Visitor limits</span>
              <span className="font-mono text-[0.7rem] text-muted-foreground">
                {status.assistant.perMinute}/min · {status.assistant.perDay}/day
              </span>
            </li>
          ) : null}
        </ul>
        {status ? (
          <p className="mt-3 border-t border-hairline pt-2.5 text-[0.68rem] text-muted-foreground/80">
            Demo {status.flags.demoDisabled ? "disabled" : "enabled"} · auth via {status.flags.keySource} ·{" "}
            {status.flags.siteUrl}
          </p>
        ) : null}
      </Card>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";

import { PlatformGlyph } from "@/components/feed/platform-glyph";
import type { XMention } from "@/lib/x/mentions";

// ISR revalidates every 6 h server-side; client just needs to load once per session.
const POLL_MS = 6 * 60 * 60_000;

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function initials(name: string): string {
  const p = name.trim().split(/\s+/);
  return (p.length >= 2 ? p[0][0] + p[1][0] : name.slice(0, 2)).toUpperCase();
}

function MentionRow({ m }: { m: XMention }) {
  return (
    <li className="flex gap-2.5 border-b border-hairline px-3 py-2.5 transition-colors hover:bg-overlay-weak">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-hairline bg-overlay-weak text-[0.66rem] font-semibold text-foreground/85">
        {initials(m.name)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-[0.76rem]">
          <span className="truncate font-semibold text-foreground">{m.name}</span>
          <span className="truncate text-muted-foreground">@{m.handle}</span>
          <span className="ml-auto shrink-0 text-[0.66rem] text-muted-foreground">
            {timeAgo(m.publishedAt)}
          </span>
        </div>
        <p className="mt-0.5 text-[0.8rem] leading-snug text-foreground/90">{m.text}</p>
        {m.tweetUrl !== "#" && (
          <div className="mt-1.5 text-[0.66rem] text-muted-foreground">
            <a
              href={m.tweetUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
            >
              <ExternalLink className="size-3" /> View
            </a>
          </div>
        )}
      </div>
    </li>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-14">
      <PlatformGlyph platform="x" className="size-8 opacity-[0.15]" />
      <p className="text-[0.74rem] text-muted-foreground/50">No mentions found</p>
    </div>
  );
}

export function XMentionsPane() {
  const [mentions, setMentions] = useState<XMention[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/x/mentions");
        if (res.ok) {
          const data = (await res.json()) as XMention[];
          setMentions(data);
        }
      } catch {
        // Leave as empty — empty state will show
      } finally {
        setLoading(false);
      }
    };
    void load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, []);

  // Show "cached" badge when the freshest mention is older than 6 h
  const isStale =
    !loading &&
    mentions.length > 0 &&
    mentions.every((m) => Date.now() - new Date(m.publishedAt).getTime() > 6 * 60 * 60_000);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-card">
      <header className="flex h-9 flex-none items-center gap-2 border-b border-hairline px-3">
        <span className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          X Mentions
        </span>
        {isStale && (
          <span className="rounded bg-overlay-weak px-1.5 py-0.5 text-[0.58rem] text-muted-foreground/50">
            cached
          </span>
        )}
        <PlatformGlyph platform="x" className="ml-auto size-3.5" />
      </header>

      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <span className="text-[0.72rem] text-muted-foreground/30">Loading…</span>
        </div>
      ) : mentions.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="flex-1 overflow-y-auto mb-scroll">
          {mentions.map((m) => (
            <MentionRow key={m.id} m={m} />
          ))}
        </ul>
      )}
    </div>
  );
}

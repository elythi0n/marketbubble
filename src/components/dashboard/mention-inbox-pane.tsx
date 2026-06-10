"use client";

import { AtSign, Inbox, Trash2 } from "lucide-react";

import { Feed } from "@/components/feed/feed";
import { clearMentions, useMentions } from "@/lib/mentions/store";
import { useSettings } from "@/lib/settings/settings-context";

/**
 * Every message across all merged channels that mentions one of your configured names
 * (Settings → Chat → Mention names). Session-only, newest at the bottom, like a feed.
 */
export function MentionInboxPane() {
  const { settings } = useSettings();
  const mentions = useMentions();
  const configured = settings.mentionNames.trim().length > 0;

  if (!configured) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2.5 bg-card px-6 text-center">
        <AtSign className="size-7 text-muted-foreground/60" />
        <p className="text-sm font-medium text-foreground/90">No names configured</p>
        <p className="max-w-xs text-xs leading-relaxed text-muted-foreground">
          Add the names to watch for in <b className="text-foreground/85">Settings → Chat → Mention names</b> (comma
          separated). Every message across all channels that contains one lands here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-card">
      <header className="flex h-11 flex-none items-center gap-2 border-b border-white/[0.07] px-3">
        <Inbox className="size-4 text-muted-foreground" />
        <span className="text-[0.78rem] font-semibold text-foreground">Mentions</span>
        {mentions.length > 0 ? (
          <span className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[0.62rem] tabular-nums text-muted-foreground">
            {mentions.length}
          </span>
        ) : null}
        <button
          type="button"
          onClick={clearMentions}
          disabled={mentions.length === 0}
          title="Clear mentions"
          aria-label="Clear mentions"
          className="ml-auto inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground disabled:opacity-30"
        >
          <Trash2 className="size-3.5" />
        </button>
      </header>
      <Feed
        messages={mentions}
        showSource
        scale={1.1}
        density={settings.density}
        showTimestamps={settings.showTimestamps}
        emptyIcon={AtSign}
        emptyLabel="No mentions yet"
        emptySubtext="Messages that name you will collect here"
      />
    </div>
  );
}

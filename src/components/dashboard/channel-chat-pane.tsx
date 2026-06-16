"use client";

import { useEffect, useState } from "react";
import { AtSign, MessagesSquare, X } from "lucide-react";

import { Feed } from "@/components/feed/feed";
import { PlatformGlyph } from "@/components/feed/platform-glyph";
import { useUserCard } from "@/components/feed/user-card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { createKickProvider } from "@/lib/chat/providers/kick-pusher";
import { createTwitchIRCProvider } from "@/lib/chat/providers/twitch-irc";
import type { ChatProvider, ProviderStatus } from "@/lib/chat/provider";
import { useFeed } from "@/lib/chat/use-feed";
import { markDockActivity } from "@/lib/dock-activity";
import { PLATFORM_LABEL, type Platform } from "@/lib/feed/types";
import { useSettings } from "@/lib/settings/settings-context";
import { useFilteredMessages } from "@/lib/settings/use-filtered-messages";
import { useChannel } from "@/lib/streamers/channel-context";
import { useChatRowMenu } from "./chat-row-menu";
import { StreamerAvatar } from "./streamer-avatar";

export interface ChannelChatParams {
  streamerId: string;
  /** Limit to one platform's chat; otherwise all of the streamer's video-chat platforms. */
  platform?: Platform;
}

const STATUS_LABEL: Record<ProviderStatus, string> = {
  open: "Connected",
  connecting: "Connecting…",
  closed: "Disconnected",
  error: "Connection error",
};

/**
 * A dedicated chat panel for one streamer (optionally one platform), opened from the right-click
 * menu. Runs its own connections, so it works regardless of the main feed's merge/selection state
 * and keeps streaming while tabbed in the background or popped out.
 */
export function ChannelChatPane({ streamerId, platform }: ChannelChatParams) {
  const { streamers } = useChannel();
  const { settings } = useSettings();
  const streamer = streamers.find((s) => s.id === streamerId);
  const [focusAuthor, setFocusAuthor] = useState<string | null>(null);
  const { onRowContextMenu, menuElement } = useChatRowMenu({ focusAuthor, setFocusAuthor });

  const twitch = platform === undefined || platform === "twitch" ? streamer?.handles.twitch : undefined;
  const kick = platform === undefined || platform === "kick" ? streamer?.handles.kick : undefined;

  const makeProviders = (): ChatProvider[] => [
    ...(twitch ? [createTwitchIRCProvider({ channel: twitch })] : []),
    ...(kick ? [createKickProvider({ slug: kick })] : []),
  ];
  const { messages, statuses } = useFeed(makeProviders, `${streamerId}:${platform ?? "all"}:${twitch ?? ""}:${kick ?? ""}`);

  const { openUserCard, userCardElement } = useUserCard({ messages, focusAuthor, setFocusAuthor });

  const filtered = useFilteredMessages(messages);
  const shown = focusAuthor
    ? filtered.filter((m) => m.author.toLowerCase() === focusAuthor.toLowerCase())
    : filtered;

  // New-activity dot on this panel's tab while it's in the background.
  const panelId = platform ? `chat-${streamerId}-${platform}` : `chat-${streamerId}`;
  const lastMsgId = messages.length > 0 ? messages[messages.length - 1].id : null;
  useEffect(() => {
    if (lastMsgId) markDockActivity(panelId);
  }, [lastMsgId, panelId]);

  if (!streamer || (!twitch && !kick)) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 bg-card px-6 text-center">
        <MessagesSquare className="size-7 text-muted-foreground/60" />
        <p className="text-sm text-muted-foreground">
          {streamer ? "This channel has no chat on the selected platform." : "Channel is no longer in the roster."}
        </p>
        <p className="text-xs text-muted-foreground/70">You can close this panel.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-card">
      <TooltipProvider>
        <header className="flex h-11 flex-none items-center gap-2.5 border-b border-hairline px-3">
          <StreamerAvatar streamer={streamer} size={24} showLive={false} />
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-[0.82rem] font-semibold text-foreground">{streamer.name}</span>
            {platform ? (
              <span className="flex flex-none items-center gap-1 rounded-md border border-hairline bg-overlay-weak px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide text-muted-foreground">
                <PlatformGlyph platform={platform} className="size-3" />
                {PLATFORM_LABEL[platform]}
              </span>
            ) : null}
            {streamer.live ? (
              <span className="size-1.5 flex-none rounded-full bg-feed-ok" title="Live" />
            ) : null}
          </div>

          <span className="ml-auto flex flex-none items-center gap-2 rounded-lg bg-overlay-weak px-2.5 py-1.5">
            {Object.entries(statuses).map(([id, status]) => {
              const p = id.split(":")[0] as Platform;
              const connected = status === "open";
              return (
                <Tooltip key={id}>
                  <TooltipTrigger
                    render={
                      <span className={`flex items-center transition-opacity ${connected ? "opacity-100" : "opacity-30"}`}>
                        <PlatformGlyph platform={p} className="size-4" />
                      </span>
                    }
                  />
                  <TooltipContent>
                    {PLATFORM_LABEL[p]} · {STATUS_LABEL[status]}
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </span>
        </header>
      </TooltipProvider>

      {focusAuthor ? (
        <div className="flex flex-none items-center gap-2 border-b border-hairline bg-feed-link/[0.07] px-3 py-1.5">
          <AtSign className="size-3.5 flex-none text-feed-link" />
          <span className="min-w-0 truncate text-[0.74rem] text-foreground/90">
            Focused on <b className="font-semibold">{focusAuthor}</b>
          </span>
          <button
            type="button"
            onClick={() => setFocusAuthor(null)}
            aria-label="Clear author focus"
            className="ml-auto flex size-5 flex-none items-center justify-center rounded text-muted-foreground transition-colors hover:bg-overlay-medium hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ) : null}

      <Feed
        messages={shown}
        scale={1.15}
        density={settings.density}
        showTimestamps={settings.showTimestamps}
        showDeleted={settings.showDeleted}
        onAuthorClick={openUserCard}
        onRowContextMenu={onRowContextMenu}
        emptyIcon={MessagesSquare}
        emptyLabel={streamer.live ? "Chat is quiet" : `${streamer.name} is offline`}
        emptySubtext="Messages appear here as people chat"
      />
      {menuElement}
      {userCardElement}
    </div>
  );
}

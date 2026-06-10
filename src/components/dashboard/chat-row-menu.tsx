"use client";

import { useCallback, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { AtSign, Copy, EyeOff, Highlighter, MessagesSquare, VolumeX } from "lucide-react";

import { ContextMenu, type MenuEntry } from "@/components/ui/context-menu";
import { hasDock, openChannelChat } from "@/lib/dock-api";
import { PLATFORM_LABEL, type FeedMessage } from "@/lib/feed/types";
import { useSettings } from "@/lib/settings/settings-context";
import { useChannel } from "@/lib/streamers/channel-context";

/** Message body as plain text (for copy). */
function messageText(m: FeedMessage): string {
  return m.segments
    .map((seg) =>
      seg.type === "text" ? seg.text
      : seg.type === "emote" ? seg.code
      : seg.type === "mention" ? `@${seg.user}`
      : seg.type === "cashtag" ? `$${seg.symbol}`
      : seg.type === "link" ? seg.text
      : "",
    )
    .join("")
    .trim();
}

interface RowMenuOptions {
  focusAuthor: string | null;
  setFocusAuthor: (author: string | null) => void;
  /** When set (merged chat), the menu offers hiding the message's channel from the feed. */
  onHideChannel?: (streamerId: string) => void;
}

/**
 * Right-click menu for chat rows: author focus / highlight / mute, copy, and opening the message's
 * channel as its own chat panel (full or platform-scoped). Shared by the main and channel panes.
 */
export function useChatRowMenu({ focusAuthor, setFocusAuthor, onHideChannel }: RowMenuOptions): {
  onRowContextMenu: (e: ReactMouseEvent, m: FeedMessage) => void;
  menuElement: ReactNode;
} {
  const { streamers } = useChannel();
  const { settings, addFilter, removeFilter } = useSettings();
  const [menu, setMenu] = useState<{ x: number; y: number; message: FeedMessage } | null>(null);

  const onRowContextMenu = useCallback((e: ReactMouseEvent, m: FeedMessage) => {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, message: m });
  }, []);

  let menuElement: ReactNode = null;
  if (menu) {
    const m = menu.message;
    const focused = focusAuthor?.toLowerCase() === m.author.toLowerCase();
    const streamer = m.channel
      ? streamers.find((s) => Object.values(s.handles).some((h) => h?.toLowerCase() === m.channel?.toLowerCase()))
      : undefined;

    // Existing author rules from the right-click menu use the exact name as the pattern, so an
    // exact (case-insensitive) match identifies them for toggling off.
    const authorRule = (action: "highlight" | "mute") =>
      settings.filters.find(
        (f) => f.field === "author" && f.action === action && f.pattern.toLowerCase() === m.author.toLowerCase(),
      );
    const highlightRule = authorRule("highlight");
    const muteRule = authorRule("mute");

    const entries: MenuEntry[] = [
      { type: "heading", label: m.author },
      {
        label: focused ? "Clear author focus" : `Focus ${m.author}`,
        icon: AtSign,
        onSelect: () => setFocusAuthor(focused ? null : m.author),
      },
      highlightRule
        ? {
            label: `Unhighlight ${m.author}`,
            icon: Highlighter,
            onSelect: () => removeFilter(highlightRule.id),
          }
        : {
            label: `Highlight ${m.author}`,
            icon: Highlighter,
            onSelect: () => addFilter({ pattern: m.author, action: "highlight", field: "author" }),
          },
      muteRule
        ? {
            label: `Unmute ${m.author}`,
            icon: VolumeX,
            onSelect: () => removeFilter(muteRule.id),
          }
        : {
            label: `Mute ${m.author}`,
            icon: VolumeX,
            danger: true,
            onSelect: () => addFilter({ pattern: m.author, action: "mute", field: "author" }),
          },
      { type: "separator" },
      {
        label: "Copy message",
        icon: Copy,
        onSelect: () => {
          navigator.clipboard?.writeText(messageText(m)).catch(() => {});
        },
      },
    ];

    if (streamer && hasDock()) {
      entries.push(
        { type: "separator" },
        { type: "heading", label: streamer.name },
        {
          label: `Open ${streamer.name}'s chat`,
          icon: MessagesSquare,
          onSelect: () => openChannelChat(streamer),
        },
      );
      if (m.platform !== "x" && streamer.handles[m.platform]) {
        entries.push({
          label: `Open ${PLATFORM_LABEL[m.platform]}-only chat`,
          icon: MessagesSquare,
          onSelect: () => openChannelChat(streamer, m.platform),
        });
      }
      if (onHideChannel) {
        entries.push({
          label: `Hide ${streamer.name} from this feed`,
          icon: EyeOff,
          onSelect: () => onHideChannel(streamer.id),
        });
      }
    }

    menuElement = <ContextMenu x={menu.x} y={menu.y} entries={entries} onClose={() => setMenu(null)} />;
  }

  return { onRowContextMenu, menuElement };
}

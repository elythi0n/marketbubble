"use client";

import { Gift, Star, Users, type LucideIcon } from "lucide-react";
import type { CSSProperties } from "react";

import { PlatformGlyph } from "@/components/feed/platform-glyph";
import { useFeedContext } from "@/lib/chat/feed-context";
import type { FeedMessage, MessageType } from "@/lib/feed/types";
import styles from "./gifts-pane.module.css";

export const GIFT_TYPES = new Set<MessageType>(["giftsub", "sub", "resub", "raid"]);

interface GiftView {
  icon: LucideIcon;
  accent: string;
  detail: string;
  amount: string | null;
}

function describe(message: FeedMessage): GiftView {
  const e = message.event ?? {};
  switch (message.type) {
    case "giftsub": {
      const count = e.count ?? 1;
      return { icon: Gift, accent: "var(--feed-warn)", detail: `gifted ${count} sub${count === 1 ? "" : "s"}`, amount: `×${count}` };
    }
    case "raid":
      return { icon: Users, accent: "var(--feed-ok)", detail: "raided the channel", amount: (e.viewers ?? 0).toLocaleString() };
    case "resub":
      return { icon: Star, accent: "var(--feed-link)", detail: "resubscribed", amount: e.months ? `${e.months}mo` : null };
    case "sub":
    default:
      return { icon: Star, accent: "var(--feed-link)", detail: "subscribed", amount: null };
  }
}

export function GiftsPane() {
  const { messages } = useFeedContext();
  const gifts = messages.filter((m) => m.type && GIFT_TYPES.has(m.type)).slice(-50).reverse();

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <Gift className="size-4 text-muted-foreground" />
        <span className={styles.headerTitle}>Recent gifts</span>
        <span className={styles.headerCount}>{gifts.length}</span>
      </header>

      {gifts.length === 0 ? (
        <div className={styles.empty}>
          <Gift className={styles.emptyIcon} />
          <span className={styles.emptyLabel}>No gifts yet</span>
          <span className={styles.emptySubtext}>Subs, gift subs, and raids appear here as they happen</span>
        </div>
      ) : (
        <ul className={`${styles.list} mb-scroll`}>
          {gifts.map((g) => {
            const view = describe(g);
            const Icon = view.icon;
            return (
              <li key={g.id} className={styles.card} style={{ ["--gift-accent" as keyof CSSProperties]: view.accent } as CSSProperties}>
                <span className={styles.iconWrap}>
                  <Icon className="size-4" />
                </span>
                <div className={styles.body}>
                  <div className={styles.nameRow}>
                    <span className={styles.name}>{g.author}</span>
                    <PlatformGlyph platform={g.platform} className={styles.nameGlyph} />
                  </div>
                  <span className={styles.detail}>
                    {view.detail}
                    {g.channel ? <span className={styles.channel}> · {g.channel}</span> : null}
                  </span>
                </div>
                {view.amount ? <span className={styles.amount}>{view.amount}</span> : null}
                <span className={styles.time}>{g.ts}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

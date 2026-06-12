import type { FeedMessage } from "./types";

/** Message body flattened to plain text (copy, history lists, search previews). */
export function messageText(m: FeedMessage): string {
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

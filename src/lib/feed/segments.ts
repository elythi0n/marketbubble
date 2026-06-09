import type { Segment } from "./types";

export interface EmoteMeta {
  url: string;
}

const MENTION = /^@([\w]{1,30})[,.!?]?$/;
const CASHTAG = /^\$([A-Za-z]{1,6})[,.!?]?$/;
const LINK = /^https?:\/\/\S+$/i;

/**
 * Split raw message text into renderable segments. Whitespace is preserved so emotes, links, and
 * mentions keep their spacing. `emotes` maps an exact token (e.g. "Kappa") to its image URL.
 */
export function parseSegments(text: string, emotes: Record<string, EmoteMeta> = {}): Segment[] {
  const out: Segment[] = [];
  let buffer = "";

  const flush = () => {
    if (buffer) {
      out.push({ type: "text", text: buffer });
      buffer = "";
    }
  };

  for (const token of text.split(/(\s+)/)) {
    if (token === "") continue;
    if (token.trim() === "") {
      buffer += token;
      continue;
    }

    const emote = Object.prototype.hasOwnProperty.call(emotes, token) ? emotes[token] : undefined;
    const mention = MENTION.exec(token);
    const cashtag = CASHTAG.exec(token);

    if (emote) {
      flush();
      out.push({ type: "emote", code: token, url: emote.url });
    } else if (LINK.test(token)) {
      flush();
      out.push({ type: "link", href: token, text: token.replace(/^https?:\/\//, "") });
    } else if (cashtag) {
      flush();
      out.push({ type: "cashtag", symbol: cashtag[1].toUpperCase() });
      const trailing = token.slice(cashtag[0].length);
      if (trailing) buffer += trailing;
    } else if (mention) {
      flush();
      out.push({ type: "mention", user: mention[1] });
      // Preserve any trailing punctuation the mention regex tolerated.
      const trailing = token.slice(mention[0].length || token.length);
      if (trailing) buffer += trailing;
    } else {
      buffer += token;
    }
  }

  flush();
  return out;
}

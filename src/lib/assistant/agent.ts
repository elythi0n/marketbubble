import { ANTHROPIC_URL, OPENAI_COMPAT_URL, PROVIDER_LABEL, type AssistantProvider } from "./config";
import { getArchive } from "./archive";
import { runTool, TOOL_DEFS, type ToolContext } from "./tools";

/**
 * "managed" routes through our streaming proxy, which attaches the server-held key (and rate
 * limits per chatter). "byok" calls the provider directly from the browser with the user's
 * in-memory key — it never touches our server.
 */
export type AssistantAuth = { mode: "managed" } | { mode: "byok"; key: string };

export type TurnItem =
  | { kind: "text"; role: "user" | "assistant"; text: string }
  | { kind: "tool_use"; name: string; args: string }
  | { kind: "tool_result"; name: string; json: string }
  | { kind: "error"; text: string };

export type AskEvent =
  | { kind: "text"; text: string }
  | { kind: "tool_use"; name: string; args: string }
  | { kind: "tool_result"; name: string; json: string }
  | { kind: "done"; inputTokens: number; outputTokens: number }
  | { kind: "error"; message: string };

const MAX_ROUNDS = 4;
const MAX_TOOL_RESULT_CHARS = 6000;

function buildSystemPrompt(ctx: ToolContext): string {
  const live =
    ctx.streamers
      .filter((s) => s.live)
      .map((s) => `${s.name} (${s.livePlatform ?? "x"}, ${s.viewers.toLocaleString()} viewers)`)
      .join("; ") || "none";
  return `You are the MarketBubble assistant, a concise copilot for the MarketBubble dashboard: a unified livestream workspace that merges Twitch, Kick and X chat with live market data. MarketBubble is also a live markets show hosted by FaZe Banks (simulcast on Twitch and Kick, plus an X broadcast) and Blknoiz06 (X broadcast), presented with Polymarket; use the get_show_info tool for details about the show, schedule, hosts, or roster.

Your tools read the CURRENT browser session's data only: an in-memory chat archive (messages seen since this tab opened, while the assistant opt-in is on), live channel status, market tickers, Polymarket prediction markets, and feed stats. There is no server or database behind you. If something didn't happen this session, the tools cannot see it; say so plainly instead of guessing.

When the question touches chat content, sentiment, specific users, channels, markets, or predictions, call the relevant tool first and answer strictly from its results. Never invent chat messages or numbers.

Style: direct and compact. Short sentences, bullets for lists, no hedging. Plain punctuation only: never use em dashes (—); use a comma, a colon, or a new sentence instead.

Current time: ${new Date().toString()}
Live channels: ${live}
Archived messages this session: ${getArchive().length}`;
}

async function execTool(name: string, input: unknown, ctx: ToolContext): Promise<string> {
  let json: string;
  try {
    json = JSON.stringify(await runTool(name, input, ctx));
  } catch (e) {
    json = JSON.stringify({ error: e instanceof Error ? e.message : "tool failed" });
  }
  return json.length > MAX_TOOL_RESULT_CHARS ? `${json.slice(0, MAX_TOOL_RESULT_CHARS)}…(truncated)` : json;
}

/** Translates provider auth failures into something a human can act on. */
function friendlyError(provider: AssistantProvider, auth: AssistantAuth, status: number, raw: string): string {
  if (status === 401 || /invalid x-api-key|incorrect api key|invalid api key/i.test(raw)) {
    return auth.mode === "byok"
      ? `Your ${PROVIDER_LABEL[provider]} key is invalid. Forget it (key icon above) and paste a new one.`
      : `The server's ${PROVIDER_LABEL[provider]} key was rejected. Tell the operator to check it.`;
  }
  return raw;
}

export interface RunOptions {
  provider: AssistantProvider;
  auth: AssistantAuth;
  model: string;
  /** Prior conversation; only text turns are replayed to the model. */
  history: TurnItem[];
  question: string;
  context: ToolContext;
  signal: AbortSignal;
  onEvent: (ev: AskEvent) => void;
}

export async function runAssistant(opts: RunOptions): Promise<void> {
  try {
    if (opts.provider === "anthropic") await runAnthropic(opts);
    else await runOpenAI(opts);
  } catch (e) {
    if (opts.signal.aborted) return;
    opts.onEvent({ kind: "error", message: e instanceof Error ? e.message : "Request failed" });
  }
}

function textHistory(history: TurnItem[]): { role: "user" | "assistant"; content: string }[] {
  return history.filter((t): t is Extract<TurnItem, { kind: "text" }> => t.kind === "text").map((t) => ({ role: t.role, content: t.text }));
}

// ── Anthropic Messages API (raw HTTP + SSE, direct from the browser) ───────────
// Raw fetch instead of @anthropic-ai/sdk: the SDK's node: imports don't bundle cleanly for a
// client-only Next.js chunk, and the streaming protocol below is the documented SSE format.

type AnthropicBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown };

interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | (AnthropicBlock | { type: "tool_result"; tool_use_id: string; content: string })[];
}

async function runAnthropic({ auth, model, history, question, context, signal, onEvent }: RunOptions) {
  const tools = TOOL_DEFS.map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema }));
  const system = buildSystemPrompt(context);
  const messages: AnthropicMessage[] = [...textHistory(history), { role: "user", content: question }];

  const url = auth.mode === "managed" ? "/api/assistant/proxy?provider=anthropic" : ANTHROPIC_URL;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (auth.mode === "byok") {
    headers["x-api-key"] = auth.key;
    headers["anthropic-version"] = "2023-06-01";
    // Key is user-supplied and held in memory only; calls go browser → Anthropic directly.
    headers["anthropic-dangerous-direct-browser-access"] = "true";
  }

  let inputTokens = 0;
  let outputTokens = 0;

  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    const res = await fetch(url, {
      method: "POST",
      signal,
      headers,
      body: JSON.stringify({ model, max_tokens: 16000, stream: true, system, messages, tools }),
    });
    if (!res.ok || !res.body) {
      let message = `Anthropic request failed (${res.status})`;
      try {
        const err = (await res.json()) as { error?: { message?: string } };
        if (err.error?.message) message = err.error.message;
      } catch {}
      onEvent({ kind: "error", message: friendlyError("anthropic", auth, res.status, message) });
      return;
    }

    // Reassemble content blocks from the SSE stream (text deltas + tool_use input JSON deltas).
    const blocks: (AnthropicBlock & { partialJson?: string })[] = [];
    let stopReason = "";

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        let ev: {
          type: string;
          index?: number;
          content_block?: { type: string; id?: string; name?: string };
          delta?: { type?: string; text?: string; partial_json?: string; stop_reason?: string };
          message?: { usage?: { input_tokens?: number } };
          usage?: { output_tokens?: number };
          error?: { message?: string };
        };
        try {
          ev = JSON.parse(line.slice(6));
        } catch {
          continue;
        }
        switch (ev.type) {
          case "message_start":
            inputTokens += ev.message?.usage?.input_tokens ?? 0;
            break;
          case "content_block_start":
            if (ev.content_block?.type === "tool_use") {
              blocks[ev.index ?? blocks.length] = { type: "tool_use", id: ev.content_block.id ?? "", name: ev.content_block.name ?? "", input: {}, partialJson: "" };
            } else if (ev.content_block?.type === "text") {
              blocks[ev.index ?? blocks.length] = { type: "text", text: "" };
            }
            break;
          case "content_block_delta": {
            const block = ev.index !== undefined ? blocks[ev.index] : undefined;
            if (ev.delta?.type === "text_delta" && ev.delta.text) {
              if (block?.type === "text") block.text += ev.delta.text;
              onEvent({ kind: "text", text: ev.delta.text });
            } else if (ev.delta?.type === "input_json_delta" && block?.type === "tool_use") {
              block.partialJson = (block.partialJson ?? "") + (ev.delta.partial_json ?? "");
            }
            break;
          }
          case "message_delta":
            if (ev.delta?.stop_reason) stopReason = ev.delta.stop_reason;
            outputTokens += ev.usage?.output_tokens ?? 0;
            break;
          case "error":
            onEvent({ kind: "error", message: ev.error?.message ?? "Stream error" });
            return;
        }
      }
    }

    if (stopReason !== "tool_use") break;

    const content: AnthropicBlock[] = blocks
      .filter(Boolean)
      .map((b) => {
        if (b.type === "tool_use") {
          let input: unknown = {};
          try {
            input = b.partialJson ? JSON.parse(b.partialJson) : {};
          } catch {}
          return { type: "tool_use" as const, id: b.id, name: b.name, input };
        }
        return { type: "text" as const, text: b.text };
      })
      .filter((b) => b.type !== "text" || b.text.length > 0);
    messages.push({ role: "assistant", content });

    const results: { type: "tool_result"; tool_use_id: string; content: string }[] = [];
    for (const block of content) {
      if (block.type !== "tool_use") continue;
      onEvent({ kind: "tool_use", name: block.name, args: JSON.stringify(block.input ?? {}) });
      const json = await execTool(block.name, block.input, context);
      onEvent({ kind: "tool_result", name: block.name, json });
      results.push({ type: "tool_result", tool_use_id: block.id, content: json });
    }
    messages.push({ role: "user", content: results });
  }

  onEvent({ kind: "done", inputTokens, outputTokens });
}

// ── OpenAI-compatible (raw fetch + SSE; no SDK dependency) ─────────────────────

interface OAIToolCall {
  id: string;
  name: string;
  args: string;
}

interface OAIMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
}

async function runOpenAI({ provider, auth, model, history, question, context, signal, onEvent }: RunOptions) {
  const tools = TOOL_DEFS.map((t) => ({
    type: "function" as const,
    function: { name: t.name, description: t.description, parameters: t.input_schema },
  }));

  const messages: OAIMessage[] = [
    { role: "system", content: buildSystemPrompt(context) },
    ...textHistory(history).map((t) => ({ role: t.role, content: t.content }) as OAIMessage),
    { role: "user", content: question },
  ];

  const compat = provider === "anthropic" ? "openai" : provider;
  const url = auth.mode === "managed" ? `/api/assistant/proxy?provider=${compat}` : OPENAI_COMPAT_URL[compat];
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (auth.mode === "byok") headers.Authorization = `Bearer ${auth.key}`;

  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    const res = await fetch(url, {
      method: "POST",
      signal,
      headers,
      body: JSON.stringify({ model, stream: true, messages, tools, tool_choice: "auto", max_completion_tokens: 4096 }),
    });
    if (!res.ok || !res.body) {
      let message = `${PROVIDER_LABEL[provider]} request failed (${res.status})`;
      try {
        const err = (await res.json()) as { error?: { message?: string } };
        if (err.error?.message) message = err.error.message;
      } catch {}
      onEvent({ kind: "error", message: friendlyError(provider, auth, res.status, message) });
      return;
    }

    // Accumulate streamed text + tool-call fragments (fragments arrive keyed by index).
    let text = "";
    let finish = "";
    const pending = new Map<number, OAIToolCall>();

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const data = line.startsWith("data: ") ? line.slice(6).trim() : null;
        if (!data || data === "[DONE]") continue;
        let chunk: {
          choices?: {
            delta?: { content?: string; tool_calls?: { index: number; id?: string; function?: { name?: string; arguments?: string } }[] };
            finish_reason?: string | null;
          }[];
        };
        try {
          chunk = JSON.parse(data);
        } catch {
          continue;
        }
        const choice = chunk.choices?.[0];
        if (!choice) continue;
        if (choice.delta?.content) {
          text += choice.delta.content;
          onEvent({ kind: "text", text: choice.delta.content });
        }
        for (const tc of choice.delta?.tool_calls ?? []) {
          const p = pending.get(tc.index) ?? { id: "", name: "", args: "" };
          if (tc.id) p.id = tc.id;
          if (tc.function?.name) p.name = tc.function.name;
          if (tc.function?.arguments) p.args += tc.function.arguments;
          pending.set(tc.index, p);
        }
        if (choice.finish_reason) finish = choice.finish_reason;
      }
    }

    if (finish !== "tool_calls" || pending.size === 0) break;

    const calls = [...pending.values()];
    messages.push({
      role: "assistant",
      content: text || null,
      tool_calls: calls.map((c) => ({ id: c.id, type: "function", function: { name: c.name, arguments: c.args } })),
    });
    for (const call of calls) {
      onEvent({ kind: "tool_use", name: call.name, args: call.args || "{}" });
      let input: unknown = {};
      try {
        input = call.args ? JSON.parse(call.args) : {};
      } catch {}
      const json = await execTool(call.name, input, context);
      onEvent({ kind: "tool_result", name: call.name, json });
      messages.push({ role: "tool", content: json, tool_call_id: call.id });
    }
  }

  onEvent({ kind: "done", inputTokens: 0, outputTokens: 0 });
}

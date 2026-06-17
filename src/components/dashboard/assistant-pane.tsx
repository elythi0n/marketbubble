"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  ArrowUp,
  BarChart3,
  Check,
  ChevronDown,
  Hash,
  KeyRound,
  ListOrdered,
  Lock,
  MessagesSquare,
  MonitorPlay,
  Plus,
  Search,
  Sparkles,
  Square,
  TrendingUp,
  TriangleAlert,
  Tv,
  type LucideIcon,
} from "lucide-react";

import { runAssistant, type AskEvent, type TurnItem } from "@/lib/assistant/agent";
import { AI_ENABLED, defaultModel, PROVIDERS, PROVIDER_LABEL, PROVIDER_MODELS, type AssistantProvider } from "@/lib/assistant/config";
import { fetchModels, type ModelOption } from "@/lib/assistant/models";
import { useProviderStatus } from "@/lib/assistant/provider-status";
import { useFlag } from "@/lib/control/client";
import { clearSessionKey, getSessionKey, setSessionKey } from "@/lib/assistant/session-key";
import type { ToolContext } from "@/lib/assistant/tools";
import { useTickers } from "@/lib/markets/tickers-context";
import { useSettings } from "@/lib/settings/settings-context";
import { useChannel } from "@/lib/streamers/channel-context";
import { cn } from "@/lib/utils";

const TOOL_META: Record<string, { icon: LucideIcon; label: string }> = {
  search_chat: { icon: Search, label: "Search chat" },
  get_top_chatters: { icon: ListOrdered, label: "Top chatters" },
  get_live_channels: { icon: MonitorPlay, label: "Live channels" },
  get_market_data: { icon: BarChart3, label: "Market data" },
  get_feed_stats: { icon: Hash, label: "Feed stats" },
  get_predictions: { icon: TrendingUp, label: "Polymarket" },
  get_show_info: { icon: Tv, label: "Show info" },
};

const SUGGESTIONS = [
  "What's chat hyped about right now?",
  "Who are the top chatters this session?",
  "Biggest market movers right now",
  "Summarize the last few minutes of chat",
];

function toolMeta(name: string) {
  return TOOL_META[name] ?? { icon: Search, label: name.replace(/_/g, " ") };
}

function tryPretty(s: string): string {
  try {
    return JSON.stringify(JSON.parse(s), null, 2);
  } catch {
    return s;
  }
}

function isToolError(json: string): boolean {
  try {
    const p = JSON.parse(json);
    return typeof p === "object" && p !== null && "error" in p;
  } catch {
    return false;
  }
}

function argSummary(argsJson: string): string {
  try {
    const entries = Object.entries(JSON.parse(argsJson) as Record<string, unknown>).filter(([, v]) => v !== undefined && v !== "");
    if (entries.length === 0) return "";
    const [k, v] = entries[0];
    const val = String(v);
    return `${k}: ${val.length > 32 ? `${val.slice(0, 32)}…` : val}`;
  } catch {
    return "";
  }
}

function fmtTokens(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

/** Inline markdown: **bold** and `code`, nothing heavier. */
function InlineMd({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("**") && p.endsWith("**") ? (
          <strong key={i} className="font-semibold text-foreground">
            {p.slice(2, -2)}
          </strong>
        ) : p.startsWith("`") && p.endsWith("`") && p.length > 2 ? (
          <code key={i} className="rounded bg-overlay-medium px-1 py-px font-mono text-[0.92em]">
            {p.slice(1, -1)}
          </code>
        ) : (
          p
        ),
      )}
    </>
  );
}

type MdBlock = { type: "p" | "ul" | "ol"; items: string[] };

/** Block markdown: paragraphs, bullet/numbered lists, bold/code inline. No dependency, no HTML. */
function MarkdownLite({ text }: { text: string }) {
  const blocks: MdBlock[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const bullet = /^[-*•]\s+(.*)$/.exec(line);
    const numbered = /^\d+[.)]\s+(.*)$/.exec(line);
    const type: MdBlock["type"] = bullet ? "ul" : numbered ? "ol" : "p";
    const content = bullet?.[1] ?? numbered?.[1] ?? line.replace(/^#+\s*/, "");
    const last = blocks[blocks.length - 1];
    if (last && last.type === type && type !== "p") last.items.push(content);
    else blocks.push({ type, items: [content] });
  }
  return (
    <div className="flex flex-col gap-1.5">
      {blocks.map((b, i) =>
        b.type === "p" ? (
          <p key={i}>
            <InlineMd text={b.items[0]} />
          </p>
        ) : (
          <ul key={i} className="flex flex-col gap-1">
            {b.items.map((item, j) => (
              <li key={j} className="flex gap-2">
                <span className="mt-[0.45em] size-1 flex-none rounded-full bg-muted-foreground/70" aria-hidden />
                <span className="min-w-0">
                  {b.type === "ol" ? <span className="mr-1 font-mono text-[0.85em] text-muted-foreground">{j + 1}.</span> : null}
                  <InlineMd text={item} />
                </span>
              </li>
            ))}
          </ul>
        ),
      )}
    </div>
  );
}

/** One tool invocation: collapsed card with live status, expandable to input/output JSON. */
function ToolCard({ name, args, result }: { name: string; args: string; result: string | null }) {
  const [open, setOpen] = useState(false);
  const pending = result === null;
  const failed = !pending && isToolError(result);
  const meta = toolMeta(name);
  const Icon = meta.icon;
  const summary = argSummary(args);

  return (
    <div className={cn("overflow-hidden rounded-lg border", failed ? "border-feed-danger/30 bg-feed-danger/[0.05]" : "border-hairline bg-overlay-weak")}>
      <button
        type="button"
        onClick={() => !pending && setOpen((v) => !v)}
        disabled={pending}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left"
      >
        <span className="flex size-5 flex-none items-center justify-center rounded bg-overlay-medium">
          <Icon className="size-3 text-muted-foreground" />
        </span>
        <span className="flex-none text-[0.72rem] font-medium text-foreground/90">{meta.label}</span>
        {summary && !open ? <span className="min-w-0 truncate font-mono text-[0.62rem] text-muted-foreground/70">{summary}</span> : null}
        <span className={cn("ml-auto flex flex-none items-center gap-1 text-[0.62rem] font-medium", pending ? "text-muted-foreground" : failed ? "text-feed-danger" : "text-feed-ok")}>
          {pending ? (
            <>
              <span className="size-2.5 animate-spin rounded-full border border-current border-t-transparent" aria-hidden />
              Running
            </>
          ) : failed ? (
            "✕ Error"
          ) : (
            "✓ Done"
          )}
        </span>
        {!pending ? <ChevronDown className={cn("size-3 flex-none text-muted-foreground transition-transform", open && "rotate-180")} /> : null}
      </button>
      {open && result !== null ? (
        <div className="border-t border-hairline px-2.5 py-2">
          <p className="mb-1 text-[0.56rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Output</p>
          <pre className="max-h-44 overflow-auto rounded bg-overlay-medium p-2 font-mono text-[0.64rem] leading-relaxed text-foreground/80 mb-scroll">{tryPretty(result)}</pre>
        </div>
      ) : null}
    </div>
  );
}

/** Pair streamed tool_use/tool_result turns for rendering. */
type RenderItem = Extract<TurnItem, { kind: "text" } | { kind: "error" }> | { kind: "tool"; name: string; args: string; result: string | null };

function pairTools(turns: TurnItem[]): RenderItem[] {
  const out: RenderItem[] = [];
  let i = 0;
  while (i < turns.length) {
    const t = turns[i];
    if (t.kind === "tool_use") {
      const next = turns[i + 1];
      if (next?.kind === "tool_result" && next.name === t.name) {
        out.push({ kind: "tool", name: t.name, args: t.args, result: next.json });
        i += 2;
        continue;
      }
      out.push({ kind: "tool", name: t.name, args: t.args, result: null });
      i += 1;
      continue;
    }
    if (t.kind === "tool_result") {
      i += 1;
      continue;
    }
    out.push(t);
    i += 1;
  }
  return out;
}

/** Centered gate card shared by the opt-in and key-entry states. */
function Gate({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 overflow-y-auto bg-card px-6 py-8 text-center mb-scroll">
      <span className="flex size-11 items-center justify-center rounded-xl border border-hairline bg-overlay-weak">
        <Icon className="size-5 text-muted-foreground" />
      </span>
      <h3 className="text-[0.95rem] font-semibold text-foreground">{title}</h3>
      {children}
    </div>
  );
}

export function AssistantPane() {
  const { settings, update } = useSettings();
  const { streamers } = useChannel();
  const tickers = useTickers();
  const status = useProviderStatus();
  const assistantOn = useFlag("assistant");

  const [byokProvider, setByokProvider] = useState<AssistantProvider>(() => getSessionKey()?.provider ?? "anthropic");
  const [keyInput, setKeyInput] = useState("");
  const [hasKey, setHasKey] = useState(() => getSessionKey() !== null);
  const [sel, setSel] = useState<{ provider: AssistantProvider; model: string }>(() => {
    const p = getSessionKey()?.provider ?? "anthropic";
    return { provider: p, model: defaultModel(p) };
  });
  const [modelOpen, setModelOpen] = useState(false);
  const [modelSearch, setModelSearch] = useState("");
  const [showKeyEntry, setShowKeyEntry] = useState(false);
  const [modelsByProvider, setModelsByProvider] = useState<Partial<Record<AssistantProvider, ModelOption[]>>>({});

  const managed = useMemo(() => status?.managed ?? [], [status]);
  // Providers usable right now: server-configured ones plus the BYOK provider if a key is set.
  const sessionKey = getSessionKey();
  const usable: AssistantProvider[] = [
    ...managed,
    ...(hasKey && sessionKey && !managed.includes(sessionKey.provider) ? [sessionKey.provider] : []),
  ];

  // When status arrives (or the key goes away), make sure the selection points at a usable provider.
  useEffect(() => {
    if (!status) return;
    setSel((cur) => {
      const ok = status.managed.includes(cur.provider) || getSessionKey()?.provider === cur.provider;
      if (ok) return cur;
      const next = status.managed[0] ?? getSessionKey()?.provider;
      return next ? { provider: next, model: defaultModel(next) } : cur;
    });
  }, [status, hasKey]);

  // Fetch each usable provider's live model list (proxy for managed, the user's key for BYOK).
  useEffect(() => {
    let alive = true;
    const key = getSessionKey();
    const wanted: { provider: AssistantProvider; auth: Parameters<typeof fetchModels>[1] }[] = [
      ...managed.map((p) => ({ provider: p, auth: { mode: "managed" as const } })),
      ...(hasKey && key && !managed.includes(key.provider)
        ? [{ provider: key.provider, auth: { mode: "byok" as const, key: key.key } }]
        : []),
    ];
    for (const w of wanted) {
      if (modelsByProvider[w.provider]) continue;
      fetchModels(w.provider, w.auth).then((options) => {
        if (alive) setModelsByProvider((cur) => ({ ...cur, [w.provider]: options }));
      });
    }
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [managed, hasKey]);

  const modelsFor = (p: AssistantProvider): ModelOption[] => modelsByProvider[p] ?? PROVIDER_MODELS[p];

  const [turns, setTurns] = useState<TurnItem[]>([]);
  const [question, setQuestion] = useState("");
  const [running, setRunning] = useState(false);
  const [tokens, setTokens] = useState({ in: 0, out: 0 });

  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Live context the tools read; kept in a ref so a long run sees fresh data without re-renders.
  const ctxRef = useRef<ToolContext>({ streamers, tickers });
  ctxRef.current = { streamers, tickers };

  useEffect(() => () => abortRef.current?.abort(), []);

  const scrollBottom = useCallback(() => {
    requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }));
  }, []);

  const ask = useCallback(
    (raw: string) => {
      const q = raw.trim();
      const key = getSessionKey();
      const isManaged = managed.includes(sel.provider);
      if (!q || running) return;
      if (!isManaged && (!key || key.provider !== sel.provider)) return;
      setQuestion("");
      if (inputRef.current) inputRef.current.style.height = "auto";
      setRunning(true);

      const history = turns;
      setTurns((prev) => [...prev, { kind: "text", role: "user", text: q }]);
      scrollBottom();

      let buf = "";
      const onEvent = (ev: AskEvent) => {
        switch (ev.kind) {
          case "text":
            buf += ev.text;
            setTurns((prev) => {
              const last = prev[prev.length - 1];
              return last?.kind === "text" && last.role === "assistant"
                ? [...prev.slice(0, -1), { ...last, text: buf }]
                : [...prev, { kind: "text", role: "assistant", text: buf }];
            });
            break;
          case "tool_use":
            buf = "";
            setTurns((prev) => [...prev, { kind: "tool_use", name: ev.name, args: ev.args }]);
            break;
          case "tool_result":
            setTurns((prev) => [...prev, { kind: "tool_result", name: ev.name, json: ev.json }]);
            break;
          case "error":
            setTurns((prev) => [...prev, { kind: "error", text: ev.message }]);
            break;
          case "done":
            if (ev.inputTokens > 0) setTokens((t) => ({ in: t.in + ev.inputTokens, out: t.out + ev.outputTokens }));
            break;
        }
        scrollBottom();
      };

      const controller = new AbortController();
      abortRef.current = controller;
      runAssistant({
        provider: sel.provider,
        auth: isManaged ? { mode: "managed" } : { mode: "byok", key: key!.key },
        model: sel.model,
        history,
        question: q,
        context: ctxRef.current,
        signal: controller.signal,
        onEvent,
      }).finally(() => setRunning(false));
    },
    [managed, sel, running, scrollBottom, turns],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
    setRunning(false);
  }, []);

  const submitKey = (e: FormEvent) => {
    e.preventDefault();
    if (!keyInput.trim()) return;
    setSessionKey(byokProvider, keyInput);
    setKeyInput("");
    setHasKey(true);
    setShowKeyEntry(false);
    setSel({ provider: byokProvider, model: defaultModel(byokProvider) });
  };

  const forgetKey = () => {
    stop();
    clearSessionKey();
    setHasKey(false);
    if (managed.length > 0) setSel({ provider: managed[0], model: defaultModel(managed[0]) });
  };

  if (!AI_ENABLED) {
    return (
      <Gate icon={Sparkles} title="Assistant is disabled">
        <p className="max-w-sm text-xs text-muted-foreground">This build ships without the AI assistant.</p>
      </Gate>
    );
  }

  if (!assistantOn) {
    return (
      <Gate icon={Sparkles} title="Assistant is turned off">
        <p className="max-w-sm text-xs text-muted-foreground">The operator has disabled the assistant for now.</p>
      </Gate>
    );
  }

  if (!settings.assistantOptIn) {
    return (
      <Gate icon={Sparkles} title="AI Assistant · opt-in">
        <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
          Chat is kept <b className="text-foreground/85">in memory only</b>, up to{" "}
          {settings.assistantArchiveSize.toLocaleString()} messages (adjustable in Settings). Nothing touches a disk or
          server, and a reload wipes it all.
        </p>
        <ul className="flex max-w-[280px] flex-col gap-1.5 text-left text-[0.72rem] text-muted-foreground">
          {[
            { icon: Search, text: "Search live chat across Twitch, Kick and X" },
            { icon: BarChart3, text: "Live market data and the biggest movers" },
            { icon: TrendingUp, text: "Polymarket prediction markets" },
            { icon: MonitorPlay, text: "Who's live: Banks, Blknoiz06 and the roster" },
            { icon: Tv, text: "The Market Bubble show, schedule and hosts" },
          ].map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-2">
              <Icon className="size-3.5 flex-none text-muted-foreground/70" />
              <span>{text}</span>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => update({ assistantOptIn: true })}
          className="mt-1 inline-flex h-8 items-center gap-1.5 rounded-lg border border-hairline-strong bg-overlay-weak px-3.5 text-[0.8rem] font-medium text-foreground transition-colors hover:bg-overlay-medium"
        >
          <Sparkles className="size-3.5" />
          Enable assistant
        </button>
        <p className="text-[0.66rem] text-muted-foreground/70">Turn it off anytime in Settings → Assistant.</p>
      </Gate>
    );
  }

  if (status === null) {
    return (
      <Gate icon={Sparkles} title="Assistant">
        <span className="size-4 animate-spin rounded-full border border-muted-foreground border-t-transparent" aria-hidden />
      </Gate>
    );
  }

  if ((managed.length === 0 && !hasKey) || showKeyEntry) {
    const byokOptions = PROVIDERS.filter((p) => !managed.includes(p));
    const active = byokOptions.includes(byokProvider) ? byokProvider : byokOptions[0];
    return (
      <Gate icon={KeyRound} title="Bring your own key">
        <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
          Paste an API key to chat. It&apos;s held <b className="text-foreground/85">in memory only</b> and cleared when you
          reload. Requests go straight from your browser to the provider, never through our servers, so there are no rate
          limits: usage is between you and your provider.
        </p>
        <form onSubmit={submitKey} className="flex w-full max-w-xs flex-col gap-2">
          <div className="flex flex-wrap items-center justify-center gap-0.5 self-center rounded-lg border border-hairline bg-overlay-weak p-0.5">
            {byokOptions.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setByokProvider(p)}
                aria-pressed={active === p}
                className={cn(
                  "rounded-md px-2.5 py-1 text-[0.72rem] font-medium transition-colors",
                  active === p ? "bg-overlay-medium text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {PROVIDER_LABEL[p]}
              </button>
            ))}
          </div>
          <input
            type="password"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            placeholder={active === "anthropic" ? "sk-ant-…" : "sk-…"}
            aria-label="API key"
            autoComplete="off"
            className="w-full rounded-lg border border-hairline bg-overlay-weak px-3 py-2 text-center font-mono text-[0.78rem] text-foreground outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-hairline-strong"
          />
          <button
            type="submit"
            disabled={!keyInput.trim()}
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-hairline-strong bg-overlay-weak text-[0.78rem] font-medium text-foreground transition-colors hover:bg-overlay-medium disabled:opacity-35"
          >
            <Check className="size-3.5" />
            Use key for this session
          </button>
        </form>
        {showKeyEntry ? (
          <button
            type="button"
            onClick={() => setShowKeyEntry(false)}
            className="text-[0.68rem] text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
          >
            Back
          </button>
        ) : null}
      </Gate>
    );
  }

  const items = pairTools(turns);
  const selIsManaged = managed.includes(sel.provider);
  const modelLabel = modelsFor(sel.provider).find((m) => m.id === sel.model)?.label ?? sel.model;
  const canSend = question.trim().length > 0 && !running;
  const canAddKey = !hasKey && managed.length < PROVIDERS.length;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-card">
      {/* Header */}
      <header className="flex h-11 flex-none items-center gap-1.5 border-b border-hairline px-3">
        <Sparkles className="size-4 text-muted-foreground" />
        <span className="text-[0.78rem] font-semibold text-foreground">Assistant</span>
        {tokens.in > 0 ? (
          <span className="ml-1 font-mono text-[0.6rem] tabular-nums text-muted-foreground/70">
            {fmtTokens(tokens.in)} in · {fmtTokens(tokens.out)} out
          </span>
        ) : null}
        {hasKey && sessionKey ? (
          <button
            type="button"
            onClick={forgetKey}
            title={`${PROVIDER_LABEL[sessionKey.provider]} key in memory — click to forget now`}
            className="ml-auto inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[0.66rem] font-medium text-muted-foreground transition-colors hover:bg-overlay-weak hover:text-foreground"
          >
            <KeyRound className="size-3.5" />
            <span className="size-1.5 rounded-full bg-feed-ok" aria-hidden />
          </button>
        ) : selIsManaged ? (
          <span
            title="Using this server's provider key — rate limited per visitor"
            className="ml-auto inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[0.66rem] font-medium text-muted-foreground"
          >
            <Lock className="size-3" />
            Server
          </span>
        ) : (
          <span className="ml-auto" aria-hidden />
        )}
        <button
          type="button"
          onClick={() => {
            stop();
            setTurns([]);
            setTokens({ in: 0, out: 0 });
          }}
          title="New conversation"
          aria-label="New conversation"
          className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-overlay-weak hover:text-foreground"
        >
          <Plus className="size-4" />
        </button>
      </header>

      {/* Feed */}
      <div className="flex-1 overflow-y-auto px-3 py-3 mb-scroll">
        {items.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <MessagesSquare className="size-7 text-muted-foreground/50" />
            <p className="text-sm font-medium text-foreground/90">Ask about chat, channels or markets</p>
            <div className="flex max-w-[280px] flex-wrap justify-center gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => ask(s)}
                  className="rounded-full border border-hairline bg-overlay-weak px-2.5 py-1 text-[0.7rem] text-muted-foreground transition-colors hover:bg-overlay-medium hover:text-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {items.map((t, i) => {
              if (t.kind === "text" && t.role === "user") {
                return (
                  <div key={i} className="flex justify-end">
                    <div className="max-w-[85%] rounded-xl rounded-br-sm bg-overlay-medium px-3 py-2 text-[0.82rem] leading-relaxed text-foreground">
                      {t.text}
                    </div>
                  </div>
                );
              }
              if (t.kind === "text") {
                return (
                  <div key={i} className="flex gap-2.5">
                    <span className="mt-0.5 flex size-6 flex-none items-center justify-center rounded-full border border-hairline bg-overlay-weak">
                      <Sparkles className="size-3 text-muted-foreground" />
                    </span>
                    <div className="min-w-0 flex-1 text-[0.82rem] leading-relaxed text-foreground/90">
                      <MarkdownLite text={t.text} />
                    </div>
                  </div>
                );
              }
              if (t.kind === "tool") {
                return (
                  <div key={i} className="pl-[34px]">
                    <ToolCard name={t.name} args={t.args} result={t.result} />
                  </div>
                );
              }
              return (
                <div key={i} className="flex items-center gap-2 rounded-lg border border-feed-danger/25 bg-feed-danger/[0.06] px-3 py-2 text-[0.74rem] text-feed-danger">
                  <TriangleAlert className="size-3.5 flex-none" />
                  <span className="min-w-0">{t.text}</span>
                </div>
              );
            })}
            {(() => {
              // "Working…" appears the moment a question is sent (last turn = the user's message)
              // and between tool calls — it only yields once assistant text is streaming.
              const last = turns[turns.length - 1];
              const streamingText = last?.kind === "text" && last.role === "assistant";
              if (!running || streamingText) return null;
              return (
                <div className="flex items-center gap-2.5">
                  <span className="mt-0.5 flex size-6 flex-none items-center justify-center rounded-full border border-hairline bg-overlay-weak">
                    <Sparkles className="size-3 animate-pulse text-muted-foreground" />
                  </span>
                  <span className="flex items-center gap-1.5 text-[0.74rem] text-muted-foreground">
                    Working
                    <span className="flex gap-0.5" aria-hidden>
                      <span className="size-1 animate-bounce rounded-full bg-muted-foreground/70 [animation-delay:0ms]" />
                      <span className="size-1 animate-bounce rounded-full bg-muted-foreground/70 [animation-delay:120ms]" />
                      <span className="size-1 animate-bounce rounded-full bg-muted-foreground/70 [animation-delay:240ms]" />
                    </span>
                  </span>
                </div>
              );
            })()}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="flex-none border-t border-hairline p-2.5">
        <div className="rounded-xl border border-hairline bg-overlay-weak transition-colors focus-within:border-hairline-strong">
          <textarea
            ref={inputRef}
            rows={1}
            value={question}
            disabled={running}
            placeholder="Ask about chat, channels or markets…"
            aria-label="Ask the assistant"
            onChange={(e) => {
              setQuestion(e.target.value);
              e.currentTarget.style.height = "auto";
              e.currentTarget.style.height = `${Math.min(e.currentTarget.scrollHeight, 140)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                ask(question);
              }
            }}
            className="w-full resize-none bg-transparent px-3 pt-2.5 text-[0.82rem] text-foreground outline-none placeholder:text-muted-foreground/45"
          />
          <div className="flex items-center px-2 pb-2">
            <div className="relative">
              <button
                type="button"
                onClick={() => { setModelOpen((v) => !v); setModelSearch(""); }}
                aria-expanded={modelOpen}
                className="inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[0.64rem] font-medium text-muted-foreground transition-colors hover:bg-overlay-weak hover:text-foreground"
              >
                {modelLabel}
                <ChevronDown className="size-3" />
              </button>
              {modelOpen ? (
                <>
                  <div className="fixed inset-0 z-[90]" onClick={() => setModelOpen(false)} aria-hidden />
                  <div className="absolute bottom-full left-0 z-[100] mb-1.5 w-56 rounded-lg border border-hairline-strong bg-card shadow-[var(--shadow-popover)]">
                    {/* Search bar — stays fixed at the top */}
                    <div className="flex items-center gap-1.5 border-b border-hairline px-2 py-1.5">
                      <Search className="size-3 flex-none text-muted-foreground/60" />
                      <input
                        type="text"
                        value={modelSearch}
                        onChange={(e) => setModelSearch(e.target.value)}
                        placeholder="Search models…"
                        autoFocus
                        className="min-w-0 flex-1 bg-transparent text-[0.72rem] text-foreground outline-none placeholder:text-muted-foreground/40"
                      />
                    </div>
                    {/* Scrollable model list */}
                    <div className="max-h-60 overflow-y-auto p-1 mb-scroll">
                      {usable.map((p) => {
                        const q = modelSearch.toLowerCase();
                        const filtered = modelsFor(p).filter(
                          (m) => !q || m.label.toLowerCase().includes(q) || m.id.toLowerCase().includes(q),
                        );
                        if (filtered.length === 0) return null;
                        return (
                          <div key={p}>
                            <p className="flex items-center gap-1.5 px-2 py-1 text-[0.58rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                              {PROVIDER_LABEL[p]}
                              {managed.includes(p) ? (
                                <span className="inline-flex items-center gap-0.5 rounded border border-hairline bg-overlay-weak px-1 py-px text-[0.52rem] normal-case tracking-normal">
                                  <Lock className="size-2.5" />
                                  Server
                                </span>
                              ) : (
                                <KeyRound className="size-2.5" />
                              )}
                            </p>
                            {filtered.map((m) => (
                              <button
                                key={m.id}
                                type="button"
                                onClick={() => {
                                  setSel({ provider: p, model: m.id });
                                  setModelOpen(false);
                                }}
                                className={cn(
                                  "flex w-full items-center rounded-md px-2 py-1.5 text-left text-[0.74rem] transition-colors hover:bg-overlay-medium",
                                  p === sel.provider && m.id === sel.model ? "text-foreground" : "text-foreground/75",
                                )}
                              >
                                <span className="min-w-0 flex-1 truncate">{m.label}</span>
                                {p === sel.provider && m.id === sel.model ? <Check className="size-3 flex-none text-muted-foreground" /> : null}
                              </button>
                            ))}
                          </div>
                        );
                      })}
                      {canAddKey ? (
                        <button
                          type="button"
                          onClick={() => {
                            setModelOpen(false);
                            setShowKeyEntry(true);
                          }}
                          className="mt-0.5 flex w-full items-center gap-1.5 rounded-md border-t border-hairline px-2 py-1.5 text-left text-[0.7rem] text-muted-foreground transition-colors hover:bg-overlay-medium hover:text-foreground"
                        >
                          <KeyRound className="size-3" />
                          Bring your own key…
                        </button>
                      ) : null}
                    </div>
                  </div>
                </>
              ) : null}
            </div>

            {running ? (
              <button
                type="button"
                onClick={stop}
                aria-label="Stop"
                className="ml-auto flex size-7 items-center justify-center rounded-lg border border-hairline-strong bg-overlay-weak text-foreground transition-colors hover:bg-overlay-medium"
              >
                <Square className="size-3 fill-current" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => ask(question)}
                disabled={!canSend}
                aria-label="Send"
                className="ml-auto flex size-7 items-center justify-center rounded-lg bg-foreground text-background transition-opacity hover:opacity-90 disabled:opacity-25"
              >
                <ArrowUp className="size-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

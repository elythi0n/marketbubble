"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  Activity,
  Gift,
  KeyRound,
  LineChart,
  LogOut,
  Megaphone,
  RefreshCw,
  ShieldCheck,
  ToggleRight,
  Users,
  type LucideIcon,
} from "lucide-react";

import { MarketBubbleLogo } from "@/components/dashboard/market-bubble-logo";
import type { AdminStatusPayload } from "@/app/api/admin/status/route";
import { MOCK_STREAMERS, type Streamer } from "@/lib/streamers/mock";
import { useStreamers } from "@/lib/streamers/use-streamers";
import { cn } from "@/lib/utils";
import { GHOST_BTN, INPUT, QUIET_BTN } from "./ui";

const NAV: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/admin/engage", label: "Engage", icon: Megaphone },
  { href: "/admin/roster", label: "Roster", icon: Users },
  { href: "/admin/controls", label: "Controls", icon: ToggleRight },
  { href: "/admin/giveaway", label: "Giveaway", icon: Gift },
  { href: "/admin/analytics", label: "Analytics", icon: LineChart },
  { href: "/admin/health", label: "Health", icon: Activity },
];

interface AdminContextValue {
  /** Authenticated fetch — adds x-admin-key to every request. */
  call: (path: string, init?: RequestInit) => Promise<Response>;
  status: AdminStatusPayload | null;
  refresh: () => Promise<void>;
  busy: boolean;
  setBusy: (b: boolean) => void;
  /** Roster with live status merged in (same pollers the dashboard uses). */
  streamers: Streamer[];
  /** The configured roster as served by /api/streamers (no live merge). */
  fileRoster: Streamer[];
}

const AdminContext = createContext<AdminContextValue | null>(null);

export function useAdmin(): AdminContextValue {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error("useAdmin must be used inside AdminShell");
  return ctx;
}

/**
 * Client layout for /admin/*: login gate, header with page nav, and the shared admin context
 * (key, status polling, roster). Lives in the route layout so the in-memory key and pollers
 * survive navigation between admin pages — only a full reload asks for the key again.
 */
export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  // /admin itself has no content — land on the first section (streaming makes a server
  // redirect unreliable here, so the shell owns it).
  useEffect(() => {
    if (pathname === "/admin") router.replace(NAV[0].href);
  }, [pathname, router]);

  const [key, setKey] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [loginErr, setLoginErr] = useState("");
  const [status, setStatus] = useState<AdminStatusPayload | null>(null);
  const [busy, setBusy] = useState(false);

  const [fileRoster, setFileRoster] = useState<Streamer[]>(MOCK_STREAMERS);
  useEffect(() => {
    fetch("/api/streamers")
      .then((r) => r.json())
      .then((data: Streamer[]) => {
        if (Array.isArray(data) && data.length > 0) setFileRoster(data);
      })
      .catch(() => {});
  }, []);
  const { streamers } = useStreamers(fileRoster);

  const call = useCallback(
    async (path: string, init?: RequestInit): Promise<Response> => {
      const headers = new Headers(init?.headers);
      if (key) headers.set("x-admin-key", key);
      // JSON by default, but don't stomp callers that send something else (e.g. a PNG upload).
      if (init?.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
      return fetch(path, { ...init, headers });
    },
    [key],
  );

  const refresh = useCallback(async () => {
    if (!key) return;
    const res = await call("/api/admin/status");
    if (res.ok) {
      setStatus((await res.json()) as AdminStatusPayload);
    } else if (res.status === 401) {
      setKey(null);
      setStatus(null);
    }
  }, [key, call]);

  useEffect(() => {
    if (!key) return;
    void refresh();
    const id = setInterval(() => void refresh(), 30_000);
    return () => clearInterval(id);
  }, [key, refresh]);

  const login = async (e: FormEvent) => {
    e.preventDefault();
    const candidate = keyInput.trim();
    if (!candidate) return;
    setLoginErr("");
    const res = await fetch("/api/admin/status", { headers: { "x-admin-key": candidate } });
    if (res.ok) {
      setKey(candidate);
      setKeyInput("");
      setStatus((await res.json()) as AdminStatusPayload);
    } else {
      setLoginErr(res.status === 401 ? "Invalid key." : `Login failed (${res.status}).`);
    }
  };

  if (!key) {
    return (
      <div className="marketing-shell-root">
        <div className="pointer-events-none fixed inset-0 z-0 marketing-ambient-base" aria-hidden />
        <div className="relative z-10 flex h-dvh flex-col items-center justify-center gap-4 px-6">
          <MarketBubbleLogo className="size-16 text-foreground" />
          <h1 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <ShieldCheck className="size-5 text-muted-foreground" />
            Admin
          </h1>
          <p className="max-w-xs text-center text-xs leading-relaxed text-muted-foreground">
            Operator access. The key is held in memory only and cleared when you leave or reload.
          </p>
          <form onSubmit={login} className="flex w-full max-w-xs flex-col gap-2">
            <input
              type="password"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="Admin API key"
              aria-label="Admin API key"
              autoComplete="off"
              autoFocus
              className={cn(INPUT, "text-center font-mono")}
            />
            <button type="submit" disabled={!keyInput.trim()} className={cn(GHOST_BTN, "h-9 justify-center")}>
              <KeyRound className="size-3.5" />
              Enter
            </button>
            {loginErr ? <p className="text-center text-[0.72rem] text-feed-danger">{loginErr}</p> : null}
          </form>
        </div>
      </div>
    );
  }

  return (
    <AdminContext.Provider value={{ call, status, refresh, busy, setBusy, streamers, fileRoster }}>
      <div className="marketing-shell-root">
        <div className="pointer-events-none fixed inset-0 z-0 marketing-ambient-base" aria-hidden />
        <div className="relative z-10 flex h-dvh flex-col overflow-hidden">
          <header className="relative flex h-14 flex-none items-center gap-3 border-b border-hairline bg-background px-4">
            <MarketBubbleLogo className="size-9 text-foreground" />
            <div className="leading-tight">
              <p className="text-sm font-semibold text-foreground">Admin</p>
              <p className="text-[0.62rem] uppercase tracking-[0.16em] text-muted-foreground">Control room</p>
            </div>
            {/* Centered on wide screens; falls back to inline (scrollable) when space is tight. */}
            <nav
              className="mb-scroll ml-3 flex min-w-0 items-center gap-1 overflow-x-auto lg:absolute lg:left-1/2 lg:top-1/2 lg:ml-0 lg:-translate-x-1/2 lg:-translate-y-1/2"
              aria-label="Admin sections"
            >
              {NAV.map((n) => {
                const active = pathname === n.href || pathname.startsWith(`${n.href}/`);
                return (
                  <Link
                    key={n.href}
                    href={n.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "inline-flex flex-none items-center gap-1.5 rounded-lg px-3 py-1.5 text-[0.78rem] font-medium transition-colors",
                      active ? "bg-overlay-medium text-foreground" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <n.icon className={cn("size-3.5", active ? "text-foreground" : "text-muted-foreground/80")} />
                    <span className="hidden sm:inline">{n.label}</span>
                  </Link>
                );
              })}
            </nav>
            <div className="ml-auto flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => void refresh()}
                title="Refresh"
                aria-label="Refresh"
                className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-overlay-weak hover:text-foreground"
              >
                <RefreshCw className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setKey(null);
                  setStatus(null);
                }}
                title="Forget key and leave"
                className={QUIET_BTN}
              >
                <LogOut className="size-3.5" />
                Log out
              </button>
            </div>
          </header>

          <main className="mb-scroll flex-1 overflow-y-auto">
            <div className="mx-auto flex max-w-5xl flex-col gap-4 px-5 py-5">{children}</div>
          </main>
        </div>
      </div>
    </AdminContext.Provider>
  );
}

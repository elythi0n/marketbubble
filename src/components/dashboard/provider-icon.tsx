import type { AssistantProvider } from "@/lib/assistant/config";
import { cn } from "@/lib/utils";

/**
 * Brand glyphs for the AI providers. Claude's mark is full-color (stays as-is); the others are
 * monochrome `currentColor` logos exported as black, so they get `dark:invert` to read on the
 * graphite theme (black on paper → white on graphite, the standard logo treatment).
 */
const PROVIDER_ICON: Record<AssistantProvider, { src: string; mono: boolean }> = {
  anthropic: { src: "/providers/claude-color.svg", mono: false },
  openai: { src: "/providers/openai.svg", mono: true },
  xai: { src: "/providers/xai.svg", mono: true },
  openrouter: { src: "/providers/openrouter.svg", mono: true },
};

export function ProviderIcon({ provider, className }: { provider: AssistantProvider; className?: string }) {
  const { src, mono } = PROVIDER_ICON[provider];
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      aria-hidden
      className={cn("flex-none object-contain", mono && "dark:invert", className)}
    />
  );
}

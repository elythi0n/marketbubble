import Link from "next/link";

import { siteName } from "@/lib/site";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 text-center">
      <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">404</p>
      <h1 className="mt-3 font-serif text-2xl font-light tracking-tight text-foreground sm:text-3xl">Page not found</h1>
      <p className="text-muted-foreground mt-2 max-w-sm text-sm leading-relaxed">
        The link may be wrong or the page was moved. Head back to {siteName} and continue from there.
      </p>
      <Link
        href="/"
        className="text-primary mt-8 text-sm font-medium underline-offset-4 transition-colors hover:text-primary/80 hover:underline"
      >
        Back to home
      </Link>
    </div>
  );
}

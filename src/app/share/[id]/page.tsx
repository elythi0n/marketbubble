import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getShareCard } from "@/lib/server/share-cards";
import { getSiteUrl, siteName } from "@/lib/site";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * Public landing page for a shared highlight. Its job is the metadata: X reads
 * twitter:card / og:image here and renders the PNG as a large image card under the tweet.
 */
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const image = `${getSiteUrl()}/api/share-card/${id}`;
  return {
    title: `${siteName} highlight`,
    robots: { index: false, follow: false },
    openGraph: { title: `${siteName} highlight`, images: [{ url: image, width: 1080, height: 1350 }] },
    twitter: { card: "summary_large_image", title: `${siteName} highlight`, images: [image] },
  };
}

export default async function SharePage({ params }: Params) {
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{4,24}$/.test(id) || !getShareCard(id)) notFound();

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-background px-6 py-10">
      {/* Plain img: the route serves a dynamic blob — next/image optimization adds nothing here. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/api/share-card/${id}`}
        alt={`${siteName} highlight`}
        className="max-h-[80dvh] w-auto rounded-2xl border border-hairline shadow-[var(--shadow-modal)]"
      />
      <Link
        href="/"
        className="rounded-lg border border-hairline-strong bg-overlay-weak px-4 py-2 text-[0.8rem] font-medium text-foreground transition-colors hover:bg-overlay-medium"
      >
        Watch live on {siteName}
      </Link>
    </div>
  );
}

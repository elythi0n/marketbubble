import { type NextRequest, NextResponse } from "next/server";

import { getShareCard } from "@/lib/server/share-cards";

export const dynamic = "force-dynamic";

/** Public image for a shared highlight — referenced by /share/<id>'s og:image. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{4,24}$/.test(id)) return new NextResponse(null, { status: 400 });

  const png = getShareCard(id);
  if (!png) return new NextResponse(null, { status: 404 });

  return new NextResponse(Buffer.from(png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=86400, immutable",
    },
  });
}

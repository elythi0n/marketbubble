import { type NextRequest, NextResponse } from "next/server";

import { saveShareCard } from "@/lib/server/share-cards";
import { adminAuthorized, adminEnabled } from "../auth";

export const dynamic = "force-dynamic";

const MAX_BYTES = 3 * 1024 * 1024;
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47];

/** Stores a rendered highlight PNG and returns the public share path for tweeting. */
export async function POST(req: NextRequest) {
  if (!adminEnabled()) return new NextResponse(null, { status: 404 });
  if (!adminAuthorized(req)) return NextResponse.json({ error: "invalid key" }, { status: 401 });

  const buf = new Uint8Array(await req.arrayBuffer());
  if (buf.byteLength === 0 || buf.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: "expected a PNG body up to 3MB" }, { status: 400 });
  }
  if (!PNG_MAGIC.every((b, i) => buf[i] === b)) {
    return NextResponse.json({ error: "not a PNG" }, { status: 415 });
  }

  const id = await saveShareCard(buf);
  return NextResponse.json({ id, path: `/share/${id}` });
}

import { NextResponse } from "next/server";

export const revalidate = 600;

/** Crypto Fear & Greed index from alternative.me (no key). */
export async function GET() {
  try {
    const res = await fetch("https://api.alternative.me/fng/?limit=1&format=json", { next: { revalidate: 600 } });
    if (!res.ok) return NextResponse.json({ value: 0, classification: "Unknown" });
    const json = (await res.json()) as { data?: Array<{ value: string; value_classification: string }> };
    const d = json.data?.[0];
    return NextResponse.json({
      value: Number(d?.value ?? 0),
      classification: d?.value_classification ?? "Unknown",
    });
  } catch {
    return NextResponse.json({ value: 0, classification: "Unknown" });
  }
}

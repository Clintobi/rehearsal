import type { Metadata } from "next";
import Link from "next/link";
import Redirect from "./redirect";

// Shareable link. Social cards show the live verdict image; people land in the app on this stock.
export async function generateMetadata({ params }: PageProps<"/rehearse/[symbol]">): Promise<Metadata> {
  const { symbol } = await params;
  const s = symbol.toUpperCase();
  const image = `/api/actions/card/${s}`;
  return {
    title: `${s}: fair price right now`,
    description: `What a $1,000 buy of ${s} really costs on Solana, against the real stock price.`,
    openGraph: { images: [{ url: image, width: 1080, height: 1080 }] },
    twitter: { card: "summary_large_image", images: [image] },
  };
}

export default async function Share({ params }: PageProps<"/rehearse/[symbol]">) {
  const { symbol } = await params;
  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <Redirect to={`/app?t=${encodeURIComponent(symbol)}`} />
      <Link className="text-brand-ink underline" href={`/app?t=${encodeURIComponent(symbol)}`}>Open {symbol.toUpperCase()} in Rehearsal</Link>
    </main>
  );
}

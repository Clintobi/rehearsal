import type { Metadata } from "next";
import Home from "../../page";

// Shareable link: opens the app on this token; social cards show the live verdict image.
export async function generateMetadata({ params }: PageProps<"/rehearse/[symbol]">): Promise<Metadata> {
  const { symbol } = await params;
  const s = symbol.toUpperCase();
  const image = `/api/actions/card/${s}`;
  return {
    title: `${s}: fair price right now · Rehearsal`,
    description: `What a $1,000 buy of ${s} really costs on Solana vs fair value, live.`,
    openGraph: { images: [{ url: image, width: 1080, height: 1080 }] },
    twitter: { card: "summary_large_image", images: [image] },
  };
}

export default Home;

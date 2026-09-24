import type { Metadata } from "next";
import { Inter_Tight, JetBrains_Mono } from "next/font/google";
import Providers from "@/components/Providers";
import "./globals.css";

const sans = Inter_Tight({ subsets: ["latin"], variable: "--font-sans" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "Rehearsal: check the price before you buy a tokenized stock",
  description: "Compare your real Jupiter fill for xStocks and PreStocks against Pyth and the issuer mark, on Solana, before you sign.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body><Providers>{children}</Providers></body>
    </html>
  );
}

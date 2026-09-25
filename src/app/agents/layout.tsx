import type { Metadata } from "next";
import AppShell from "@/components/AppShell";

export const metadata: Metadata = {
  title: "For agents",
  description: "An MCP server and REST API that checks tokenized-stock trades on Solana and builds swaps the chain won't fill worse than fair value.",
};

export default function AgentsLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}

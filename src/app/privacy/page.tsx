import type { Metadata } from "next";
import LegalPage from "@/components/LegalPage";

export const metadata: Metadata = { title: "Privacy" };

export default function Privacy() {
  return (
    <LegalPage title="Privacy" updated="25 September 2026">
      <p>Rehearsal is built to need as little about you as possible. There are no accounts, no email sign-up and no tracking cookies.</p>
      <h2>What we see</h2>
      <p>When you check a trade or a wallet, our server receives the stock, the amount and, if you provide one, the wallet address, so it can fetch quotes and balances. Wallet addresses and balances are already public on Solana. We don&apos;t link them to your identity.</p>
      <p>Our hosting provider keeps standard request logs, such as IP address and time, for security and reliability.</p>
      <h2>What we publish</h2>
      <p>The execution report is built from public Solana transactions. It lists trades by transaction signature, the same information anyone can see on a block explorer.</p>
      <h2>Third parties</h2>
      <p>To quote and build trades we call Jupiter, Pyth, PreStocks, a Solana RPC provider and your wallet extension. Their own privacy policies apply to those requests.</p>
      <h2>Storage on your device</h2>
      <p>We store your theme choice in your browser. Nothing else.</p>
      <h2>Contact</h2>
      <p>Questions or requests: open an issue on <a href="https://github.com/Clintobi/rehearsal">GitHub</a>.</p>
    </LegalPage>
  );
}

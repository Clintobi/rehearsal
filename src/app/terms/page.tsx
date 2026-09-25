import type { Metadata } from "next";
import LegalPage from "@/components/LegalPage";

export const metadata: Metadata = { title: "Terms" };

export default function Terms() {
  return (
    <LegalPage title="Terms of use" updated="25 September 2026">
      <p>Rehearsal is software that shows prices for tokenized stocks on Solana and can build transactions for you to sign in your own wallet. By using it you agree to these terms.</p>
      <h2>What Rehearsal is and isn&apos;t</h2>
      <p>Rehearsal is not a broker, exchange, investment adviser or custodian. It never holds your funds or your keys. Every trade is a transaction you review and sign yourself, executed by third-party protocols such as Jupiter and the pools it routes through.</p>
      <p>Nothing here is investment advice or a recommendation to buy or sell anything. Tokenized stocks and pre-IPO tokens carry their own risks, set by their issuers. Read the issuer&apos;s terms before you buy.</p>
      <h2>Prices and verdicts</h2>
      <p>Prices come from public sources: Pyth price feeds, the PreStocks and xStocks issuers, and live Jupiter quotes. They can be delayed, wrong or unavailable. &quot;Real price&quot; means a public reference price, not the official US national best bid and offer. Quotes can change between the moment you see them and the moment your transaction lands.</p>
      <h2>Price protection</h2>
      <p>Price protection is an on-chain program that cancels a trade when the fill is worse than your limit. It depends on the price feed being available and fresh, and it can cancel trades you would have been happy with. On mainnet it isn&apos;t available yet; it currently runs on Solana devnet.</p>
      <h2>Your responsibility</h2>
      <p>You&apos;re responsible for your wallet, the transactions you sign, network fees, and following the laws where you live, including any restrictions on buying tokenized securities.</p>
      <h2>No warranty</h2>
      <p>Rehearsal is provided as is, without warranties of any kind. To the fullest extent the law allows, we aren&apos;t liable for losses from using it, including losses from prices, failed or cancelled transactions, or third-party protocols.</p>
      <h2>Contact</h2>
      <p>Questions: open an issue on <a href="https://github.com/Clintobi/rehearsal">GitHub</a>.</p>
    </LegalPage>
  );
}

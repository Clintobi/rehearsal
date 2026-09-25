// "What you hold": the legal wrapper behind each issuer's token, in plain words.
// Two tokens can track the same company and still be very different things to own.
import type { Asset } from "./assets";

export type Structure = {
  instrument: string; // one line: what the token legally is
  claim: string; // what you have a claim on
  redeem: string; // how (and whether) it turns back into the underlying
  rights: string; // votes and dividends
  risks: string[];
  sources: { label: string; url: string }[];
};

export const STRUCTURES: Record<Asset["issuer"], Structure> = {
  xStocks: {
    instrument: "Tracker certificate (a debt security), 1:1 collateralised",
    claim: "A claim on Backed Assets (Kraken), which holds the real shares with a custodian. Not the share itself.",
    redeem: "Redeemable through the issuer by approved clients, in orders from $1,000. Not instant for wallet holders.",
    rights: "No voting rights. Dividends are reinvested by raising the token's share multiplier.",
    risks: [
      "Issuer and custodian risk: you rely on Backed and its custodian holding the shares.",
      "The issuer can pause transfers of the token.",
      "The pool price can drift from the real share, most often while US markets are closed.",
    ],
    sources: [
      { label: "xStocks proof of reserves", url: "https://api.xstocks.fi/api/v2/public/proof-of-reserves" },
      { label: "xStocks docs", url: "https://docs.xstocks.fi" },
    ],
  },
  PreStocks: {
    instrument: "Token tracking an SPV's exposure to a private company",
    claim: "A claim through a special-purpose vehicle that holds exposure to the company's shares. Not a share.",
    redeem: "Not redeemable at the mark on demand. It pays out through the issuer after a liquidity event such as an IPO.",
    rights: "No voting rights and no dividends.",
    risks: [
      "The mark is a valuation, not a market price. The company has no public price to check against.",
      "In May 2026 some private companies disputed whether SPV share transfers are valid. PreStocks says its tokens are supported under their terms.",
      "Every transfer pays a 1% fee, so a round trip costs at least 2%.",
      "Thin float: the whole market for some names is under $1M.",
    ],
    sources: [
      { label: "PreStocks", url: "https://prestocks.com" },
      { label: "PreStocks statement on SPV risk", url: "https://www.bitget.com/news/detail/12560605416154" },
    ],
  },
};

import type { Metadata } from "next";
import Start from "./Start";

export const metadata: Metadata = {
  title: "Your first stock",
  description: "Own a slice of Nvidia, Tesla or Apple on Solana in four steps, from $10, with the real price shown before you buy.",
};

export default function StartPage() {
  return <Start />;
}

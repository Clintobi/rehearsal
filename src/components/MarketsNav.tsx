"use client";
import type { ReactNode } from "react";
import { PageHeader, RouteTabs } from "./ui";

/** Shared header for the three Markets views. */
export default function MarketsNav({ right }: { right?: ReactNode }) {
  return (
    <div className="space-y-5">
      <PageHeader title="Markets" right={right} />
      <RouteTabs tabs={[{ href: "/app/markets", label: "Prices" }, { href: "/app/private", label: "Pre-IPO" }, { href: "/app/weekend", label: "Weekend" }]} />
    </div>
  );
}

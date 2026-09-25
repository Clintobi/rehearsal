import type { Metadata } from "next";
import AppShell from "@/components/AppShell";

export const metadata: Metadata = { title: "Execution report" };

export default function ReportLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}

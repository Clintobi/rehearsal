import { POLICY } from "@/lib/agent";
import { json, options } from "@/lib/api";

// The reference policy: which price each trade is judged against, by market state.
export async function GET() {
  return json(POLICY, 200, { "Cache-Control": "public, max-age=3600" });
}
export const OPTIONS = options;

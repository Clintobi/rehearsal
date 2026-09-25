import { listStocks } from "@/lib/agent";
import { json, options } from "@/lib/api";

export async function GET() {
  return json(await listStocks(), 200, { "Cache-Control": "public, max-age=300" });
}
export const OPTIONS = options;

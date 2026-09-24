import { NextResponse } from "next/server";
import { ACTION_HEADERS } from "@/lib/actions";

// Lets a plain link like https://…/rehearse/OPENAI unfurl as a Blink.
export function GET() {
  return NextResponse.json({
    rules: [
      { pathPattern: "/rehearse/*", apiPath: "/api/actions/rehearse/*" },
      { pathPattern: "/api/actions/**", apiPath: "/api/actions/**" },
    ],
  }, { headers: ACTION_HEADERS });
}

export const OPTIONS = GET;

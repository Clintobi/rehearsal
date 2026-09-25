import { NextResponse } from "next/server";
import { haltBoard } from "@/lib/halts";

export async function GET() {
  return NextResponse.json(await haltBoard());
}

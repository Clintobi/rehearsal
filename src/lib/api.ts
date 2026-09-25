import { NextResponse } from "next/server";

// Public API responses: open CORS so agents, wallets and other apps can call them from anywhere.
export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Mcp-Session-Id, Mcp-Protocol-Version",
};

export const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  NextResponse.json(data, { status, headers: { ...CORS, ...headers } });

export const options = () => new NextResponse(null, { status: 204, headers: CORS });

export const fail = (data: unknown) =>
  json(data, typeof data === "object" && data && "error" in data ? 400 : 200);

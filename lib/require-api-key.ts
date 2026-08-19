import { NextRequest, NextResponse } from "next/server";

export function requireApiKey(
  request: NextRequest,
  onError: (code: string, message: string, status: number) => NextResponse,
): NextResponse | null {
  const expected = process.env.API_KEY;
  if (!expected) {
    return onError(
      "SERVER_MISCONFIG",
      "API key is not configured on server",
      500,
    );
  }

  const provided = request.headers.get("x-api-key");
  if (!provided || provided !== expected) {
    return onError("UNAUTHORIZED", "Invalid or missing API key", 401);
  }

  return null;
}

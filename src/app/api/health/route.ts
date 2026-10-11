import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "handy-local-bridge",
    database: "not_required",
    timestamp: new Date().toISOString(),
  });
}

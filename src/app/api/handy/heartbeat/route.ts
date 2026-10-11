import { recordHeartbeat } from "@/lib/bridge-store";
import { parseHeartbeat } from "@/lib/bridge-validate";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/handy/heartbeat
 *
 * Handy periodically reports that it is running.
 * Body (all fields optional):
 *   app_version : string
 *   recording   : boolean   (is a recording session active right now)
 *   status      : string    (e.g. "idle" / "recording" / "transcribing")
 *   client      : string    (e.g. "handy-desktop")
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { ok: false, error: "invalid_json", message: "request body must be valid JSON" },
      { status: 400 },
    );
  }

  const parsed = parseHeartbeat(body);
  if (!parsed.ok) {
    return Response.json(
      { ok: false, error: "validation_failed", details: parsed.errors },
      { status: 422 },
    );
  }

  const hb = recordHeartbeat(parsed.value);

  return Response.json(
    {
      ok: true,
      received_at: hb.received_at,
      recording: hb.recording,
    },
    { status: 200 },
  );
}

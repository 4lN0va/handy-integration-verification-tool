import { recordTranscriptEvent } from "@/lib/bridge-store";
import { parseTranscriptEvent } from "@/lib/bridge-validate";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/transcripts
 *
 * Receives one transcript event (partial or final) from Handy.
 * Body schema (follows the Handy transcript schema):
 *   session_id : string (required)
 *   segment_id : string (required)
 *   text       : string (required, may be empty)
 *   final      : boolean (required)
 *   timestamp  : string (required, parseable date/time)
 *   source     : string (optional, defaults to "handy")
 *
 * Only the JSON body is stored in memory (ring buffer of 100).
 * No audio, no API keys, no Authorization headers are recorded.
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

  const parsed = parseTranscriptEvent(body);
  if (!parsed.ok) {
    return Response.json(
      { ok: false, error: "validation_failed", details: parsed.errors },
      { status: 422 },
    );
  }

  const event = recordTranscriptEvent(parsed.value);

  return Response.json(
    {
      ok: true,
      stored: true,
      received_at: event.received_at,
      session_id: event.session_id,
      segment_id: event.segment_id,
      final: event.final,
    },
    { status: 200 },
  );
}

/**
 * Request-body validation for the Handy Local Bridge API.
 * Kept dependency-free and pure so it can be unit tested.
 */

export interface TranscriptInput {
  session_id: string;
  segment_id: string;
  text: string;
  final: boolean;
  timestamp: string;
  source: string;
}

export type ValidationResult =
  | { ok: true; value: TranscriptInput }
  | { ok: false; errors: string[] };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function asNonEmptyString(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v : null;
}

/**
 * Validates a POST /api/transcripts body.
 * Field names follow the Handy transcript schema:
 *   session_id, segment_id, text, final, timestamp, source
 */
export function parseTranscriptEvent(body: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isPlainObject(body)) {
    return { ok: false, errors: ["body must be a JSON object"] };
  }

  const sessionId = asNonEmptyString(body.session_id);
  if (!sessionId) errors.push("session_id is required (non-empty string)");

  const segmentId = asNonEmptyString(body.segment_id);
  if (!segmentId) errors.push("segment_id is required (non-empty string)");

  if (typeof body.text !== "string") {
    errors.push("text is required (string, may be empty)");
  }
  if (typeof body.final !== "boolean") {
    errors.push("final is required (boolean)");
  }

  const timestamp = asNonEmptyString(body.timestamp);
  if (!timestamp) {
    errors.push("timestamp is required (non-empty string)");
  } else if (Number.isNaN(Date.parse(timestamp))) {
    errors.push("timestamp must be a parseable date/time string");
  }

  let source = "handy";
  if (body.source !== undefined) {
    if (typeof body.source !== "string" || body.source.trim().length === 0) {
      errors.push("source must be a non-empty string when provided");
    } else {
      source = body.source;
    }
  }

  if (
    errors.length > 0 ||
    !sessionId ||
    !segmentId ||
    typeof body.text !== "string" ||
    typeof body.final !== "boolean" ||
    !timestamp
  ) {
    return { ok: false, errors: errors.length > 0 ? errors : ["invalid body"] };
  }

  return {
    ok: true,
    value: {
      session_id: sessionId,
      segment_id: segmentId,
      text: body.text as string,
      final: body.final as boolean,
      timestamp,
      source,
    },
  };
}

export type HeartbeatResult =
  | {
      ok: true;
      value: {
        app_version: string | null;
        recording: boolean;
        status: string | null;
        client: string | null;
      };
    }
  | { ok: false; errors: string[] };

/** Validates a POST /api/handy/heartbeat body (all fields optional). */
export function parseHeartbeat(body: unknown): HeartbeatResult {
  const errors: string[] = [];
  if (!isPlainObject(body)) {
    return { ok: false, errors: ["body must be a JSON object"] };
  }

  let recording = false;
  if (body.recording !== undefined) {
    if (typeof body.recording !== "boolean") {
      errors.push("recording must be a boolean when provided");
    } else {
      recording = body.recording;
    }
  }

  const str = (v: unknown): string | null =>
    typeof v === "string" && v.trim().length > 0 ? v : null;

  const appVersion = body.app_version === undefined ? null : str(body.app_version);
  const status = body.status === undefined ? null : str(body.status);
  const client = body.client === undefined ? null : str(body.client);

  if (body.app_version !== undefined && appVersion === null) {
    errors.push("app_version must be a non-empty string when provided");
  }
  if (body.status !== undefined && status === null) {
    errors.push("status must be a non-empty string when provided");
  }
  if (body.client !== undefined && client === null) {
    errors.push("client must be a non-empty string when provided");
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: { app_version: appVersion, recording, status, client } };
}


/**
 * Pure status-derivation logic for the local frontend.
 *
 * The three states are derived INDEPENDENTLY on purpose:
 *   1. backend      — did GET /api/status (or /health) succeed?
 *   2. handy link   — is a recent heartbeat arriving?
 *   3. transcript   — has any valid transcript event been received?
 * One being true must never imply the others.
 */

import type { TranscriptEvent } from "./bridge-store";

/** Heartbeat older than this is reported as timed out. */
export const HEARTBEAT_TIMEOUT_MS = 15_000;

export interface StatusPayload {
  backend: {
    ok: boolean;
    version: string;
    started_at: string;
    uptime_seconds: number;
  };
  handy_heartbeat: {
    last_heartbeat: string | null;
    app_version: string | null;
    recording: boolean;
    status: string | null;
    client: string | null;
  };
  transcripts: {
    total_events: number;
    last_received_at: string | null;
  };
  counts: {
    transcriptsReceived: number;
    heartbeatsReceived: number;
  };
  events: TranscriptEvent[];
}

export type BackendState = "ok" | "unreachable";
export type HandyLinkState = "connected" | "not_connected" | "timeout";
export type TranscriptState = "none" | "received";

export interface DerivedStatus {
  backend: BackendState;
  handyLink: HandyLinkState;
  transcript: TranscriptState;
  recording: boolean;
  lastReceivedAt: string | null;
  /** Human-readable explanation when a check is missing or stale. */
  notes: string[];
}

function ageMs(iso: string | null, nowMs: number): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.max(0, nowMs - t);
}

export function deriveStatus(
  fetchOk: boolean,
  payload: StatusPayload | null,
  nowMs: number,
): DerivedStatus {
  const notes: string[] = [];

  // 1. Backend
  const backend: BackendState = fetchOk && payload ? "ok" : "unreachable";

  // 2. Handy heartbeat link
  let handyLink: HandyLinkState = "not_connected";
  const hbAge = payload ? ageMs(payload.handy_heartbeat.last_heartbeat, nowMs) : null;
  if (!payload || !payload.handy_heartbeat.last_heartbeat) {
    handyLink = "not_connected";
  } else if (hbAge !== null && hbAge > HEARTBEAT_TIMEOUT_MS) {
    handyLink = "timeout";
    notes.push("曾收到 heartbeat，但已逾時（超過 15 秒未更新）");
  } else {
    handyLink = "connected";
  }

  // 3. Transcript output
  const transcript: TranscriptState =
    fetchOk && payload && payload.transcripts.total_events > 0
      ? "received"
      : "none";

  return {
    backend,
    handyLink,
    transcript,
    recording: payload?.handy_heartbeat.recording ?? false,
    lastReceivedAt: payload?.transcripts.last_received_at ?? null,
    notes,
  };
}

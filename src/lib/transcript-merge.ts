/**
 * Pure transcript-merging logic shared by the local frontend and the tests.
 *
 * Rules (per task spec):
 * - partial and final events of the SAME (session_id, segment_id) update one row
 *   instead of creating duplicates
 * - a final event replaces the text and marks the segment final
 * - different segments are sorted by timestamp
 * - exact duplicate events (same stable identity, e.g. HTTP retries) are
 *   suppressed so a retried POST never shows twice
 */

import type { TranscriptEvent } from "./bridge-store";

export interface MergedSegment {
  sessionId: string;
  segmentId: string;
  text: string;
  final: boolean;
  /** Latest sender timestamp seen for this segment. */
  timestamp: string;
  /** Server receive time of the latest update. */
  receivedAt: string;
  /** How many partial updates were merged into this segment. */
  partialCount: number;
}

/** Stable identity for one transcript event (used for duplicate suppression). */
export function transcriptEventKey(e: TranscriptEvent): string {
  return [
    e.session_id,
    e.segment_id,
    e.final ? "final" : "partial",
    e.timestamp,
    e.text,
  ].join("|");
}

export function mergeTranscriptEvents(
  events: TranscriptEvent[],
): MergedSegment[] {
  const bySegment = new Map<string, MergedSegment>();
  const seen = new Set<string>();

  for (const e of events) {
    const key = transcriptEventKey(e);
    if (seen.has(key)) continue; // suppress exact duplicates (retries)
    seen.add(key);

    const segKey = `${e.session_id}|${e.segment_id}`;
    const existing = bySegment.get(segKey);

    if (!existing) {
      bySegment.set(segKey, {
        sessionId: e.session_id,
        segmentId: e.segment_id,
        text: e.text,
        final: e.final,
        timestamp: e.timestamp,
        receivedAt: e.received_at,
        partialCount: e.final ? 0 : 1,
      });
      continue;
    }

    // Same segment: partial updates in place, final replaces text + marks final.
    existing.text = e.text;
    if (e.final) existing.final = true;
    existing.receivedAt = e.received_at;
    if (!e.final) existing.partialCount += 1;
    if (e.timestamp > existing.timestamp) existing.timestamp = e.timestamp;
  }

  return [...bySegment.values()].sort(
    (a, b) =>
      a.timestamp.localeCompare(b.timestamp) ||
      a.segmentId.localeCompare(b.segmentId),
  );
}

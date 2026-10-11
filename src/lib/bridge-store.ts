/**
 * Handy Local Bridge — in-memory store.
 *
 * This is a local development/testing tool only:
 * - everything lives in process memory (survives Next.js dev hot-reload via globalThis)
 * - nothing is written to disk or to the database
 * - no audio, no API keys and no Authorization headers are ever stored
 */

export interface TranscriptEvent {
  session_id: string;
  segment_id: string;
  text: string;
  final: boolean;
  /** ISO-8601 timestamp provided by the sender (Handy). */
  timestamp: string;
  source: string;
  /** ISO-8601 timestamp set by this server when the event was received. */
  received_at: string;
}

export interface HeartbeatInfo {
  received_at: string;
  app_version: string | null;
  recording: boolean;
  status: string | null;
  client: string | null;
}

export interface BridgeStore {
  startedAt: string;
  /** Ring buffer, oldest first, capped at MAX_EVENTS. */
  events: TranscriptEvent[];
  lastHeartbeat: HeartbeatInfo | null;
  counts: {
    transcriptsReceived: number;
    heartbeatsReceived: number;
  };
}

export const BRIDGE_VERSION = "0.1.0";
export const MAX_EVENTS = 100;

function createStore(): BridgeStore {
  return {
    startedAt: new Date().toISOString(),
    events: [],
    lastHeartbeat: null,
    counts: {
      transcriptsReceived: 0,
      heartbeatsReceived: 0,
    },
  };
}

const globalRef = globalThis as unknown as { __handyBridgeStore?: BridgeStore };

export const bridgeStore: BridgeStore =
  globalRef.__handyBridgeStore ?? (globalRef.__handyBridgeStore = createStore());

export function recordTranscriptEvent(
  event: Omit<TranscriptEvent, "received_at">,
): TranscriptEvent {
  const full: TranscriptEvent = { ...event, received_at: new Date().toISOString() };
  bridgeStore.events.push(full);
  if (bridgeStore.events.length > MAX_EVENTS) {
    bridgeStore.events.splice(0, bridgeStore.events.length - MAX_EVENTS);
  }
  bridgeStore.counts.transcriptsReceived += 1;
  return full;
}

export function recordHeartbeat(
  info: Omit<HeartbeatInfo, "received_at">,
): HeartbeatInfo {
  const full: HeartbeatInfo = { ...info, received_at: new Date().toISOString() };
  bridgeStore.lastHeartbeat = full;
  bridgeStore.counts.heartbeatsReceived += 1;
  return full;
}


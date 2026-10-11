import { BRIDGE_VERSION, bridgeStore } from "@/lib/bridge-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_RETURNED_EVENTS = 50;

/**
 * GET /api/status
 *
 * Aggregated status for the local frontend dashboard. The frontend polls this
 * every 1–2 seconds. All four states are reported independently:
 * backend health, Handy process check, Handy heartbeat link, transcript output.
 */
export async function GET() {
  const startedAtMs = Date.parse(bridgeStore.startedAt);
  const lastEvent =
    bridgeStore.events.length > 0
      ? bridgeStore.events[bridgeStore.events.length - 1]
      : null;

  return Response.json(
    {
      backend: {
        ok: true,
        version: BRIDGE_VERSION,
        started_at: bridgeStore.startedAt,
        uptime_seconds: Math.max(0, Math.round((Date.now() - startedAtMs) / 1000)),
      },
      handy_heartbeat: {
        last_heartbeat: bridgeStore.lastHeartbeat?.received_at ?? null,
        app_version: bridgeStore.lastHeartbeat?.app_version ?? null,
        recording: bridgeStore.lastHeartbeat?.recording ?? false,
        status: bridgeStore.lastHeartbeat?.status ?? null,
        client: bridgeStore.lastHeartbeat?.client ?? null,
      },
      transcripts: {
        total_events: bridgeStore.counts.transcriptsReceived,
        last_received_at: lastEvent?.received_at ?? null,
      },
      counts: { ...bridgeStore.counts },
      // Newest first, capped — the frontend merges partial/final per segment.
      events: [...bridgeStore.events]
        .reverse()
        .slice(0, MAX_RETURNED_EVENTS),
    },
    { status: 200 },
  );
}

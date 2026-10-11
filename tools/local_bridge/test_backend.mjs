#!/usr/bin/env node
/**
 * Handy Local Bridge — automated test suite.
 *
 * Covers:
 *   1. Backend API tests (health / transcripts / heartbeat / process / status)
 *   2. Validation tests (missing fields, wrong types -> 4xx)
 *   3. UTF-8 Chinese round-trip
 *   4. session_id / segment_id preservation
 *   5. partial -> final merge logic (same segment updates in place)
 *   6. Independent status derivation (backend / process / heartbeat / transcript)
 *   7. Frontend page smoke test (four status cards render)
 *   8. Full simulated Handy flow (heartbeat -> partial -> final -> heartbeat)
 *
 * Usage:
 *   node test_backend.mjs --base-url http://127.0.0.1:8765 [--repo-root <path>]
 *
 * Requires the bridge backend to be running. No third-party dependencies.
 */

import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs() {
  const args = { baseUrl: "http://127.0.0.1:8765", repoRoot: path.resolve(__dirname, "../..") };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--base-url") args.baseUrl = argv[++i];
    if (argv[i] === "--repo-root") args.repoRoot = argv[++i];
  }
  return args;
}

const { baseUrl, repoRoot } = parseArgs();
const base = baseUrl.replace(/\/$/, "");

// Pure logic modules under test (Node >= 22.18 strips TypeScript types natively).
const { mergeTranscriptEvents, transcriptEventKey } = await import(
  path.join(repoRoot, "src/lib/transcript-merge.ts")
);
const { deriveStatus, HEARTBEAT_TIMEOUT_MS } = await import(
  path.join(repoRoot, "src/lib/bridge-status.ts")
);

let passed = 0;
let failed = 0;
const failures = [];

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (err) {
    failed++;
    failures.push({ name, err });
    console.log(`  FAIL  ${name}\n        ${err.message}`);
  }
}

async function postJson(pathname, body, raw = false) {
  const res = await fetch(base + pathname, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: raw ? body : JSON.stringify(body),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON response */
  }
  return { status: res.status, json };
}

const iso = (offsetMs = 0) => new Date(Date.now() + offsetMs).toISOString();

async function getStatus() {
  const res = await fetch(base + "/api/status", { cache: "no-store" });
  assert.equal(res.status, 200);
  return res.json();
}

console.log(`\n=== Handy Local Bridge tests — base URL: ${base} ===\n`);
console.log("--- 1. Backend: /api/health ---");

await test("GET /api/health returns 200 with version and started_at", async () => {
  const res = await fetch(base + "/api/health", { cache: "no-store" });
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.ok, true);
  assert.equal(typeof json.version, "string");
  assert.equal(typeof json.started_at, "string");
  assert.ok(!Number.isNaN(Date.parse(json.started_at)));
  assert.equal(typeof json.uptime_seconds, "number");
});

console.log("\n--- 2. Backend: POST /api/transcripts (valid) ---");

const CHINESE_TEXT = "你好，這是繁體中文測試語音辨識結果。";
const sessionId = `test-${Date.now()}`;
const segA = "seg-a";

await test("valid transcript (Chinese, partial) is accepted with 200", async () => {
  const { status, json } = await postJson("/api/transcripts", {
    session_id: sessionId,
    segment_id: segA,
    text: CHINESE_TEXT,
    final: false,
    timestamp: iso(),
    source: "handy",
  });
  assert.equal(status, 200);
  assert.equal(json.ok, true);
  assert.equal(json.session_id, sessionId);
  assert.equal(json.segment_id, segA);
  assert.equal(json.final, false);
  assert.ok(json.received_at);
});

await test("UTF-8 Chinese text survives the round trip via /api/status", async () => {
  const status = await getStatus();
  const found = status.events.find(
    (e) => e.session_id === sessionId && e.segment_id === segA && e.text === CHINESE_TEXT,
  );
  assert.ok(found, "event with exact Chinese text must be present in /api/status");
});

await test("session_id and segment_id are preserved exactly", async () => {
  const status = await getStatus();
  const found = status.events.find(
    (e) => e.session_id === sessionId && e.segment_id === segA,
  );
  assert.ok(found);
  assert.equal(found.session_id, sessionId);
  assert.equal(found.segment_id, segA);
  assert.equal(typeof found.received_at, "string");
});

console.log("\n--- 3. Backend: POST /api/transcripts (invalid -> 4xx) ---");

await test("missing session_id -> 4xx", async () => {
  const { status } = await postJson("/api/transcripts", {
    segment_id: "x",
    text: "hi",
    final: true,
    timestamp: iso(),
  });
  assert.ok(status >= 400 && status < 500, `expected 4xx, got ${status}`);
});

await test("missing segment_id -> 4xx", async () => {
  const { status } = await postJson("/api/transcripts", {
    session_id: "s",
    text: "hi",
    final: true,
    timestamp: iso(),
  });
  assert.ok(status >= 400 && status < 500, `expected 4xx, got ${status}`);
});

await test("missing text -> 4xx", async () => {
  const { status } = await postJson("/api/transcripts", {
    session_id: "s",
    segment_id: "x",
    final: true,
    timestamp: iso(),
  });
  assert.ok(status >= 400 && status < 500, `expected 4xx, got ${status}`);
});

await test("missing final -> 4xx", async () => {
  const { status } = await postJson("/api/transcripts", {
    session_id: "s",
    segment_id: "x",
    text: "hi",
    timestamp: iso(),
  });
  assert.ok(status >= 400 && status < 500, `expected 4xx, got ${status}`);
});

await test("missing timestamp -> 4xx", async () => {
  const { status } = await postJson("/api/transcripts", {
    session_id: "s",
    segment_id: "x",
    text: "hi",
    final: true,
  });
  assert.ok(status >= 400 && status < 500, `expected 4xx, got ${status}`);
});

await test("final with wrong type (string) -> 4xx", async () => {
  const { status } = await postJson("/api/transcripts", {
    session_id: "s",
    segment_id: "x",
    text: "hi",
    final: "yes",
    timestamp: iso(),
  });
  assert.ok(status >= 400 && status < 500, `expected 4xx, got ${status}`);
});

await test("unparseable timestamp -> 4xx", async () => {
  const { status } = await postJson("/api/transcripts", {
    session_id: "s",
    segment_id: "x",
    text: "hi",
    final: true,
    timestamp: "not-a-date",
  });
  assert.ok(status >= 400 && status < 500, `expected 4xx, got ${status}`);
});

await test("malformed JSON body -> 400", async () => {
  const { status } = await postJson("/api/transcripts", "{not json", true);
  assert.equal(status, 400);
});

await test("non-object JSON body -> 4xx", async () => {
  const { status } = await postJson("/api/transcripts", [1, 2, 3]);
  assert.ok(status >= 400 && status < 500, `expected 4xx, got ${status}`);
});

console.log("\n--- 4. Backend: heartbeat ---");

await test("POST /api/handy/heartbeat is accepted and reflected in /api/status", async () => {
  const { status, json } = await postJson("/api/handy/heartbeat", {
    app_version: "9.9.9-test",
    recording: true,
    status: "recording",
    client: "test-suite",
  });
  assert.equal(status, 200);
  assert.equal(json.ok, true);

  const s = await getStatus();
  assert.ok(s.handy_heartbeat.last_heartbeat);
  assert.equal(s.handy_heartbeat.recording, true);
  assert.equal(s.handy_heartbeat.app_version, "9.9.9-test");
  assert.ok(s.counts.heartbeatsReceived >= 1);
});

await test("heartbeat with wrong type -> 4xx", async () => {
  const { status } = await postJson("/api/handy/heartbeat", { recording: "yes" });
  assert.ok(status >= 400 && status < 500, `expected 4xx, got ${status}`);
});

console.log("\n--- 5. Frontend logic: mergeTranscriptEvents (pure) ---");

await test("partial updates the same segment instead of duplicating it", () => {
  const events = [
    { session_id: "s1", segment_id: "1", text: "你好", final: false, timestamp: iso(-3000), source: "handy", received_at: iso(-3000) },
    { session_id: "s1", segment_id: "1", text: "你好嗎", final: false, timestamp: iso(-2000), source: "handy", received_at: iso(-2000) },
  ];
  const merged = mergeTranscriptEvents(events);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].text, "你好嗎");
  assert.equal(merged[0].final, false);
  assert.equal(merged[0].partialCount, 2);
});

await test("final replaces partial text on the SAME segment (no duplicate rows)", () => {
  const events = [
    { session_id: "s1", segment_id: "1", text: "你好", final: false, timestamp: iso(-3000), source: "handy", received_at: iso(-3000) },
    { session_id: "s1", segment_id: "1", text: "你好嗎？", final: true, timestamp: iso(-1000), source: "handy", received_at: iso(-1000) },
  ];
  const merged = mergeTranscriptEvents(events);
  assert.equal(merged.length, 1, "partial + final of one segment must merge into one row");
  assert.equal(merged[0].text, "你好嗎？");
  assert.equal(merged[0].final, true);
});

await test("different segments are kept separate and sorted by time", () => {
  const events = [
    { session_id: "s1", segment_id: "b", text: "第二句", final: true, timestamp: iso(-1000), source: "handy", received_at: iso(-1000) },
    { session_id: "s1", segment_id: "a", text: "第一句", final: true, timestamp: iso(-5000), source: "handy", received_at: iso(-5000) },
  ];
  const merged = mergeTranscriptEvents(events);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].segmentId, "a");
  assert.equal(merged[1].segmentId, "b");
});

await test("exact duplicate events (HTTP retry) are suppressed", () => {
  const e = { session_id: "s1", segment_id: "1", text: "你好", final: true, timestamp: iso(-1000), source: "handy", received_at: iso(-1000) };
  const merged = mergeTranscriptEvents([e, { ...e }]);
  assert.equal(merged.length, 1);
  assert.equal(transcriptEventKey(e), transcriptEventKey({ ...e }));
});

await test("different sessions with same segment id stay separate", () => {
  const events = [
    { session_id: "s1", segment_id: "1", text: "甲", final: true, timestamp: iso(-2000), source: "handy", received_at: iso(-2000) },
    { session_id: "s2", segment_id: "1", text: "乙", final: true, timestamp: iso(-1000), source: "handy", received_at: iso(-1000) },
  ];
  assert.equal(mergeTranscriptEvents(events).length, 2);
});

console.log("\n--- 6. Frontend logic: deriveStatus (four independent states) ---");

const NOW = Date.parse("2026-01-01T12:00:00.000Z");
const freshPayload = {
  backend: { ok: true, version: "0.1.0", started_at: "2026-01-01T11:00:00.000Z", uptime_seconds: 3600 },
  handy_heartbeat: { last_heartbeat: "2026-01-01T11:59:58.000Z", app_version: "1.0.0", recording: true, status: "recording", client: "handy" },
  transcripts: { total_events: 3, last_received_at: "2026-01-01T11:59:59.000Z" },
  counts: { transcriptsReceived: 3, heartbeatsReceived: 10 },
  events: [],
};

await test("all three states correct when everything is healthy", () => {
  const d = deriveStatus(true, freshPayload, NOW);
  assert.equal(d.backend, "ok");
  assert.equal(d.handyLink, "connected");
  assert.equal(d.transcript, "received");
  assert.equal(d.recording, true);
  assert.equal(d.lastReceivedAt, "2026-01-01T11:59:59.000Z");
});

await test("backend unreachable -> backend=unreachable, others unaffected", () => {
  const d = deriveStatus(false, null, NOW);
  assert.equal(d.backend, "unreachable");
  assert.equal(d.handyLink, "not_connected");
  assert.equal(d.transcript, "none");
});

await test("no heartbeat at all -> 'not_connected', NOT connected", () => {
  const payload = { ...freshPayload, handy_heartbeat: { ...freshPayload.handy_heartbeat, last_heartbeat: null } };
  const d = deriveStatus(true, payload, NOW);
  assert.equal(d.handyLink, "not_connected");
});

await test("heartbeat older than timeout -> 'timeout' (not connected)", () => {
  const stale = new Date(NOW - HEARTBEAT_TIMEOUT_MS - 1000).toISOString();
  const payload = { ...freshPayload, handy_heartbeat: { ...freshPayload.handy_heartbeat, last_heartbeat: stale } };
  const d = deriveStatus(true, payload, NOW);
  assert.equal(d.handyLink, "timeout");
});

await test("heartbeat OK but zero transcripts -> transcript=none", () => {
  const payload = { ...freshPayload, transcripts: { total_events: 0, last_received_at: null } };
  const d = deriveStatus(true, payload, NOW);
  assert.equal(d.handyLink, "connected");
  assert.equal(d.transcript, "none");
});

console.log("\n--- 7. Frontend page smoke test ---");

await test("GET /bridge returns 200 and renders the three status cards + clear button", async () => {
  const res = await fetch(base + "/bridge", { cache: "no-store" });
  assert.equal(res.status, 200);
  const html = await res.text();
  for (const label of ["後端狀態", "heartbeat", "語音文字接收狀態", "清除顯示", "partial", "final"]) {
    assert.ok(html.includes(label), `/bridge HTML should contain "${label}"`);
  }
});

console.log("\n--- 8. Full simulated Handy flow (heartbeat -> partial -> final -> stop) ---");

await test("complete flow: heartbeat, two segments partial->final, final heartbeat", async () => {
  const flowSession = `flow-${Date.now()}`;

  // (a) Handy starts recording -> heartbeat recording=true
  let r = await postJson("/api/handy/heartbeat", {
    app_version: "flow-test",
    recording: true,
    status: "recording",
    client: "simulated-handy",
  });
  assert.equal(r.status, 200);

  // (b) first sentence: partial then final
  r = await postJson("/api/transcripts", {
    session_id: flowSession, segment_id: "seg-001", text: "第一句話。", final: false, timestamp: iso(-2000), source: "handy",
  });
  assert.equal(r.status, 200);
  r = await postJson("/api/transcripts", {
    session_id: flowSession, segment_id: "seg-001", text: "第一句話。", final: true, timestamp: iso(-1500), source: "handy",
  });
  assert.equal(r.status, 200);

  // (c) second sentence: proves it is not "only the first segment works"
  r = await postJson("/api/transcripts", {
    session_id: flowSession, segment_id: "seg-002", text: "第二句話，這是繁體中文。", final: false, timestamp: iso(-1000), source: "handy",
  });
  assert.equal(r.status, 200);
  r = await postJson("/api/transcripts", {
    session_id: flowSession, segment_id: "seg-002", text: "第二句話，這是繁體中文。", final: true, timestamp: iso(-500), source: "handy",
  });
  assert.equal(r.status, 200);

  // (d) recording stops -> final heartbeat recording=false
  r = await postJson("/api/handy/heartbeat", {
    app_version: "flow-test",
    recording: false,
    status: "idle",
    client: "simulated-handy",
  });
  assert.equal(r.status, 200);

  // (e) verify via /api/status exactly like the frontend does
  const status = await getStatus();
  assert.equal(status.handy_heartbeat.recording, false, "final heartbeat must report recording=false");

  const flowEvents = status.events.filter((e) => e.session_id === flowSession);
  assert.equal(flowEvents.length, 4, "expected 4 events for the flow session");

  const merged = mergeTranscriptEvents(flowEvents);
  assert.equal(merged.length, 2, "two segments must stay two rows");
  assert.ok(merged.every((m) => m.final), "both segments must end as final");
  assert.equal(merged[0].text, "第一句話。");
  assert.equal(merged[1].text, "第二句話，這是繁體中文。");

  // (f) derived status shows everything green
  const d = deriveStatus(true, status, Date.now());
  assert.equal(d.handyLink, "connected");
  assert.equal(d.transcript, "received");
  assert.ok(d.lastReceivedAt);
});

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
if (failed > 0) {
  console.log("\nFailures:");
  for (const f of failures) {
    console.log(`- ${f.name}`);
  }
  process.exit(1);
}
console.log("ALL TESTS PASSED");

#!/usr/bin/env python3
"""
Handy Local Bridge — Handy-side client (SIMULATOR).

This script implements the EXACT HTTP contract that the real Handy desktop app
is supposed to implement (see handy_integration_snippet.rs for the Rust
version that would live inside Handy's Tauri app):

  POST {base}/api/handy/heartbeat   — periodic "I am alive" report
  POST {base}/api/transcripts       — one ASR transcript event (partial/final)

It exists so the full pipeline (Handy -> HTTP -> backend -> frontend) can be
verified on a machine where the real Handy build is not available. Every line
it prints is prefixed with [SIMULATOR] so it can never be mistaken for real
Handy output.

Usage:
  python handy_bridge_client.py                          # heartbeat + one demo segment
  python handy_bridge_client.py --text "你好" --text "第二句話"
  python handy_bridge_client.py --base-url http://127.0.0.1:8765 --session-id demo-1

Environment:
  BRIDGE_BASE_URL   default base URL (overridden by --base-url)

The script never blocks on network errors: failures are printed and the
exit code is non-zero, but the process always terminates cleanly.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import threading
import time
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timezone

DEFAULT_BASE_URL = os.environ.get("BRIDGE_BASE_URL", "http://127.0.0.1:8765")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def post_json(base_url: str, path: str, payload: dict, timeout: float = 3.0) -> dict:
    """POST a JSON body, return the decoded response. Raises on failure."""
    url = base_url.rstrip("/") + path
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "Content-Type": "application/json; charset=utf-8",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def send_heartbeat(base_url: str, app_version: str, recording: bool, status: str) -> None:
    payload = {
        "app_version": app_version,
        "recording": recording,
        "status": status,
        "client": "handy-bridge-simulator",
    }
    post_json(base_url, "/api/handy/heartbeat", payload)
    print(f"[SIMULATOR] heartbeat sent (recording={recording}, status={status})")


def send_transcript(
    base_url: str,
    session_id: str,
    segment_id: str,
    text: str,
    final: bool,
) -> None:
    payload = {
        "session_id": session_id,
        "segment_id": segment_id,
        "text": text,
        "final": final,
        "timestamp": now_iso(),
        "source": "handy",
    }
    post_json(base_url, "/api/transcripts", payload)
    print(f"[SIMULATOR] transcript sent ({'final' if final else 'partial'}): {text}")


def heartbeat_loop(base_url: str, app_version: str, interval: float, stop: threading.Event) -> None:
    while not stop.is_set():
        try:
            send_heartbeat(base_url, app_version, recording=True, status="recording")
        except Exception as exc:  # network failure must never crash the loop silently
            print(f"[SIMULATOR] heartbeat FAILED: {exc}", file=sys.stderr)
        stop.wait(interval)


def main() -> int:
    parser = argparse.ArgumentParser(description="Handy Local Bridge — Handy-side client (SIMULATOR)")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL, help="bridge backend base URL")
    parser.add_argument("--session-id", default=None, help="recording session id (default: random)")
    parser.add_argument("--app-version", default="0.0.0-simulator", help="reported app version")
    parser.add_argument("--heartbeat-interval", type=float, default=5.0, help="seconds between heartbeats")
    parser.add_argument("--no-heartbeat", action="store_true", help="disable the heartbeat loop")
    parser.add_argument(
        "--text",
        action="append",
        default=None,
        help="transcript text to send (repeatable). Each text is sent as partial then final.",
    )
    args = parser.parse_args()

    base_url = args.base_url
    session_id = args.session_id or f"sim-{uuid.uuid4().hex[:8]}"
    texts = args.text or ["你好，這是本機橋接測試。"]

    print(f"[SIMULATOR] base url : {base_url}")
    print(f"[SIMULATOR] session  : {session_id}")
    print("[SIMULATOR] this is a SIMULATOR, not the real Handy app.")

    stop = threading.Event()
    thread = None
    if not args.no_heartbeat:
        thread = threading.Thread(
            target=heartbeat_loop,
            args=(base_url, args.app_version, args.heartbeat_interval, stop),
            daemon=True,
        )
        thread.start()

    exit_code = 0
    try:
        for index, text in enumerate(texts):
            segment_id = f"seg-{index + 1:03d}"
            try:
                # Real ASR emits partial updates first, then one final result.
                send_transcript(base_url, session_id, segment_id, text, final=False)
                time.sleep(0.3)
                send_transcript(base_url, session_id, segment_id, text, final=True)
            except Exception as exc:
                print(f"[SIMULATOR] transcript FAILED: {exc}", file=sys.stderr)
                exit_code = 1
            time.sleep(0.2)
    finally:
        stop.set()
        if thread is not None:
            thread.join(timeout=2.0)
        if not args.no_heartbeat:
            try:
                # Recording stopped — report the final state, like Handy does.
                send_heartbeat(base_url, args.app_version, recording=False, status="idle")
            except Exception as exc:
                print(f"[SIMULATOR] final heartbeat FAILED: {exc}", file=sys.stderr)
                exit_code = 1

    print(f"[SIMULATOR] done (exit={exit_code})")
    return exit_code


if __name__ == "__main__":
    sys.exit(main())

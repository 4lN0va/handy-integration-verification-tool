# handy-integration-verification-tool

A local verification harness for the **HANDY** desktop integration. It exposes a tiny Next.js backend + dashboard that mirrors the exact HTTP contract the real HANDY app is expected to implement, so the full pipeline (HANDY → HTTP → backend → frontend) can be validated on a machine where the real HANDY build is not available.

> **Status:** developer tool. Not a production service. No external exposure; everything binds to `127.0.0.1`.

---

## What's inside

| Path | Role |
|---|---|
| `src/app/api/*` | Next.js API routes: `health`, `hady/heartbeat`, `transcripts`, `status` |
| `src/app/bridge/*` | Browser dashboard that polls `/api/status` every 1.5 s |
| `src/lib/*` | Pure logic: status, store, validation, transcript merge |
| `tools/local_bridge/handy_bridge_client.py` | **Python simulator** that posts the same payloads real HANDY would send |
| `tools/local_bridge/handy_integration_snippet.rs` | **Rust reference** showing the snippet that would live inside HANDY's Tauri app |
| `tools/local_bridge/*.ps1` | Windows PowerShell helpers (start backend, start all, run tests) |
| `tools/local_bridge/test_backend.mjs` | Node smoke test against the running backend |

The Python client is a **simulator** — every line it prints is prefixed with `[SIMULATOR]` so it can never be mistaken for real HANDY output.

---

## Prerequisites

- Node.js ≥ 18 (tested on 20/22)
- npm
- Windows PowerShell 5.1+ **only if** you want the `.ps1` helpers; on Linux/macOS use the npm commands directly
- Python 3.9+ (only for the simulator)

---

## Quick start

### 1. Install

```bash
npm install
```

### 2. Build

```bash
npm run build
```

The backend and the dashboard are served by the **same** Next.js process.

### 3. Start

```bash
npx next start -H 127.0.0.1 -p 8765
```

Or, on Windows:

```powershell
.\tools\local_bridge\start_backend.ps1
```

The helper auto-installs deps and builds on first run, then launches `next start` bound to `127.0.0.1:8765`.

### 4. Open the dashboard

```
http://127.0.0.1:8765/bridge
```

### 5. Simulate a HANDY client

In a second terminal:

```bash
python tools/local_bridge/handy_bridge_client.py
python tools/local_bridge/handy_bridge_client.py --text "你好" --text "第二句話"
```

You should see heartbeat + transcript events appear on the dashboard.

### 6. Run the backend smoke test

```bash
node tools/local_bridge/test_backend.mjs
```

---

## Configuration

| Item | Default | Override |
|---|---|---|
| Bind address | `127.0.0.1` | `npx next start -H <host> -p <port>` |
| Port | `8765` | `-Port <port>` (PowerShell) / `-p <port>` (npm) |
| Base URL (simulator) | `http://127.0.0.1:8765` | env `BRIDGE_BASE_URL` or `--base-url` |
| Session id (simulator) | auto | `--session-id <id>` |

The backend requires **no database**. The `health` route reports `database: "not_required"` by design.

---

## Port convention with HANDY

This tool does **not** listen on the port the real HANDY app uses internally. It listens on `8765` (local bridge) by default. If you are integrating against a real HANDY build, the handshake is:

```
HANDY (Tauri, Rust)  ──HTTP POST──▶  127.0.0.1:8765/api/handy/heartbeat
HANDY (Tauri, Rust)  ──HTTP POST──▶  127.0.0.1:8765/api/transcripts
```

See `tools/local_bridge/handy_integration_snippet.rs` for the exact Rust payload shape.

---

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Next.js dev mode (HMR, on port 3000 by default) |
| `npm run build` | Production build |
| `npm run start` | Production start (port 3000 by default; override with `-H`/`-p`) |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |

The `.ps1` helpers wrap the npm commands and default the port to `8765`.

---

## API surface

| Method | Path | Purpose |
|---|---|---|
| `GET`  | `/api/health` | Liveness; returns `database: "not_required"` |
| `POST` | `/api/handy/heartbeat` | Periodic "I am alive" from HANDY |
| `POST` | `/api/transcripts` | One ASR transcript event (partial or final) |
| `GET`  | `/api/status` | Current bridge state for the dashboard poll |

All routes bind to `127.0.0.1` when started via the provided helpers.

---

## Testing

- `node tools/local_bridge/test_backend.mjs` — smoke test against the running backend
- `.\tools\local_bridge\run_tests.ps1` — Windows wrapper (starts backend + runs smoke test)
- `.\tools\local_bridge\start_all.ps1` — starts backend + dashboard + simulator in three windows

---

## License

[MIT](./LICENSE)

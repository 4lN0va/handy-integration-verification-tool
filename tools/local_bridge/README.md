# Handy Local Bridge — 本機前後端整合驗證工具

> 開發測試工具，不是正式產品。無額外依賴、無資料庫、無登入、無部署架構。
> 後端與前端由同一個 Next.js server 提供（使用 repository 現有的技術）。

## 重要前提（請先讀）

**本 repository 目前不包含 Handy（Rust / Tauri）原始碼** — 這個 snapshot 只有
Next.js + PostgreSQL starter。因此：

- 真實 Handy 內的事件 → HTTP 橋接程式無法在本 repo 編譯或實測，已提供
  最小 Rust 整合程式碼片段：`handy_integration_snippet.rs`（複製到真實
  Handy fork 對應位置即可）。
- 為了驗證「Handy → HTTP → 後端 → 前端」整個傳輸鏈，提供
  `handy_bridge_client.py` **模擬器**，它實作與真實 Handy 完全相同的
  HTTP contract（heartbeat + transcripts）。模擬器的輸出會明確標示
  `[SIMULATOR]`，**不得**被當作真實 Handy 整合通過的證據。
- 真實麥克風 + Handy.exe 的端到端測試在本環境中標記為 **BLOCKED**。

## 架構

```
Handy (真實 app / 或 handy_bridge_client.py 模擬器)
   │  POST /api/handy/heartbeat   (每 5 秒)
   │  POST /api/transcripts       (ASR partial / final)
   ▼
本機後端（Next.js API routes，只綁定 127.0.0.1:8765）
   │  記憶體保存最近 100 筆事件（不存音訊、不存金鑰、不存 Authorization header）
   ▼
本機前端 http://127.0.0.1:8765/bridge（每 1.5 秒輪詢 GET /api/status）
```

## 三個獨立狀態（互不影響）

| 狀態 | 判斷來源 | 可能值 |
|---|---|---|
| 後端狀態 | `GET /api/health`、`/api/status` 是否成功 | 正常 / 無法連線 |
| Handy heartbeat | 是否收到 15 秒內的 heartbeat | 已連線 / 尚未連線 / 已逾時 |
| 語音文字接收 | 是否收到任何合法 transcript event | 尚無資料 / 已收到文字 |

## 啟動方式（Windows PowerShell）

一鍵啟動（後端 + 開啟瀏覽器）：

```powershell
.\tools\local_bridge\start_all.ps1
```

若只要先熟悉整個鏈路，可加上 `-Simulate`（啟動模擬器送出 heartbeat 與測試逐字稿）：

```powershell
.\tools\local_bridge\start_all.ps1 -Simulate
```

分開啟動：

```powershell
# 1. 啟動後端（只綁定 127.0.0.1:8765，第一次會自動 build）
.\tools\local_bridge\start_backend.ps1

# 2. 開啟瀏覽器

# 3. 開啟瀏覽器
#    http://127.0.0.1:8765/bridge
```

啟動後端後，API 位址：

- `GET  http://127.0.0.1:8765/api/health`
- `POST http://127.0.0.1:8765/api/handy/heartbeat`
- `POST http://127.0.0.1:8765/api/transcripts`
- `GET  http://127.0.0.1:8765/api/status`

## 自動化測試

```powershell
# 先啟動後端（start_backend.ps1 或 start_all.ps1），再執行：
.\tools\local_bridge\run_tests.ps1
```

或直接：

```powershell
node .\tools\local_bridge\test_backend.mjs --base-url http://127.0.0.1:8765
```

測試涵蓋：health、合法/非法 transcript（缺欄位、錯型別、錯誤 JSON → 4xx）、
繁體中文 UTF-8、session_id/segment_id 保留、partial→final 合併、三狀態獨立
推導、/bridge 頁面渲染、以及完整模擬流程（heartbeat → 第一句 partial/final
→ 第二句 partial/final → 停止 heartbeat）。

## Handy 端整合（真實 Handy fork）

最小整合點（詳見 `handy_integration_snippet.rs`）：

1. **錄音開始**：產生 `session_id`，背景 thread 每 5 秒送
   `POST /api/handy/heartbeat`（`recording: true`）。
2. **ASR 事件**（Breeze-ASR-25 的 partial / final 文字）：
   `POST /api/transcripts`，body：

```json
{
  "session_id": "<本次錄音 id>",
  "segment_id": "<該句 segment id，同一句 partial/final 必須相同>",
  "text": "你好嗎",
  "final": false,
  "timestamp": "2026-01-01T12:00:00.000Z",
  "source": "handy"
}
```

3. **錄音停止**：最後一次 heartbeat，`recording: false`。

規則：網路請求必須在背景 thread 執行（timeout 建議 2 秒），不得阻塞麥克風、
ASR 或 UI；失敗只記錄 log，不得假裝上傳成功；預設只允許 127.0.0.1，除非
使用者明確設定其他端點。

## 安全與可靠性

- 預設只綁定 `127.0.0.1`（`next start -H 127.0.0.1 -p 8765`）。
- 不對外傳送語音或文字；不收集 API 金鑰；不記錄 Authorization header；
  不保存原始音訊；事件只留在記憶體（最近 100 筆）。
- heartbeat / HTTP timeout 不會阻塞錄音流程。
- 不會刪除或重置任何既有資料；不修改全域環境設定。

## 真實環境驗收流程（有 Windows + 麥克風 + Handy build 時）

1. `start_all.ps1` → 瀏覽器開 `/bridge`。
2. 確認「後端狀態：正常」。
 3. 開啟 Handy → 確認「Handy heartbeat：已連線」。
 4. 按錄音快捷鍵，說一句繁體中文 → 等 Breeze-ASR-25 辨識。
 5. 確認後端 log / `/api/status` 收到該文字，`/bridge` 即時顯示相同文字。
 6. 再說第二句 → 確認不是只有第一個 segment 成功。
 7. 停止錄音 → 確認最後一個 segment 以 final 正確完成。
8. 停止錄音 → 確認最後一個 segment 以 final 正確完成。

## 檔案清單

| 檔案 | 說明 |
|---|---|
| `start_backend.ps1` | 啟動本機後端（127.0.0.1:8765） |
 | `start_all.ps1` | 一鍵啟動：後端 +（可選）模擬器 + 瀏覽器 |
| `handy_bridge_client.py` | Handy-side client **模擬器**（與真實 Handy 相同的 HTTP contract） |
| `handy_integration_snippet.rs` | 真實 Handy（Rust/Tauri）最小整合程式碼片段（未在本 repo 編譯） |
| `test_backend.mjs` | 自動化測試（後端 API + 前端邏輯 + 模擬整合流程） |
| `run_tests.ps1` | 執行自動化測試 |
| 後端 API | `src/app/api/health`、`api/status`、`api/transcripts`、`api/handy/heartbeat` |
| 共用邏輯 | `src/lib/bridge-store.ts`、`bridge-validate.ts`、`transcript-merge.ts`、`bridge-status.ts` |
| 前端畫面 | `src/app/bridge/page.tsx`、`src/app/bridge/BridgeDashboard.tsx` |

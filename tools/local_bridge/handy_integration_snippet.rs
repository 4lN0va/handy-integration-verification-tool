/**
 * Handy Local Bridge — 最小整合程式碼片段（Rust / Tauri 端）
 *
 * 複製到真實 Handy fork 對應位置即可。本文件僅為參考片段，
 * 未在本 repository 編譯或實測；完整實作請見 Handy fork 的
 * `src-tauri/src/bridge.rs`。
 *
 * HTTP contract（與本工具後端一致）：
 *   POST /api/handy/heartbeat   — 每 5 秒，body:
 *     { app_version, recording, status, client }
 *   POST /api/transcripts       — ASR partial / final，body:
 *     { session_id, segment_id, text, final, timestamp, source }
 *
 * 規則：
 *   - 網路請求必須在背景 thread 執行（timeout 建議 2 秒），
 *     不得阻塞麥克風、ASR 或 UI。
 *   - 失敗只記錄 log，不得假裝上傳成功。
 *   - 預設只允許 127.0.0.1，除非使用者明確設定其他端點。
 */

use std::time::Duration;

const DEFAULT_BRIDGE_URL: &str = "http://127.0.0.1:8765";
const HEARTBEAT_INTERVAL_MS: u64 = 5_000;
const HTTP_TIMEOUT_MS: u64 = 2_000;

#[derive(Clone, serde::Serialize)]
struct HeartbeatBody {
    app_version: String,
    recording: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    status: Option<String>,
    client: String,
}

#[derive(Clone, serde::Serialize)]
struct TranscriptBody {
    session_id: String,
    segment_id: String,
    text: String,
    final_: bool,
    timestamp: String,
    source: String,
}

pub struct BridgeClient {
    base_url: String,
    http: reqwest::Client,
}

impl BridgeClient {
    pub fn new(base_url: impl Into<String>) -> Self {
        let http = reqwest::Client::builder()
            .timeout(Duration::from_millis(HTTP_TIMEOUT_MS))
            .build()
            .expect("reqwest client");
        Self {
            base_url: base_url.into(),
            http,
        }
    }

    pub fn send_heartbeat(
        &self,
        body: HeartbeatBody,
    ) -> Result<(), String> {
        let url = format!("{}/api/handy/heartbeat", self.base_url);
        let res = self
            .http
            .post(&url)
            .json(&body)
            .send()
            .map_err(|e| format!("heartbeat request failed: {e}"))?;
        if !res.status().is_success() {
            return Err(format!("heartbeat returned HTTP {}", res.status()));
        }
        Ok(())
    }

    pub fn send_transcript(
        &self,
        body: TranscriptBody,
    ) -> Result<(), String> {
        let url = format!("{}/api/transcripts", self.base_url);
        let res = self
            .http
            .post(&url)
            .json(&body)
            .send()
            .map_err(|e| format!("transcript request failed: {e}"))?;
        if !res.status().is_success() {
            return Err(format!("transcript returned HTTP {}", res.status()));
        }
        Ok(())
    }
}

/// 背景 heartbeat thread：每 5 秒送一次，recording 狀態由外部 flag 決定。
pub fn spawn_heartbeat(
    client: BridgeClient,
    app_version: String,
    is_recording: std::sync::Arc<std::sync::AtomicBool>,
) {
    std::thread::spawn(move || loop {
        let recording = is_recording.load(std::sync::atomic::Ordering::SeqCst);
        let status = if recording { Some("recording".to_string()) } else { None };
        let body = HeartbeatBody {
            app_version: app_version.clone(),
            recording,
            status,
            client: "handy".to_string(),
        };
        if let Err(e) = client.send_heartbeat(body) {
            log::warn!("[bridge] heartbeat failed: {e}");
        }
        std::thread::sleep(Duration::from_millis(HEARTBEAT_INTERVAL_MS));
    });
}

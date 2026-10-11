"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  deriveStatus,
  type HandyLinkState,
  type StatusPayload,
} from "@/lib/bridge-status";
import { mergeTranscriptEvents } from "@/lib/transcript-merge";

const POLL_INTERVAL_MS = 1500;
const FETCH_TIMEOUT_MS = 5000;

type BadgeTone = "green" | "red" | "amber" | "slate";

function Badge({ tone, children }: { tone: BadgeTone; children: React.ReactNode }) {
  const colors: Record<BadgeTone, string> = {
    green: "bg-emerald-100 text-emerald-800 ring-emerald-300",
    red: "bg-rose-100 text-rose-800 ring-rose-300",
    amber: "bg-amber-100 text-amber-800 ring-amber-300",
    slate: "bg-slate-200 text-slate-700 ring-slate-300",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ring-1 ring-inset ${colors[tone]}`}
    >
      {children}
    </span>
  );
}

function StatusCard({
  title,
  badgeTone,
  badgeText,
  children,
}: {
  title: string;
  badgeTone: BadgeTone;
  badgeText: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-white p-5 shadow-[0_12px_32px_rgba(16,24,40,0.08)] ring-1 ring-slate-200">
      <div className="flex items-center justify-between gap-3">
        <h2 className="m-0 text-base font-semibold text-slate-900">{title}</h2>
        <Badge tone={badgeTone}>{badgeText}</Badge>
      </div>
      {children ? <div className="mt-3 text-sm text-slate-600">{children}</div> : null}
    </section>
  );
}

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("zh-TW", { hour12: false });
}

export default function BridgeDashboard() {
  const [payload, setPayload] = useState<StatusPayload | null>(null);
  const [fetchOk, setFetchOk] = useState(false);
  const [lastPollAt, setLastPollAt] = useState<string | null>(null);
  /** Events received before this timestamp are hidden locally (clear display). */
  const [hiddenBefore, setHiddenBefore] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const abortRef = useRef<AbortController | null>(null);

  const poll = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch("/api/status", {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as StatusPayload;
      setPayload(json);
      setFetchOk(true);
    } catch {
      setFetchOk(false);
    } finally {
      setLastPollAt(new Date().toISOString());
      setNowMs(Date.now());
    }
  }, []);

  useEffect(() => {
    void poll();
    const id = setInterval(() => {
      void poll();
      setNowMs(Date.now());
    }, POLL_INTERVAL_MS);
    return () => {
      clearInterval(id);
      abortRef.current?.abort();
    };
  }, [poll]);

  const derived = useMemo(
    () => deriveStatus(fetchOk, payload, nowMs),
    [fetchOk, payload, nowMs],
  );

  const visibleEvents = useMemo(() => {
    const events = payload?.events ?? [];
    if (!hiddenBefore) return events;
    return events.filter((e) => e.received_at > hiddenBefore);
  }, [payload, hiddenBefore]);

  const segments = useMemo(() => mergeTranscriptEvents(visibleEvents), [visibleEvents]);

  const backendTone: BadgeTone = derived.backend === "ok" ? "green" : "red";
  const backendText = derived.backend === "ok" ? "正常" : "無法連線";

  const linkTone: Record<HandyLinkState, BadgeTone> = {
    connected: "green",
    not_connected: "amber",
    timeout: "red",
  };
  const linkText: Record<HandyLinkState, string> = {
    connected: "已連線",
    not_connected: "尚未連線",
    timeout: "已逾時",
  };

  const transcriptTone: BadgeTone = derived.transcript === "received" ? "green" : "slate";
  const transcriptText =
    derived.transcript === "received" ? "已收到文字" : "尚無資料";

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 text-slate-900">
      <div className="mx-auto w-full max-w-4xl">
        <header className="mb-6">
          <h1 className="m-0 text-2xl font-bold">Handy Local Bridge 本機驗證工具</h1>
          <p className="mt-2 text-sm text-slate-600">
            每 {POLL_INTERVAL_MS / 1000} 秒輪詢 /api/status。三個狀態獨立判斷，互不影響。
            {payload?.backend?.version ? ` 後端版本 v${payload.backend.version}` : ""}
            {" · 最後輪詢："}
            {formatTime(lastPollAt)}
          </p>
        </header>

        <div className="grid gap-4 md:grid-cols-2">
          <StatusCard
            title="後端狀態（/api/health、/api/status）"
            badgeTone={backendTone}
            badgeText={backendText}
          >
            {derived.backend === "ok"
              ? `已運行 ${payload?.backend.uptime_seconds ?? 0} 秒`
              : "無法連線到本機後端，請確認 start_backend.ps1 是否已啟動。"}
          </StatusCard>

          <StatusCard
            title="Handy heartbeat 連線狀態"
            badgeTone={linkTone[derived.handyLink]}
            badgeText={linkText[derived.handyLink]}
          >
            {derived.handyLink === "connected" &&
              `Handy 正在回報心跳${derived.recording ? "（錄音中）" : "（待機中）"}`}
            {derived.handyLink === "not_connected" &&
              "尚未收到任何 heartbeat。若程序已執行，代表整合連線尚未確認。"}
            {derived.handyLink === "timeout" &&
              "曾收到 heartbeat，但已超過 15 秒未更新，可能已關閉或斷線。"}
            {" · 最近心跳："}
            {formatTime(payload?.handy_heartbeat.last_heartbeat ?? null)}
            {payload?.handy_heartbeat.app_version
              ? ` · 版本 ${payload.handy_heartbeat.app_version}`
              : ""}
          </StatusCard>

          <StatusCard
            title="語音文字接收狀態"
            badgeTone={transcriptTone}
            badgeText={transcriptText}
          >
            累計收到 {payload?.transcripts.total_events ?? 0} 筆事件。
            {" · 最近接收時間："}
            {formatTime(derived.lastReceivedAt)}
          </StatusCard>
        </div>

        {derived.notes.length > 0 && (
          <div className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">
            <p className="m-0 font-semibold">注意</p>
            <ul className="m-0 mt-1 list-disc pl-5">
              {derived.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </div>
        )}

        <section className="mt-6 rounded-2xl bg-white p-5 shadow-[0_12px_32px_rgba(16,24,40,0.08)] ring-1 ring-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="m-0 text-base font-semibold">
              收到的逐字稿（partial 即時更新、final 顯示最終文字）
            </h2>
            <button
              type="button"
              onClick={() => setHiddenBefore(new Date().toISOString())}
              className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
            >
              清除顯示
            </button>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            「清除顯示」只會清空本機畫面，不會刪除後端記憶體資料，也不會影響 Handy
            內的逐字稿。
          </p>

          {segments.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">
              尚無資料。啟動 Handy 並說話後，這裡會即時顯示 Handy 真正送出的文字。
            </p>
          ) : (
            <ul className="mt-4 space-y-3">
              {segments.map((seg) => (
                <li
                  key={`${seg.sessionId}|${seg.segmentId}`}
                  className="rounded-xl border border-slate-200 p-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    {seg.final ? (
                      <Badge tone="green">final</Badge>
                    ) : (
                      <Badge tone="amber">partial（辨識中）</Badge>
                    )}
                    <span className="text-xs text-slate-500">
                      session: {seg.sessionId}
                    </span>
                    <span className="text-xs text-slate-500">
                      segment: {seg.segmentId}
                    </span>
                    <span className="text-xs text-slate-500">
                      接收時間: {formatTime(seg.receivedAt)}
                    </span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-lg leading-relaxed text-slate-900">
                    {seg.text || <span className="text-slate-400">（空白）</span>}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <footer className="mt-6 text-xs text-slate-500">
          只綁定 127.0.0.1，不對外傳送語音或文字，不記錄 API 金鑰與 Authorization
          header，不保存原始音訊。
        </footer>
      </div>
    </main>
  );
}

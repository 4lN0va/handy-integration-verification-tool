import type { Metadata } from "next";
import BridgeDashboard from "./BridgeDashboard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Handy Local Bridge — 本機驗證工具",
  description:
    "驗證 Handy 是否執行、本機後端是否正常、Handy 是否真的把語音辨識文字送到後端。",
};

export default function BridgePage() {
  return <BridgeDashboard />;
}

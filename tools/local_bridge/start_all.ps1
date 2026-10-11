#Requires -Version 5.1
<#
.SYNOPSIS
    一鍵啟動 Handy Local Bridge：後端 +（可選）模擬器 + 開啟瀏覽器。

.DESCRIPTION
    流程：
      1. 在新視窗啟動本機後端（127.0.0.1:8765）
      2. 等待 /api/health 成功
      3. （-Simulate）在新視窗啟動 Python 模擬器，送出 heartbeat 與測試逐字稿
      4. 開啟瀏覽器 http://127.0.0.1:8765/bridge

    模擬器只是為了在沒有真實 Handy 時驗證整個傳輸鏈，不代表真實 Handy 整合通過。

.EXAMPLE
    .\start_all.ps1
    .\start_all.ps1 -Simulate
    .\start_all.ps1 -Simulate -SimulateText "你好，請幫我記錄這句話。"
#>

[CmdletBinding()]
param(
    [int]$Port = 8765,
    [switch]$Simulate,
    [string]$SimulateText = "你好，這是本機橋接測試。",
    [string]$Python = "python"
)

$ErrorActionPreference = "Stop"
$baseUrl = "http://127.0.0.1:$Port"

Write-Host "[start_all] 啟動本機後端（新視窗）..."
Start-Process powershell -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-File", "`"$PSScriptRoot\start_backend.ps1`"", "-Port", $Port

Write-Host "[start_all] 等待後端健康檢查..."
$healthy = $false
for ($i = 0; $i -lt 120; $i++) {
    try {
        $health = Invoke-RestMethod -Uri "$baseUrl/api/health" -TimeoutSec 2
        if ($health.ok) {
            $healthy = $true
            break
        }
    } catch {
        Start-Sleep -Seconds 1
    }
}

if (-not $healthy) {
    Write-Warning "[start_all] 後端尚未就緒（可能還在 build），請稍後再開 $baseUrl/bridge"
} else {
    Write-Host "[start_all] 後端已就緒：$baseUrl/api/health"
}

if ($Simulate) {
    Write-Host "[start_all] 啟動模擬器（SIMULATOR，非真實 Handy）..."
    $simArgs = @(
        "-NoExit", "-ExecutionPolicy", "Bypass", "-Command",
        "& '$Python' '$PSScriptRoot\handy_bridge_client.py' --base-url '$baseUrl' --text '$SimulateText'; Read-Host '按 Enter 關閉'"
    )
    Start-Process powershell -ArgumentList $simArgs
}

Write-Host "[start_all] 開啟瀏覽器：$baseUrl/bridge"
Start-Process "$baseUrl/bridge"

Write-Host "[start_all] 完成。在瀏覽器觀察三個狀態：後端 / heartbeat / 語音文字。"
if (-not $Simulate) {
    Write-Host "[start_all] 提示：開啟 Handy 並說話即可看到真實辨識文字；或用 -Simulate 先跑模擬流程。"
}

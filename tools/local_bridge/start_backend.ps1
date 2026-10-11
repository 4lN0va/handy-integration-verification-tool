#Requires -Version 5.1
<#
.SYNOPSIS
    啟動 Handy Local Bridge 本機後端（Next.js API routes），只綁定 127.0.0.1。

.DESCRIPTION
    後端與前端由同一個 Next.js server 提供：
      後端 API：http://127.0.0.1:8765/api/...（health / heartbeat / transcripts / status）
      前端畫面：http://127.0.0.1:8765/bridge

    預設只監聽 127.0.0.1，不對外開放。
    第一次執行會先 build；之後若 .next/BUILD_ID 已存在則直接啟動。

.EXAMPLE
    .\start_backend.ps1
    .\start_backend.ps1 -Port 8765
#>

[CmdletBinding()]
param(
    [int]$Port = 8765
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $repoRoot

Write-Host "[start_backend] repo root = $repoRoot"
Write-Host "[start_backend] 監聽位址   = http://127.0.0.1:$Port"

if (-not (Test-Path (Join-Path $repoRoot "node_modules"))) {
    Write-Host "[start_backend] 安裝依賴..."
    npm install
}

if (-not (Test-Path (Join-Path $repoRoot ".next\BUILD_ID"))) {
    Write-Host "[start_backend] 尚未 build，開始建置..."
    npm run build
    if ($LASTEXITCODE -ne 0) {
        throw "[start_backend] build 失敗，請先手動執行 npm run build 查看錯誤。"
    }
}

Write-Host "[start_backend] 啟動後端（前端畫面：http://127.0.0.1:$Port/bridge）"
Write-Host "[start_backend] 按 Ctrl+C 停止。"
npx next start -H 127.0.0.1 -p $Port

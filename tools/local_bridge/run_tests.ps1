#Requires -Version 5.1
<#
.SYNOPSIS
    執行 Handy Local Bridge 自動化測試（後端 API + 前端邏輯 + 整合流程模擬）。

.EXAMPLE
    .\run_tests.ps1
    .\run_tests.ps1 -BaseUrl http://127.0.0.1:8765
#>

[CmdletBinding()]
param(
    [string]$BaseUrl = "http://127.0.0.1:8765"
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)

node (Join-Path $PSScriptRoot "test_backend.mjs") --base-url $BaseUrl --repo-root $repoRoot
if ($LASTEXITCODE -ne 0) {
    throw "測試失敗，請查看上方輸出。"
}

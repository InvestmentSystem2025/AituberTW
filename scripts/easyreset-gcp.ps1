#!/usr/bin/env pwsh
# easyreset-gcp.ps1 - docker-compose.gcp.yml 用：Supabase DB 重置並重新初始化
# 功能：停止（down）gcp compose 服務、刪除 DB volume、重新啟動（up）以觸發 init.sql

param(
    [switch]$Help,
    # 專案根目錄下的 compose 檔案（VM 部署用）
    [string]$ComposeFile = "docker-compose.gcp.yml",
    # Compose project name；預設使用 $env:COMPOSE_PROJECT_NAME，否則使用專案資料夾名稱
    [string]$ProjectName,
    # 是否同時重置 Storage volume（預設只洗 DB）
    [switch]$ResetStorage
)

if ($Help) {
    Write-Host @"
easyreset-gcp.ps1 - docker-compose.gcp.yml 用：Supabase DB 重置並重新初始化

用法:
  .\scripts\easyreset-gcp.ps1
  .\scripts\easyreset-gcp.ps1 -ResetStorage
  .\scripts\easyreset-gcp.ps1 -ComposeFile docker-compose.gcp.yml -ProjectName aituber-kit

參數:
  -ComposeFile     指定 compose 檔（預設 docker-compose.gcp.yml）
  -ProjectName     指定 compose project name（預設：COMPOSE_PROJECT_NAME 或專案資料夾名）
  -ResetStorage    同時刪除 storage volume（會清空所有上傳檔案）
  -Help            顯示此說明

注意:
  - 此腳本會刪除 Supabase DB volume，資料庫資料會被完全清空並重新初始化（會重新跑 ./supabase/init.sql）
  - 預設只洗 DB；加上 -ResetStorage 才會連 Storage 一起清空
"@
    exit 0
}

# 顏色定義
$colors = @{
    Info    = "Cyan"
    Success = "Green"
    Warning = "Yellow"
    Error   = "Red"
}

function Write-ColorText {
    param(
        [string]$Text,
        [ValidateSet("Info", "Success", "Warning", "Error")]
        [string]$Color = "Info"
    )
    Write-Host $Text -ForegroundColor $colors[$Color]
}

function Show-Progress {
    param(
        [string]$Message,
        [ValidateSet("Info", "Success", "Warning", "Error")]
        [string]$Status = "Info"
    )
    Write-ColorText "[$(Get-Date -Format 'HH:mm:ss')] $Message" $Status
}

# 以 scripts/ 為基準切回專案根目錄，避免使用者在其他目錄執行造成找不到 compose 檔
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $repoRoot

if (-not (Test-Path $ComposeFile)) {
    Show-Progress "找不到 compose 檔：$ComposeFile（請在專案根目錄，或用 -ComposeFile 指定路徑）" "Error"
    exit 1
}

if (-not $ProjectName -or $ProjectName.Trim().Length -eq 0) {
    if ($env:COMPOSE_PROJECT_NAME -and $env:COMPOSE_PROJECT_NAME.Trim().Length -gt 0) {
        $ProjectName = $env:COMPOSE_PROJECT_NAME.Trim()
    } else {
        # 自動偵測：從已存在的 supabase DB volume 反推 project name
        # 例：aitubertw_supabase_db_data -> aitubertw
        $detectedNames = @()
        try {
            $detectedNames = @(docker volume ls --format '{{.Name}}' 2>$null | Where-Object { $_ -match '_supabase_db_data$' })
        } catch {}

        if ($detectedNames.Count -eq 1) {
            $ProjectName = ($detectedNames[0] -replace '_supabase_db_data$', '')
        } elseif ($detectedNames.Count -gt 1) {
            # 多個候選時，優先挑你 VM 常見的 aitubertw；否則回退到資料夾名
            if ($detectedNames -contains 'aitubertw_supabase_db_data') {
                $ProjectName = 'aitubertw'
            } else {
                $ProjectName = Split-Path -Leaf $repoRoot
                Show-Progress "偵測到多個 supabase DB volumes：$($detectedNames -join ', ')；將使用資料夾名當 ProjectName：$ProjectName（如需指定可用 -ProjectName）" "Warning"
            }
        } else {
            $ProjectName = Split-Path -Leaf $repoRoot
        }
    }
}

# Compose 命令偵測（優先 docker compose，其次 docker-compose）
$composeExe = $null
$composeBaseArgs = @()
try {
    & docker compose version *> $null
    if ($LASTEXITCODE -eq 0) {
        $composeExe = "docker"
        $composeBaseArgs = @("compose", "-f", $ComposeFile, "-p", $ProjectName)
    }
} catch {}

if (-not $composeExe) {
    try {
        & docker-compose version *> $null
        if ($LASTEXITCODE -eq 0) {
            $composeExe = "docker-compose"
            $composeBaseArgs = @("-f", $ComposeFile, "-p", $ProjectName)
        }
    } catch {}
}

if (-not $composeExe) {
    Show-Progress "找不到可用的 Docker Compose（請確認已安裝 docker compose 或 docker-compose）" "Error"
    exit 1
}

function Invoke-Compose {
    param([Parameter(Mandatory = $true)][string[]]$Args)
    & $composeExe @composeBaseArgs @Args
    return $LASTEXITCODE
}

# 依 docker-compose.gcp.yml 的 volume 宣告名稱組合出實際 docker volume 名稱（帶 project prefix）
$dbVolume = "${ProjectName}_supabase_db_data"
$storageVolume = "${ProjectName}_supabase_storage_data"

Write-ColorText "=== Supabase（GCP compose）DB 重置腳本 ===" "Info"
Write-ColorText "ComposeFile: $ComposeFile" "Info"
Write-ColorText "ProjectName: $ProjectName" "Info"
Write-ColorText "將刪除 DB volume：$dbVolume" "Warning"
if ($ResetStorage) {
    Write-ColorText "同時刪除 Storage volume：$storageVolume" "Warning"
} else {
    Write-ColorText "（未指定 -ResetStorage，Storage volume 不會被刪除）" "Info"
}

try {
    # Step 1: down（移除容器，釋放 volume 掛載；不加 -v，避免把 caddy_data 等其他 volume 一起砍掉）
    Show-Progress "步驟 1: 停止並移除 compose 容器（down，不刪 volumes）..." "Info"
    $code = Invoke-Compose @("down", "--remove-orphans")
    if ($code -ne 0) {
        Show-Progress "compose down 失敗（exit $code），仍將嘗試刪除 volume..." "Warning"
    } else {
        Show-Progress "compose down 完成" "Success"
    }

    # Step 2: 刪除 DB volume（必要）
    Show-Progress "步驟 2: 刪除 DB volume（會清空資料庫）..." "Info"
    docker volume rm -f $dbVolume 2>$null
    if ($LASTEXITCODE -eq 0) {
        Show-Progress "✓ 已刪除：$dbVolume" "Success"
    } else {
        Show-Progress "⚠ 無法刪除：$dbVolume（可能不存在或仍被使用；請確認 ProjectName 是否正確）" "Warning"
    }

    # Optional: 刪除 Storage volume
    if ($ResetStorage) {
        Show-Progress "步驟 2b: 刪除 Storage volume（會清空所有儲存檔案）..." "Info"
        docker volume rm -f $storageVolume 2>$null
        if ($LASTEXITCODE -eq 0) {
            Show-Progress "✓ 已刪除：$storageVolume" "Success"
        } else {
            Show-Progress "⚠ 無法刪除：$storageVolume（可能不存在或仍被使用；請確認 ProjectName 是否正確）" "Warning"
        }
    }

    # Step 3: up（重新啟動；--no-build 避免重建 app）
    Show-Progress "步驟 3: 重新啟動 compose（up -d --no-build）..." "Info"
    $code = Invoke-Compose @("up", "-d", "--no-build", "--remove-orphans")
    if ($code -ne 0) {
        Show-Progress "✗ compose up 失敗（exit $code）" "Error"
        exit 1
    }
    Show-Progress "✓ compose up 成功" "Success"

    # Step 4: 顯示服務狀態（快速檢查）
    Show-Progress "步驟 4: 顯示服務狀態（ps）..." "Info"
    Invoke-Compose @("ps") *> $null
    Invoke-Compose @("ps")

    Show-Progress "=== 完成：Supabase DB 已重置並重新初始化 ===" "Success"
    Show-Progress "提示：若你的 ProjectName 與實際不一致，可用 -ProjectName 指定（會影響 volume 名稱）" "Info"
} catch {
    Show-Progress "發生錯誤: $($_.Exception.Message)" "Error"
    exit 1
}


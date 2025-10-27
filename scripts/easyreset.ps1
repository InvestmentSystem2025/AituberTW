#!/usr/bin/env pwsh
# easyreset.ps1 - Supabase 容器快速重設腳本
# 功能：停止所有 Supabase 相關容器，刪除資料卷，重新啟動容器

param(
    [switch]$Help
)

# 顯示說明
if ($Help) {
    Write-Host @"
easyreset.ps1 - Supabase 容器快速重設腳本

用法:
    .\easyreset.ps1 [選項]

選項:
    -Help     顯示此說明

功能:
    1. 停止所有 Supabase 相關容器
    2. 刪除 Supabase 資料卷 (aituber-kit_supabase_db_data, aituber-kit_supabase_storage_data)
    3. 重新啟動所有 Supabase 相關容器

注意: 此操作會清除所有 Supabase 資料庫資料和儲存檔案！(直接執行，無確認提示)
"@
    exit 0
}

# 定義 Supabase 相關容器名稱
$supabaseContainers = @(
    "supabase-db",
    "supabase-auth", 
    "supabase-rest",
    "supabase-realtime",
    "supabase-storage",
    "supabase-meta",
    "supabase-studio",
    "supabase-kong",
    "supabase-bootstrap"
)

# 定義要刪除的資料卷
$supabaseVolumes = @(
    "aituber-kit_supabase_db_data",
    "aituber-kit_supabase_storage_data"
)

# 顏色定義
$colors = @{
    Info = "Cyan"
    Success = "Green"
    Warning = "Yellow"
    Error = "Red"
}

function Write-ColorText {
    param(
        [string]$Text,
        [string]$Color = "White"
    )
    Write-Host $Text -ForegroundColor $colors[$Color]
}

function Show-Progress {
    param(
        [string]$Message,
        [string]$Status = "Info"
    )
    Write-ColorText "[$(Get-Date -Format 'HH:mm:ss')] $Message" $Status
}

# 直接執行，不詢問確認
Write-ColorText "=== Supabase 容器重設腳本 ===" "Info"
Write-ColorText "直接執行重設操作..." "Info"

Show-Progress "開始 Supabase 容器重設流程..." "Info"

try {
    # 步驟 1: 停止所有 Supabase 相關容器
    Show-Progress "步驟 1: 停止 Supabase 相關容器..." "Info"
    
    foreach ($container in $supabaseContainers) {
        Show-Progress "  停止容器: $container" "Info"
        docker stop $container 2>$null
        if ($LASTEXITCODE -eq 0) {
            Show-Progress "  ✓ $container 已停止" "Success"
        } else {
            Show-Progress "  ⚠ $container 可能已經停止或不存在" "Warning"
        }
    }
    
    # 步驟 2: 強制刪除 Supabase 資料卷
    Show-Progress "步驟 2: 強制刪除 Supabase 資料卷..." "Info"
    
    # 先檢查並強制移除所有相關容器
    Show-Progress "  檢查並移除所有相關容器..." "Info"
    docker container prune -f 2>$null
    
    foreach ($volume in $supabaseVolumes) {
        Show-Progress "  強制刪除資料卷: $volume" "Info"
        # 使用 -f 強制刪除
        docker volume rm -f $volume 2>$null
        if ($LASTEXITCODE -eq 0) {
            Show-Progress "  ✓ $volume 已刪除" "Success"
        } else {
            Show-Progress "  ⚠ $volume 刪除失敗，嘗試手動清理..." "Warning"
            # 如果強制刪除失敗，嘗試停止所有 Supabase 容器後再刪除
            foreach ($container in $supabaseContainers) {
                docker stop $container 2>$null
            }
            docker volume rm $volume 2>$null
            if ($LASTEXITCODE -eq 0) {
                Show-Progress "  ✓ $volume 手動清理成功" "Success"
            } else {
                Show-Progress "  ✗ $volume 無法刪除，請手動處理" "Error"
            }
        }
    }
    
    # 步驟 3: 重新啟動 Supabase 相關容器
    Show-Progress "步驟 3: 重新啟動 Supabase 相關容器..." "Info"
    
    # 使用 docker-compose 啟動所有 Supabase 服務
    Show-Progress "  啟動 Supabase 服務..." "Info"
    docker-compose up -d supabase-db supabase-auth supabase-rest supabase-realtime supabase-storage supabase-meta supabase-studio supabase-kong supabase-bootstrap
    
    if ($LASTEXITCODE -eq 0) {
        Show-Progress "✓ Supabase 服務啟動成功" "Success"
    } else {
        Show-Progress "✗ Supabase 服務啟動失敗" "Error"
        exit 1
    }
    
    # 等待服務就緒
    Show-Progress "等待服務就緒..." "Info"
    Start-Sleep -Seconds 10
    
    # 檢查容器狀態
    Show-Progress "檢查容器狀態..." "Info"
    foreach ($container in $supabaseContainers) {
        $status = docker inspect --format='{{.State.Status}}' $container 2>$null
        if ($status -eq "running") {
            Show-Progress "  ✓ $container 正在運行" "Success"
        } else {
            Show-Progress "  ✗ $container 狀態: $status" "Error"
        }
    }
    
    Show-Progress "=== Supabase 容器重設完成 ===" "Success"
    Show-Progress "所有 Supabase 服務已重新啟動，資料庫和儲存已重置。" "Success"
    
} catch {
    Show-Progress "發生錯誤: $($_.Exception.Message)" "Error"
    exit 1
}


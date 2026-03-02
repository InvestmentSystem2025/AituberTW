#!/usr/bin/env bash
# easyreset-gcp.sh - docker-compose.gcp.yml 用：Supabase DB 重置並重新初始化（Linux/VM）
# 功能：compose down（不刪其他 volumes）→ 刪除 DB volume → compose up 觸發 init.sql

set -u

help() {
  cat <<'EOF'
easyreset-gcp.sh - docker-compose.gcp.yml 用：Supabase DB 重置並重新初始化（Linux/VM）

用法:
  ./scripts/easyreset-gcp.sh
  ./scripts/easyreset-gcp.sh --reset-storage
  ./scripts/easyreset-gcp.sh -f docker-compose.gcp.yml
  ./scripts/easyreset-gcp.sh --env-file .env

選項:
  -f, --compose-file <path>  指定 compose 檔（預設：docker-compose.gcp.yml）
  -e, --env-file <path>      指定 env 檔（預設：若存在 .env 則用它，否則不指定）
  --reset-storage            同時刪除 storage volume（會清空所有上傳檔案）
  -h, --help                 顯示說明

說明:
  - 會刪除 Supabase DB volume，資料庫資料會被完全清空並重新初始化（會重新跑 ./supabase/init.sql）
  - 預設只洗 DB；加上 --reset-storage 才會連 Storage 一起清空
  - 建議在 VM 上將目標環境的設定檔命名為 .env；本腳本也會預設優先使用 .env，避免 POSTGRES_PASSWORD 等變數空值造成 DB unhealthy
  - Project name 會自動偵測：
      1) 若有環境變數 COMPOSE_PROJECT_NAME 就用它
      2) 否則從 docker volumes 的 *_supabase_db_data 反推（例如 aitubertw_supabase_db_data -> aitubertw）
EOF
}

log() { printf '[%s] %s\n' "$(date +'%H:%M:%S')" "$*"; }
warn() { printf '[%s] WARN: %s\n' "$(date +'%H:%M:%S')" "$*" >&2; }
err() { printf '[%s] ERROR: %s\n' "$(date +'%H:%M:%S')" "$*" >&2; }

compose_file="docker-compose.gcp.yml"
reset_storage="0"
env_file=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help)
      help
      exit 0
      ;;
    -f|--compose-file)
      shift
      compose_file="${1:-}"
      if [[ -z "$compose_file" ]]; then
        err "缺少 -f/--compose-file 的參數"
        exit 1
      fi
      ;;
    -e|--env-file)
      shift
      env_file="${1:-}"
      if [[ -z "$env_file" ]]; then
        err "缺少 -e/--env-file 的參數"
        exit 1
      fi
      ;;
    --reset-storage)
      reset_storage="1"
      ;;
    *)
      err "未知參數：$1（用 -h 查看用法）"
      exit 1
      ;;
  esac
  shift
done

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/.." && pwd)"
cd "$repo_root" || exit 1

if [[ ! -f "$compose_file" ]]; then
  err "找不到 compose 檔：$compose_file（目前目錄：$repo_root）"
  exit 1
fi

# Auto-pick .env when present
if [[ -z "$env_file" && -f ".env" ]]; then
  env_file=".env"
fi
if [[ -n "$env_file" && ! -f "$env_file" ]]; then
  err "找不到 env 檔：$env_file（目前目錄：$repo_root）"
  exit 1
fi

# Detect compose command (prefer docker compose)
compose_cmd=()
if docker compose version >/dev/null 2>&1; then
  compose_cmd=(docker compose)
elif command -v docker-compose >/dev/null 2>&1 && docker-compose version >/dev/null 2>&1; then
  compose_cmd=(docker-compose)
else
  err "找不到可用的 Docker Compose（請確認已安裝 docker compose 或 docker-compose）"
  exit 1
fi

project_name="${COMPOSE_PROJECT_NAME:-}"
if [[ -z "$project_name" ]]; then
  # Auto-detect from existing volumes: *_supabase_db_data
  mapfile -t candidates < <(docker volume ls --format '{{.Name}}' 2>/dev/null | grep -E '_supabase_db_data$' || true)
  if [[ "${#candidates[@]}" -eq 1 ]]; then
    project_name="${candidates[0]%_supabase_db_data}"
  elif [[ "${#candidates[@]}" -gt 1 ]]; then
    # Prefer aitubertw when multiple candidates exist
    if printf '%s\n' "${candidates[@]}" | grep -qx 'aitubertw_supabase_db_data'; then
      project_name="aitubertw"
    else
      project_name="$(basename "$repo_root")"
      warn "偵測到多個 supabase DB volumes：$(printf '%s' "${candidates[*]}")；將使用資料夾名當 project name：$project_name（可透過 COMPOSE_PROJECT_NAME 覆寫）"
    fi
  else
    project_name="$(basename "$repo_root")"
  fi
fi

db_volume="${project_name}_supabase_db_data"
storage_volume="${project_name}_supabase_storage_data"

log "=== Supabase（GCP compose）DB 重置腳本 ==="
log "ComposeFile: $compose_file"
log "ProjectName: $project_name"
if [[ -n "$env_file" ]]; then
  log "EnvFile: $env_file"
else
  warn "未指定 env 檔；請確認你已在 shell export 了必要變數，否則 docker compose 可能會把未設定的變數視為空字串。"
fi
warn "將刪除 DB volume：$db_volume"
if [[ "$reset_storage" == "1" ]]; then
  warn "同時刪除 Storage volume：$storage_volume"
else
  log "（未指定 --reset-storage，Storage volume 不會被刪除）"
fi

base_args=(-f "$compose_file" -p "$project_name")
if [[ -n "$env_file" ]]; then
  base_args+=(--env-file "$env_file")
fi

compose() {
  "${compose_cmd[@]}" "${base_args[@]}" "$@"
}

log "步驟 1: compose down（不刪 volumes）..."
if ! compose down --remove-orphans; then
  warn "compose down 失敗，仍將嘗試刪除 volume"
fi

log "步驟 2: 刪除 DB volume（會清空資料庫）..."
if docker volume rm -f "$db_volume" >/dev/null 2>&1; then
  log "✓ 已刪除：$db_volume"
else
  warn "無法刪除：$db_volume（可能不存在或仍被使用；請確認 project name 是否正確）"
fi

if [[ "$reset_storage" == "1" ]]; then
  log "步驟 2b: 刪除 Storage volume（會清空所有儲存檔案）..."
  if docker volume rm -f "$storage_volume" >/dev/null 2>&1; then
    log "✓ 已刪除：$storage_volume"
  else
    warn "無法刪除：$storage_volume（可能不存在或仍被使用；請確認 project name 是否正確）"
  fi
fi

log "步驟 3: compose up -d --no-build ..."
compose up -d --no-build --remove-orphans

log "步驟 4: compose ps ..."
compose ps

log "=== 完成：Supabase DB 已重置並重新初始化 ==="


#!/usr/bin/env bash
# 在「被測的 VM」（Linux）上執行，於 k6 負荷測試期間採樣 CPU / 記憶體 / load average。
# 用法: ./scripts/vm-stats-during-load.sh [分鐘] [間隔秒]
#   例: ./scripts/vm-stats-during-load.sh 10    → 取樣 10 分鐘，每 10 秒一筆
#       ./scripts/vm-stats-during-load.sh 10 5  → 取樣 10 分鐘，每 5 秒一筆
# 輸出到 stdout，可導向檔案: ... 10 > tmp/vm-stats-soak.log 2>&1

set -e
MINUTES="${1:-10}"
INTERVAL="${2:-10}"
DURATION=$((MINUTES * 60))

# 前一次 /proc/stat 用於算 CPU%
read_cpu_line() { grep '^cpu ' /proc/stat; }
get_idle() {
  local line="$1"
  echo "$line" | awk '{ print $5 + $6 }'  # idle + iowait
}
get_total() {
  local line="$1"
  echo "$line" | awk '{ sum=0; for(i=2;i<=NF;i++) sum+=$i; print sum }'
}

prev=$(read_cpu_line)
prev_idle=$(get_idle "$prev")
prev_total=$(get_total "$prev")

end_ts=$(($(date +%s) + DURATION))
echo "# VM stats: every ${INTERVAL}s for ${DURATION}s (${MINUTES}m) (until $(date -d "@$end_ts" -Iseconds 2>/dev/null || date -r "$end_ts" -Iseconds 2>/dev/null))"
echo "# format: ISO_TIME LOAD1 LOAD5 LOAD15 MEM_MB_USED MEM_MB_TOTAL CPU_PCT"
echo "# ---"

while true; do
  sleep "$INTERVAL"
  now=$(date +%s)
  [ "$now" -ge "$end_ts" ] && break

  # load average
  read -r load1 load5 load15 _ < /proc/loadavg || true

  # memory: MemTotal, MemAvailable → used = total - available
  mem_total=0
  mem_avail=0
  while read -r key val _; do
    case "$key" in
      MemTotal:) mem_total=$val ;;
      MemAvailable:) mem_avail=$val ;;
    esac
  done < /proc/meminfo
  mem_used=$(( (mem_total - mem_avail) / 1024 ))
  mem_total_mb=$(( mem_total / 1024 ))

  # CPU% (since previous sample)
  curr=$(read_cpu_line)
  curr_idle=$(get_idle "$curr")
  curr_total=$(get_total "$curr")
  idle_delta=$(( curr_idle - prev_idle ))
  total_delta=$(( curr_total - prev_total ))
  if [ "$total_delta" -gt 0 ]; then
    cpu_pct=$(awk "BEGIN { printf \"%.1f\", (1 - $idle_delta / $total_delta) * 100 }")
  else
    cpu_pct="0.0"
  fi
  prev_idle=$curr_idle
  prev_total=$curr_total

  iso=$(date -Iseconds 2>/dev/null || date -Iseconds)
  echo "$iso $load1 $load5 $load15 ${mem_used} ${mem_total_mb} ${cpu_pct}"
done

echo "# --- end"

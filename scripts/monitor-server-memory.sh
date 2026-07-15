#!/usr/bin/env bash

set -u

port=17645
interval_seconds=1800
target_pid=""
once=false

usage() {
  cat <<'EOF'
Usage: scripts/monitor-server-memory.sh [options]

Print relay-ai server process memory statistics as CSV every 30 minutes.
By default, the listener PID is rediscovered from TCP port 17645 before each
sample, so monitoring continues across server restarts.

Options:
  --port <number>              Listener port to monitor (default: 17645)
  --pid <number>               Monitor a fixed PID instead of discovering by port
  --interval-minutes <number>  Sampling interval in minutes (default: 30)
  --once                       Print one sample and exit
  -h, --help                   Show this help

Example:
  scripts/monitor-server-memory.sh | tee relay-memory.csv
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --port)
      port="${2:-}"
      shift 2
      ;;
    --pid)
      target_pid="${2:-}"
      shift 2
      ;;
    --interval-minutes)
      minutes="${2:-}"
      if [[ ! "$minutes" =~ ^[0-9]+([.][0-9]+)?$ ]]; then
        echo "Invalid interval: $minutes" >&2
        exit 2
      fi
      interval_seconds="$(awk -v minutes="$minutes" 'BEGIN { printf "%d", minutes * 60 }')"
      shift 2
      ;;
    --once)
      once=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ ! "$port" =~ ^[0-9]+$ ]] || (( port < 1 || port > 65535 )); then
  echo "Invalid port: $port" >&2
  exit 2
fi
if [[ -n "$target_pid" && ! "$target_pid" =~ ^[0-9]+$ ]]; then
  echo "Invalid PID: $target_pid" >&2
  exit 2
fi
if (( interval_seconds < 1 )); then
  echo "Interval must be at least one second" >&2
  exit 2
fi

echo "timestamp_utc,status,pid,elapsed,rss_kib,rss_mib,vsz_kib,cpu_percent,memory_percent,port"

while true; do
  timestamp="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  pid="$target_pid"
  if [[ -z "$pid" ]]; then
    pid="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null | awk 'NR == 1 { print; exit }')"
  fi

  if [[ -z "$pid" ]]; then
    echo "$timestamp,no_listener,,,,,,,,${port}"
  else
    stats="$(ps -p "$pid" -o etime=,rss=,vsz=,%cpu=,%mem= 2>/dev/null || true)"
    if [[ -z "$stats" ]]; then
      echo "$timestamp,process_not_found,$pid,,,,,,,${port}"
    else
      read -r elapsed rss_kib vsz_kib cpu_percent memory_percent <<< "$stats"
      rss_mib="$(awk -v kib="$rss_kib" 'BEGIN { printf "%.1f", kib / 1024 }')"
      echo "$timestamp,ok,$pid,$elapsed,$rss_kib,$rss_mib,$vsz_kib,$cpu_percent,$memory_percent,${port}"
    fi
  fi

  if [[ "$once" == true ]]; then
    break
  fi
  sleep "$interval_seconds"
done

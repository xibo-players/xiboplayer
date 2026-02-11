#!/bin/bash
# Monitor agent progress and update status

while true; do
  clear
  echo "🌙 Overnight Agent Monitor - $(date)"
  echo "========================================"
  echo ""
  echo "System Load: $(uptime | awk -F'load average:' '{print $2}')"
  echo "Memory: $(free -h | awk 'NR==2{printf "%.1f/%.1fGB (%.0f%%)", $3/1024, $2/1024, $3*100/$2}')"
  echo ""
  echo "Active Agents:"
  
  for agent in a93b35c a6ebc16 ad6085e ada86f2 a0de9b2 a00359a a490068; do
    output_file="/tmp/claude-1000/-home-pau-Devel-tecman-tecman-ansible/tasks/${agent}.output"
    if [ -f "$output_file" ]; then
      lines=$(wc -l < "$output_file")
      last_line=$(tail -1 "$output_file" 2>/dev/null | cut -c 1-80)
      echo "  $agent: $lines lines - $last_line"
    else
      echo "  $agent: ⏸️ Not started"
    fi
  done
  
  echo ""
  echo "Press Ctrl+C to stop monitoring"
  sleep 30
done

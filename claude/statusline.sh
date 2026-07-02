#!/bin/sh
input=$(cat)

model=$(echo "$input" | jq -r '.model.display_name // ""')

ctx=$(echo "$input" | jq -r '.context_window.used_percentage // empty')
five_hour=$(echo "$input" | jq -r '.rate_limits.five_hour.used_percentage // empty')
seven_day=$(echo "$input" | jq -r '.rate_limits.seven_day.used_percentage // empty')
five_hour_resets=$(echo "$input" | jq -r '.rate_limits.five_hour.resets_at // empty')
seven_day_resets=$(echo "$input" | jq -r '.rate_limits.seven_day.resets_at // empty')

format_until() {
  target="$1"
  now=$(date +%s)
  secs=$((target - now))
  [ "$secs" -le 0 ] && printf 'now' && return
  days=$((secs / 86400))
  hours=$(((secs % 86400) / 3600))
  mins=$(((secs % 3600) / 60))
  if [ "$days" -gt 0 ]; then
    printf '%dd%dh' "$days" "$hours"
  elif [ "$hours" -gt 0 ]; then
    printf '%dh%dm' "$hours" "$mins"
  else
    printf '%dm' "$mins"
  fi
}

format_bar() {
  pct_int=$(printf '%.0f' "$1")
  red_at="$2"
  yellow_at="$3"
  scary_at="$4"
  wrap_at="$5"
  [ -z "$scary_at" ] && scary_at=101
  [ -z "$wrap_at" ] && wrap_at=101

  width=5
  filled=$((pct_int * width / 100))
  [ "$filled" -gt "$width" ] && filled=$width
  [ "$filled" -lt 0 ] && filled=0
  empty=$((width - filled))

  if [ "$pct_int" -ge "$scary_at" ]; then color='1;5;97;101'
  elif [ "$pct_int" -ge "$wrap_at" ]; then color='1;91'
  elif [ "$pct_int" -ge "$red_at" ]; then color='31'
  elif [ "$pct_int" -ge "$yellow_at" ]; then color='33'
  else color='32'; fi

  printf '\033[%sm' "$color"
  i=0; while [ $i -lt "$filled" ]; do printf '▓'; i=$((i+1)); done
  i=0; while [ $i -lt "$empty" ]; do printf '░'; i=$((i+1)); done
  printf '\033[0m'
}

out=""
[ -n "$model" ] && out="$model"
if [ -n "$five_hour" ]; then
  segment="5h use $(format_bar "$five_hour" 80 50 99 95)"
  [ -n "$five_hour_resets" ] && segment="$segment $(format_until "$five_hour_resets")"
  out="$out  $segment"
fi
if [ -n "$seven_day" ]; then
  segment="7d use $(format_bar "$seven_day" 80 50 99 95)"
  [ -n "$seven_day_resets" ] && segment="$segment $(format_until "$seven_day_resets")"
  out="$out  $segment"
fi
if [ -n "$ctx" ]; then
  out="$out  ctx $(format_bar "$ctx" 90 70)"
fi

printf '%s' "$out"

#!/usr/bin/env bash
# Builds contact.jpg: the mid frame of every clip in clips/, labelled with its id and duration.
set -euo pipefail
cd "$(dirname "$0")"
tmp=$(mktemp -d)
for f in clips/*.mp4; do
  id=$(basename "$f" .mp4)
  d=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$f")
  ffmpeg -y -loglevel error -ss "$(echo "$d / 2" | bc -l)" -i "$f" -frames:v 1 -vf scale=640:360 "$tmp/$id.png"
  printf '%s  %.1fs\n' "$id" "$d" > "$tmp/$id.txt"
done
args=()
for p in "$tmp"/*.png; do id=$(basename "$p" .png); args+=(-label "$(cat "$tmp/$id.txt")" "$p"); done
montage "${args[@]}" -tile 5x -geometry 640x360+8+8 -pointsize 18 -background '#f4f4f4' -quality 88 contact.jpg
rm -rf "$tmp"
echo contact.jpg

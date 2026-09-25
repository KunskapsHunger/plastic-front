#!/usr/bin/env bash
# Tile a contact-sheet render into two review images: promo/out/<name>-sheet-{1,2}.jpg
set -e
cd "$(dirname "$0")/out/$1-sheet"
i=0; for f in f_*.jpg; do cp "$f" "../seq_$(printf %03d $i).jpg"; i=$((i+1)); done
cd ..
ffmpeg -y -loglevel error -i seq_%03d.jpg -vf "scale=${2:-400}:-1,tile=${3:-6x8}:padding=4" -frames:v 1 "$1-sheet-1.jpg"
ffmpeg -y -loglevel error -start_number ${4:-48} -i seq_%03d.jpg -vf "scale=${2:-400}:-1,tile=${3:-6x8}:padding=4" -frames:v 1 "$1-sheet-2.jpg" 2>/dev/null || true
rm -f seq_*.jpg

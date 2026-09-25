#!/usr/bin/env bash
# Mux a rendered promo (promo/out/<name>/video.h264 + audio.webm) into promo/<name>.mp4,
# loudness-normalised to -14 LUFS for YouTube / TikTok / Reels.
set -e
cd "$(dirname "$0")"
name="$1"
ffmpeg -y -loglevel error -framerate 60 -f h264 -i "out/$name/video.h264" -i "out/$name/audio.webm" \
  -map 0:v -map 1:a -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p \
  -af "loudnorm=I=-14:TP=-1.5:LRA=11" -c:a aac -b:a 192k -ar 48000 -movflags +faststart -shortest "$name.mp4"
ffprobe -v error -show_entries format=duration,size -of default=nw=1 "$name.mp4"

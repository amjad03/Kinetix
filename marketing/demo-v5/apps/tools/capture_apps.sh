#!/usr/bin/env bash
# Records the Teacher, Student and Parent app clips (real app UI under flutter_test, demo data) to
# clips/<id>.mp4 + clips/<id>.json.
#   tools/capture_apps.sh                         every clip, one at a time
#   tools/capture_apps.sh teacher_attendance ...  some clips
#   PR=2 tools/capture_apps.sh ...                2x (780x1688) instead of 3x (1170x2532)
# Each run copies capture/zz_rec.dart and capture/<app>_rec_test.dart into apps/<app>/test/ and
# deletes them afterwards (the apps are never changed). Then run tools/contact.py for contact.jpg.
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
APPS="$HERE/../../../apps"
CLIPDIR="$HERE/clips"; mkdir -p "$CLIPDIR" "$HERE/logs"
FLUTTER="${FLUTTER:-/opt/flutter/bin/flutter}"
PR="${PR:-3}"
W=$(python3 -c "print(round(390*$PR))"); H=$(python3 -c "print(round(844*$PR))")

ALL="teacher_signin_home teacher_attendance teacher_homework teacher_marks teacher_plan_syllabus teacher_messages teacher_connect_board teacher_recordings_calendar
student_home student_homework student_marks_attendance student_learn
parent_home parent_attendance parent_fees parent_reports parent_messages"
CLIPS="${*:-$ALL}"

COPIED=()
cleanup() { for f in "${COPIED[@]}"; do rm -f "$f"; done; rm -f "$CLIPDIR"/.frames.fifo; }
trap cleanup EXIT INT TERM

for id in $CLIPS; do
  app="${id%%_*}"
  T="$APPS/$app/test"
  cp "$HERE/capture/zz_rec.dart" "$T/zz_rec.dart"
  cp "$HERE/capture/${app}_rec_test.dart" "$T/zz_${app}_rec_test.dart"
  COPIED+=("$T/zz_rec.dart" "$T/zz_${app}_rec_test.dart")
  FIFO="$CLIPDIR/.frames.fifo"; rm -f "$FIFO"; mkfifo "$FIFO"
  ffmpeg -loglevel error -y -f rawvideo -pix_fmt rgba -s "${W}x${H}" -r 30 -i "$FIFO" \
    -vf "scale=out_color_matrix=bt709:out_range=tv" -c:v libx264 -preset medium -crf 16 -pix_fmt yuv420p \
    -colorspace bt709 -color_primaries bt709 -color_trc bt709 -movflags +faststart "$CLIPDIR/$id.mp4" &
  FF=$!
  echo "== $id ($app, ${W}x${H})"
  start=$(date +%s)
  (cd "$APPS/$app" && CLIP="$id" OUT="$FIFO" META="$CLIPDIR/$id.json" PR="$PR" "$FLUTTER" test --no-pub "test/zz_${app}_rec_test.dart" > "$HERE/logs/$id.log" 2>&1)
  rc=$?
  # Unblock ffmpeg if the test never opened the FIFO.
  timeout 3 sh -c ": > '$FIFO'" 2>/dev/null
  wait $FF
  rm -f "$T/zz_rec.dart" "$T/zz_${app}_rec_test.dart" "$FIFO"
  echo "   test exit $rc, $(( $(date +%s) - start )) s; $(grep -o 'done: .*' "$HERE/logs/$id.log" | tail -1)"
  [ $rc -ne 0 ] && grep -m3 -A6 'EXCEPTION CAUGHT\|Error:' "$HERE/logs/$id.log"
done
exit 0

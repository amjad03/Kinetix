#!/usr/bin/env bash
# Linux port of marketing/board-demo/tools/capture_v3.sh: runs the board-demo director (the real board app under
# flutter_test, driven by a stylus) and records every frame to renders/board/capture.mp4 + capture.jsonl.
#   tools/capture_board.sh            full capture
#   ONLY=c5,c6 tools/capture_board.sh  some chapters
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
BD="$HERE/../board-demo"
BOARD="$HERE/../../apps/board"
OUTDIR="$HERE/renders/board"; mkdir -p "$OUTDIR"
FLUTTER="${FLUTTER:-/opt/flutter/bin/flutter}"
cp "$BD/capture/director.dart" "$BOARD/test/zz_director.dart"
cp "$HERE/capture/board_film_test.dart" "$BOARD/test/zz_board_demo_test.dart"
trap 'rm -f "$BOARD/test/zz_director.dart" "$BOARD/test/zz_board_demo_test.dart" "$OUTDIR/frames.fifo"' EXIT
FIFO="$OUTDIR/frames.fifo"; rm -f "$FIFO"; mkfifo "$FIFO"
python3 "$HERE/tools/record.py" "$FIFO" "$OUTDIR" > "$OUTDIR/record.log" 2>&1 &
RP=$!
export OUT="$FIFO" VO="$BD/data/vo.json" HAND="$BD/data/hand.json" WORDS="$BD/data/words.json" SCRIPT="$BD/data/script.json" LOG="$OUTDIR/director.log"
(cd "$BOARD" && "$FLUTTER" test test/zz_board_demo_test.dart > "$OUTDIR/test.log" 2>&1); echo "flutter test exit $?"
wait $RP; cat "$OUTDIR/record.log"

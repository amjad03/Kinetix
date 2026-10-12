#!/bin/zsh
# v3 capture: flutter test -> FIFO -> record.py -> renders/capture.mp4 + capture.jsonl
set -u
HERE=${0:A:h:h}
FIFO=$HERE/renders/frames.fifo
rm -f $FIFO; mkfifo $FIFO
~/.pyenv/shims/python3 $HERE/tools/record.py $FIFO > $HERE/renders/record.log 2>&1 &
RP=$!
OUT=$FIFO $HERE/tools/capture.sh
wait $RP; cat $HERE/renders/record.log
rm -f $FIFO; rm -rf $HERE/../../apps/board/build

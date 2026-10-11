#!/bin/zsh
# Full render: capture (flutter test) -> FIFO -> compose.py -> renders/video.mp4, then audio.py -> dist/.
set -u
HERE=${0:A:h:h}
FIFO=$HERE/renders/frames.fifo
rm -f $FIFO; mkfifo $FIFO
rm -rf $HERE/renders/stills; mkdir -p $HERE/renders/stills
~/.pyenv/shims/python3 $HERE/tools/compose.py $FIFO --stills $HERE/renders/stills > $HERE/renders/compose.log 2>&1 &
CP=$!
OUT=$FIFO $HERE/tools/capture.sh
wait $CP; cat $HERE/renders/compose.log | tail -3
rm -f $FIFO; rm -rf $HERE/../../apps/board/build

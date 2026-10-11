#!/bin/zsh
# Runs the capture test inside apps/board (temporary copies, removed afterwards).
# usage: tools/capture.sh [preview]   env ONLY=open,c1 to limit chapters; OUT=<fifo> to stream.
set -u
HERE=${0:A:h:h}
BOARD=$HERE/../../apps/board
cp $HERE/capture/director.dart $BOARD/test/zz_director.dart
cp $HERE/capture/board_demo_test.dart $BOARD/test/zz_board_demo_test.dart
trap 'rm -f $BOARD/test/zz_director.dart $BOARD/test/zz_board_demo_test.dart' EXIT
export VO=$HERE/data/vo.json HAND=$HERE/data/hand.json LOG=$HERE/renders/director.log
if [[ ${1:-} == preview ]]; then rm -rf /tmp/kxd/pv; mkdir -p /tmp/kxd/pv; export PREVIEW=/tmp/kxd/pv; fi
cd $BOARD && ~/development/flutter-3.47.6/bin/flutter test test/zz_board_demo_test.dart > $HERE/renders/test.log 2>&1
echo "exit $?"; grep -E "^\S+ \+[0-9]+.*(board demo|Some|All)" $HERE/renders/test.log | tail -2

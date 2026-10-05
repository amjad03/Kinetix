import 'package:kinetix_ink/kinetix_ink.dart';

import '../remote/board_toolkit.dart';
import 'toolkit_controller.dart';

/// The class toolkit and imported slides as the phone remote drives them: the timer and name
/// picker cards, and the pages of an imported PDF or PowerPoint.
class ToolkitRemote implements BoardToolkit {
  ToolkitRemote({required this.kit, required this.wb, this.onChanged}) {
    kit.addListener(_kitChanged);
  }

  final ToolkitController kit;
  final WhiteboardController wb;

  /// Told when the timer starts or stops (the remote sends its state on).
  final void Function()? onChanged;
  bool _wasRunning = false;

  void _kitChanged() {
    if (kit.timerRunning == _wasRunning) return;
    _wasRunning = kit.timerRunning;
    onChanged?.call();
  }

  void dispose() => kit.removeListener(_kitChanged);

  @override
  void startTimer(Duration duration) {
    kit.show(ToolkitItem.timer);
    kit.setTimer(duration);
    kit.startPauseTimer();
  }

  /// Stops the timer and puts it away.
  @override
  void stopTimer() {
    if (kit.timerRunning) kit.startPauseTimer();
    kit.close(ToolkitItem.timer);
  }

  @override
  bool get timerRunning => kit.timerRunning;

  @override
  void pickStudent() {
    kit.show(ToolkitItem.picker);
    kit.pick();
  }

  /// The imported document open now: the run of pages with an imported page under the ink
  /// around the open page, as (first page, count).
  (int, int)? get _deck {
    bool imported(int i) => wb.elementsOf(i).any((e) => e is ImageElement && e.backdrop);
    final i = wb.pageIndex;
    if (!imported(i)) return null;
    var first = i, last = i;
    while (first > 0 && imported(first - 1)) {
      first--;
    }
    while (last < wb.pageCount - 1 && imported(last + 1)) {
      last++;
    }
    return (first, last - first + 1);
  }

  @override
  ({int index, int count})? get slide {
    final d = _deck;
    return d == null ? null : (index: wb.pageIndex - d.$1, count: d.$2);
  }

  @override
  bool nextSlide() {
    final s = slide;
    if (s == null || s.index >= s.count - 1) return false;
    wb.next();
    return true;
  }

  @override
  bool previousSlide() {
    final s = slide;
    if (s == null || s.index == 0) return false;
    wb.previous();
    return true;
  }
}

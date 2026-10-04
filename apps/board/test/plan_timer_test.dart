import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/core/board_controller.dart';
import 'package:kinetix_board/core/outbox_store.dart';
import 'package:kinetix_board/features/plan/plan_timer.dart';

void main() {
  test('carries on for the same period and starts over for another', () {
    final board = BoardController(outboxStore: MemoryOutboxStore());
    final timer = PlanTimer(board);
    addTearDown(() {
      timer.dispose();
      board.dispose();
    });

    timer.show('slot1 2026-10-05', [10, 30]);
    timer.toggle();
    expect(timer.running, isTrue);
    timer.jump(1);

    // The panel reopened (or the plan reloaded) for the same period.
    timer.show('slot1 2026-10-05', [10, 30]);
    expect(timer.step, 1);
    expect(timer.running, isTrue);

    // The next period.
    timer.show('slot2 2026-10-05', [20]);
    expect(timer.step, isNull);
    expect(timer.running, isFalse);
    expect(timer.elapsed, Duration.zero);
  });

  test('a plan edited to fewer steps ends the timer at its end', () {
    final board = BoardController(outboxStore: MemoryOutboxStore());
    final timer = PlanTimer(board);
    addTearDown(() {
      timer.dispose();
      board.dispose();
    });
    timer.show('p', [5, 5, 5]);
    timer.toggle();
    timer.jump(2);
    timer.toggle(); // pause
    timer.show('p', [5]);
    expect(timer.done, isTrue);
  });
}

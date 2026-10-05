import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/core/board_controller.dart';
import 'package:kinetix_board/core/device_store.dart';
import 'package:kinetix_board/core/outbox_store.dart';

/// Storage that cannot be read (for example plugins used before the engine is ready, or a
/// broken key store). The board must still leave its loading screen.
class _BrokenStore extends DeviceStore {
  @override
  Future<({String? server, String? token, String? name})> load() async => throw StateError('storage unavailable');

  @override
  Future<String?> setting(String key) async => throw StateError('storage unavailable');
}

class _BrokenOutbox extends MemoryOutboxStore {
  @override
  Future<List<Map<String, dynamic>>> load() async => throw StateError('outbox unavailable');
}

void main() {
  test('a board whose storage cannot be read asks to be enrolled instead of loading forever', () async {
    final board = BoardController(store: _BrokenStore(), outboxStore: _BrokenOutbox());
    expect(board.stage, BoardStage.loading);
    await board.start();
    expect(board.stage, BoardStage.needsEnrollment);
  });
}

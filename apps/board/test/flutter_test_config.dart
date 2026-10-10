import 'dart:async';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/features/board/context/class_context.dart';
import 'package:kinetix_board/features/help/tour.dart';
import 'package:kinetix_board/features/toolkit/toolkit_sounds.dart';

/// Every test starts with an empty in-memory key store (DeviceStore's default [OsSecretStore]),
/// and without the first-run tour over the board (test/help_test.dart turns it on).
Future<void> testExecutable(FutureOr<void> Function() testMain) async {
  setUp(() {
    FlutterSecureStorage.setMockInitialValues({});
    BoardTour.autoStart = false;
    // The drawer, Insert menu and simulations open showing every tool (test/class_context_test.dart turns narrowing on).
    showAllToolsByDefault = true;
    ToolkitSounds.instance = SilentSounds();
  });
  await testMain();
}

/// No audio plugin in tests: the toolkit's sounds are recorded, not played.
class SilentSounds implements ToolkitSounds {
  final played = <String>[];
  @override
  Future<void> play(String id) async => played.add(id);
}

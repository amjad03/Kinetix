import 'dart:async';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/features/help/tour.dart';

/// Every test starts with an empty in-memory key store (DeviceStore's default [OsSecretStore]),
/// and without the first-run tour over the board (test/help_test.dart turns it on).
Future<void> testExecutable(FutureOr<void> Function() testMain) async {
  setUp(() {
    FlutterSecureStorage.setMockInitialValues({});
    BoardTour.autoStart = false;
  });
  await testMain();
}

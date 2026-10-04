import 'dart:async';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';

/// Every test starts with an empty in-memory key store (AppState's default [DeviceSecureStore]).
Future<void> testExecutable(FutureOr<void> Function() testMain) async {
  setUp(() => FlutterSecureStorage.setMockInitialValues({}));
  await testMain();
}

import 'package:flutter_test/flutter_test.dart';

/// Lets real asynchronous work finish (images decoded, PNGs drawn, PBKDF2 in an isolate, files
/// read) until [done], polling every 25 ms for at most [timeout]. A fixed wait is not enough when
/// the whole suite runs at once and the machine is busy; this waits as long as it takes.
Future<void> waitUntil(WidgetTester tester, bool Function() done, {Duration timeout = const Duration(seconds: 10)}) async {
  final end = DateTime.now().add(timeout);
  // The tap's own frame first, so a "busy" state it starts is on screen when [done] looks.
  await tester.pump();
  while (!done() && DateTime.now().isBefore(end)) {
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 25)));
    await tester.pump();
  }
  await tester.pumpAndSettle();
}

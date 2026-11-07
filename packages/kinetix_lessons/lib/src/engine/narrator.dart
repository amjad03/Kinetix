import 'dart:async';

import 'model.dart';

/// Reads text aloud. Self-Learning waits for [speak] to finish before moving on.
abstract class Narrator {
  Future<void> speak(String text, Lang lang);
  Future<void> stop();
}

/// Silent narrator: takes a reading-time pause instead of speaking (tests, muted boards).
class TimedNarrator implements Narrator {
  TimedNarrator({this.perWord = const Duration(milliseconds: 350)});
  final Duration perWord;
  Completer<void>? _c;
  Timer? _t;
  final spoken = <String>[];

  @override
  Future<void> speak(String text, Lang lang) {
    spoken.add(text);
    _c = Completer<void>();
    _t = Timer(perWord * text.split(' ').length, () => _c?.complete());
    return _c!.future;
  }

  @override
  Future<void> stop() async {
    _t?.cancel();
    if (!(_c?.isCompleted ?? true)) _c!.complete();
  }
}

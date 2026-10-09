import 'package:flutter/material.dart';

import '../board/chrome.dart' show showBoardMessage;
import 'plus_strings.dart';

/// Lesson recording consent and policy (spec §56, §77): the institution can turn recording off
/// for its boards (board config `recordingAllowed: false`), and the first recording of each class
/// tells the teacher what is recorded and who can watch it, so the class can be told.
abstract final class RecordingPolicy {
  /// Whether this board may record lessons.
  static bool allowed = true;

  /// Whether the notice is shown (tests of the recorder itself turn it off).
  static bool notice = true;

  /// Classes whose teacher has seen the notice (by class session id).
  static final _noticed = <String>{};

  /// Reads `recordingAllowed` from the board config (absent = allowed).
  static void applyConfig(Map<String, dynamic> config) => allowed = config['recordingAllowed'] != false;

  /// For tests.
  static void reset() {
    allowed = true;
    notice = true;
    _noticed.clear();
  }

  /// True when recording may start in the class [sessionId]: recording is allowed, and the
  /// teacher has seen the notice for this class (shown now if not).
  static Future<bool> confirm(BuildContext context, String sessionId) async {
    final s = plusStrings(context);
    if (!allowed) {
      showBoardMessage(context, s['recNotAllowed']);
      return false;
    }
    if (!notice || _noticed.contains(sessionId)) return true;
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        key: const Key('rec-notice'),
        icon: const Icon(Icons.fiber_manual_record, color: Color(0xFFD93025)),
        title: Text(s['recNoticeTitle']),
        content: SizedBox(width: 460, child: Text(s['recNoticeBody'])),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: Text(s['cancel'])),
          FilledButton(key: const Key('rec-notice-start'), onPressed: () => Navigator.pop(context, true), child: Text(s['recNoticeStart'])),
        ],
      ),
    );
    if (ok == true) _noticed.add(sessionId);
    return ok == true;
  }
}

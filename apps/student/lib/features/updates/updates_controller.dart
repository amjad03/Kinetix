import 'package:flutter/foundation.dart';

import '../../core/api.dart';
import '../../core/models.dart';

/// The student's notifications ("Updates") and the unread count for the navigation badge.
class UpdatesController extends ChangeNotifier {
  UpdatesController(this.api);

  final StudentApi api;

  List<AppNotification> items = [];
  int unread = 0;
  bool loading = false;
  bool loaded = false;
  String? error;

  Future<void> load() async {
    loading = true;
    error = null;
    notifyListeners();
    try {
      final inbox = await api.notifications();
      items = inbox.items;
      unread = inbox.unread;
      loaded = true;
    } on ApiException catch (e) {
      error = e.message;
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  /// Marks one as read straight away; the server call follows (a failure is retried on the next load).
  Future<void> markRead(AppNotification n) async {
    if (!n.unread) return;
    n.readAt = DateTime.now();
    unread = (unread - 1).clamp(0, 1 << 30);
    notifyListeners();
    try {
      await api.markRead(n.id);
    } on ApiException {
      // Not worth interrupting the student for; the next refresh shows the server's state.
    }
  }

  Future<void> markAllRead() async {
    final now = DateTime.now();
    for (final n in items.where((n) => n.unread)) {
      n.readAt = now;
    }
    unread = 0;
    notifyListeners();
    try {
      await api.markAllRead();
    } on ApiException catch (e) {
      error = e.message;
      notifyListeners();
    }
  }
}

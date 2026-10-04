import 'package:flutter/foundation.dart';

import '../../core/api.dart';
import '../../core/models.dart';

/// The parent's conversations with teachers, the unread total for the tab badge, and who they can
/// write to.
class MessagesController extends ChangeNotifier {
  MessagesController(this.api, {required this.meId});

  final ParentApi api;

  /// The signed-in parent: their messages show on the right.
  final String meId;

  List<Conversation> threads = [];
  bool loading = false;
  bool loaded = false;
  String? error;

  List<ChildContacts>? contacts;
  String? contactsError;

  int get unread => threads.fold(0, (s, t) => s + t.unread);
  Conversation? byId(String id) => threads.where((t) => t.id == id).firstOrNull;

  Future<void> load() async {
    loading = true;
    error = null;
    notifyListeners();
    try {
      threads = await api.conversations();
      loaded = true;
    } on ApiException catch (e) {
      error = e.message;
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  Future<void> loadContacts() async {
    contactsError = null;
    notifyListeners();
    try {
      contacts = await api.contacts();
    } on ApiException catch (e) {
      contactsError = e.message;
    } finally {
      notifyListeners();
    }
  }

  /// A thread was opened (and marked read on the server): clear its badge here straight away.
  void seen(String conversationId) {
    final t = byId(conversationId);
    if (t == null || t.unread == 0) return;
    t.unread = 0;
    notifyListeners();
  }
}

import 'package:flutter/foundation.dart';

import '../../core/api.dart';
import '../../core/models.dart';

/// The student's conversations with teachers, the unread total, and who they can write to. Only
/// colleges let students write for themselves: at schools [contacts] is empty and Messages stays
/// hidden.
class MessagesController extends ChangeNotifier {
  MessagesController(this.api, {required this.meId});

  final StudentApi api;

  /// The signed-in student: their messages show on the right.
  final String meId;

  List<Conversation> threads = [];
  bool loading = false;
  bool loaded = false;
  String? error;

  List<ContactGroup>? contacts;
  String? contactsError;

  int get unread => threads.fold(0, (s, t) => s + t.unread);

  /// Whether the student may write to teachers (the API answers with no contacts otherwise).
  bool get available => contacts?.isNotEmpty ?? false;

  /// Who to write to, then the threads, when this college lets students write.
  Future<void> start() async {
    await loadContacts();
    if (available) await load();
  }

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

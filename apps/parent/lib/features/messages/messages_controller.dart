import 'dart:async';

import 'package:flutter/foundation.dart';

import '../../core/api.dart';
import '../../core/realtime.dart' show RealtimeMessageNew;
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
  ApiException? error;

  List<ChildContacts>? contacts;
  ApiException? contactsError;

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
      error = e;
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
      contactsError = e;
    } finally {
      notifyListeners();
    }
  }

  final _incoming = StreamController<RealtimeMessageNew>.broadcast();

  /// New messages pushed over the realtime connection (an open thread refreshes on them).
  Stream<RealtimeMessageNew> get incoming => _incoming.stream;

  /// Whether new messages arrive by themselves (the realtime connection is up), so open threads
  /// need not check as often.
  bool Function() realtime = () => false;

  /// A message arrived (`message.new`): refresh the list and tell any open thread.
  void received(RealtimeMessageNew m) {
    if (!_incoming.isClosed) _incoming.add(m);
    if (!loading) load();
  }

  @override
  void dispose() {
    _incoming.close();
    super.dispose();
  }

  /// A thread was opened (and marked read on the server): clear its badge here straight away.
  void seen(String conversationId) {
    final t = byId(conversationId);
    if (t == null || t.unread == 0) return;
    t.unread = 0;
    notifyListeners();
  }
}

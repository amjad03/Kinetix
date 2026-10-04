import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/app_state.dart';
import '../../core/family.dart';
import '../../core/realtime.dart';
import '../../l10n/l10n.dart';
import '../home/home_tab.dart';
import '../messages/messages_controller.dart';
import '../messages/messages_tab.dart';
import '../privacy/privacy.dart';
import '../profile/profile_tab.dart';
import '../updates/notifications_prompt.dart';
import '../updates/updates_controller.dart';
import '../updates/updates_tab.dart';

/// The signed-in shell: Home, Messages, Updates and Profile behind a bottom NavigationBar.
class ParentShell extends StatefulWidget {
  const ParentShell({super.key, required this.state});

  final AppState state;

  @override
  State<ParentShell> createState() => _ParentShellState();
}

class _ParentShellState extends State<ParentShell> with WidgetsBindingObserver {
  late final family = FamilyController(widget.state.api, widget.state.prefs);
  late final updates = UpdatesController(widget.state.api)..load();
  late final messages = MessagesController(widget.state.api, meId: widget.state.me!.id)..load();
  int _tab = 0;

  /// New messages over the realtime connection.
  MessageFeed? _feed;

  /// Pushes arriving while the app is open.
  StreamSubscription<void>? _pushes;

  static const _messagesTab = 1, _updatesTab = 2;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    messages.realtime = () => _feed?.connected ?? false;
    final token = widget.state.api.token;
    if (token != null) {
      _feed = MessageFeed(
        connector: widget.state.realtime,
        baseUrl: widget.state.api.baseUrl,
        token: token,
        onMessage: messages.received,
        onReconnected: messages.load,
      )..start();
    }
    widget.state.pendingPushTap.addListener(_openPushTap);
    _pushes = widget.state.messaging.onForegroundMessage.listen((_) {
      if (!updates.loading) updates.load();
      if (!messages.loading) messages.load();
    });
    // A tapped notification that opened the app (or arrived before sign-in) first.
    WidgetsBinding.instance.addPostFrameCallback((_) => _openPushTap());
    family.load().then((_) => _askConsent()).then((_) {
      if (mounted) NotificationsPrompt.askIfNeeded(context, widget.state);
    });
  }

  /// Opens a tapped push notification's update, as tapping it in Updates would; the Updates tab
  /// when it is not in the inbox (any more).
  Future<void> _openPushTap() async {
    final tap = widget.state.pendingPushTap.value;
    if (tap == null || !mounted) return;
    widget.state.pendingPushTap.value = null;
    await updates.load();
    if (!mounted) return;
    final n = updates.items.where((n) => n.id == tap.notificationId).firstOrNull;
    // Not in the inbox (any more): the tab for its kind.
    if (n == null) return _go(tap.kind == 'message' ? _messagesTab : _updatesTab);
    await UpdatesTab.openNotification(context, n, controller: updates, family: family, messages: messages);
  }

  /// Privacy choices still to make for any child (first sign-in after the notice, or a new
  /// notice version): one child at a time. Only for children the parent decides for.
  Future<void> _askConsent() async {
    for (final child in List.of(family.children)) {
      if (!mounted) return;
      final c = ConsentController(widget.state.api, child);
      await ConsentScreen.askIfNeeded(context, c);
      c.dispose();
    }
  }

  /// Back in the app: reconnect the realtime connection straight away.
  @override
  void didChangeAppLifecycleState(AppLifecycleState s) {
    if (s == AppLifecycleState.resumed) _feed?.resume();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    widget.state.pendingPushTap.removeListener(_openPushTap);
    _pushes?.cancel();
    _feed?.dispose();
    family.dispose();
    updates.dispose();
    messages.dispose();
    super.dispose();
  }

  void _go(int i) {
    // Fresh on every visit: new notifications and replies arrive while the app is open.
    if (i == _updatesTab && _tab != _updatesTab && !updates.loading) updates.load();
    if (i == _messagesTab && _tab != _messagesTab && !messages.loading) messages.load();
    setState(() => _tab = i);
  }

  Widget _badge(Key? key, int count, IconData icon) => Badge(key: key, isLabelVisible: count > 0, label: Text('$count'), child: Icon(icon));

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return Scaffold(
      body: IndexedStack(
        index: _tab,
        children: [
          HomeTab(family: family, me: widget.state.me!),
          MessagesTab(controller: messages, family: family),
          UpdatesTab(controller: updates, family: family, messages: messages),
          ProfileTab(state: widget.state, family: family),
        ],
      ),
      bottomNavigationBar: ListenableBuilder(
        listenable: Listenable.merge([updates, messages]),
        builder: (context, _) => NavigationBar(
          selectedIndex: _tab,
          onDestinationSelected: _go,
          destinations: [
            NavigationDestination(icon: const Icon(Icons.home_outlined), selectedIcon: const Icon(Icons.home), label: l.navHome),
            NavigationDestination(
              icon: _badge(const Key('messagesBadge'), messages.unread, Icons.forum_outlined),
              selectedIcon: _badge(null, messages.unread, Icons.forum),
              label: l.navMessages,
            ),
            NavigationDestination(
              icon: _badge(const Key('updatesBadge'), updates.unread, Icons.notifications_outlined),
              selectedIcon: _badge(null, updates.unread, Icons.notifications),
              label: l.navUpdates,
            ),
            NavigationDestination(icon: const Icon(Icons.person_outline), selectedIcon: const Icon(Icons.person), label: l.navProfile),
          ],
        ),
      ),
    );
  }
}

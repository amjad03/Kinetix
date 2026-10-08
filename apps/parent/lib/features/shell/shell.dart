import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/app_state.dart';
import '../../core/family.dart';
import '../../core/realtime.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../l10n/l10n.dart';
import '../fees/fees_screen.dart';
import '../home/home_tab.dart';
import '../messages/messages_controller.dart';
import '../messages/messages_tab.dart';
import '../privacy/privacy.dart';
import '../profile/profile_tab.dart';
import '../updates/notifications_prompt.dart';
import '../updates/updates_controller.dart';
import '../updates/updates_tab.dart';

/// The signed-in shell: Home, Updates, Fees and More behind a bottom NavigationBar. Messages open from More.
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

  static const _updatesTab = 1, _moreTab = 3;

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
        onBusPosition: family.busMoved,
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
    if (n == null) {
      if (tap.kind != 'message') return _go(_updatesTab);
      _go(_moreTab);
      return MessagesTab.open(context, messages, family);
    }
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
    if (i == _moreTab && _tab != _moreTab && !messages.loading) messages.load();
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
          HomeTab(family: family, me: widget.state.me!, updates: updates, onOpenUpdates: () => _go(_updatesTab)),
          UpdatesTab(controller: updates, family: family, messages: messages),
          _FeesTab(family: family),
          ProfileTab(state: widget.state, family: family, messages: messages),
        ],
      ),
      bottomNavigationBar: ListenableBuilder(
        listenable: Listenable.merge([updates, messages]),
        builder: (context, _) => NavigationBar(
          selectedIndex: _tab,
          onDestinationSelected: _go,
          destinations: [
            NavigationDestination(key: const Key('navHome'), icon: const Icon(Icons.home_outlined), selectedIcon: const Icon(Icons.home), label: l.navHome),
            NavigationDestination(
              key: const Key('navUpdates'),
              icon: _badge(const Key('updatesBadge'), updates.unread, Icons.notifications_outlined),
              selectedIcon: _badge(null, updates.unread, Icons.notifications),
              label: l.navUpdates,
            ),
            NavigationDestination(key: const Key('navFees'), icon: const Icon(Icons.account_balance_wallet_outlined), selectedIcon: const Icon(Icons.account_balance_wallet), label: l.navFees),
            NavigationDestination(
              key: const Key('navMore'),
              icon: _badge(const Key('messagesBadge'), messages.unread, Icons.menu),
              selectedIcon: _badge(null, messages.unread, Icons.menu),
              label: l.navMore,
            ),
          ],
        ),
      ),
    );
  }
}

/// Fees for the selected child, as a tab: what is due, what is paid, and every receipt.
class _FeesTab extends StatelessWidget {
  const _FeesTab({required this.family});

  final FamilyController family;

  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: family,
    builder: (context, _) {
      final child = family.selected;
      if (child == null) {
        return Scaffold(
          appBar: AppBar(title: Text(context.l10n.navFees)),
          body: family.loading ? const Center(child: CircularProgressIndicator()) : KxEmptyState(icon: Icons.family_restroom, message: context.l10n.noChildrenLinked),
        );
      }
      return FeesScreen(key: ValueKey(child.id), family: family, child: child);
    },
  );
}

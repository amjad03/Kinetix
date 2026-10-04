import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/app_state.dart';
import '../../core/message_feed.dart';
import '../../core/models.dart';
import '../../core/study.dart';
import '../../l10n/l10n.dart';
import '../learn/learn_tab.dart';
import '../messages/messages_controller.dart';
import '../messages/messages_screen.dart';
import '../privacy/privacy.dart';
import '../profile/profile_tab.dart';
import '../today/today_tab.dart';
import '../updates/notifications_prompt.dart';
import '../updates/updates_controller.dart';
import '../updates/updates_tab.dart';

/// The signed-in shell: Today, Learn, Updates and Profile behind a bottom NavigationBar on
/// phones and a NavigationRail on tablets.
class StudentShell extends StatefulWidget {
  const StudentShell({super.key, required this.state});

  final AppState state;

  /// From this width the destinations move to a side rail (Material 3 medium window class).
  static const railWidth = 600.0;

  @override
  State<StudentShell> createState() => _StudentShellState();
}

class _StudentShellState extends State<StudentShell> with WidgetsBindingObserver {
  late final study = StudyController(widget.state.api, widget.state.student!, liveConnector: widget.state.liveConnector)..load();
  late final updates = UpdatesController(widget.state.api)..load();
  late final messages = MessagesController(widget.state.api, meId: widget.state.me!.id);
  late final consent = ConsentController(widget.state.api, widget.state.student!.id);

  /// New messages over the realtime connection (colleges, where students write to teachers).
  MessageFeed? _feed;
  final _learn = GlobalKey<LearnTabState>();

  /// Pushes arriving while the app is open.
  StreamSubscription<void>? _pushes;

  /// "Live now" updates already acted on.
  final _seenLive = <String>{};

  // Keeps the tabs' state when the layout switches between bar and rail (rotating a tablet).
  final _bodyKey = GlobalKey();
  int _tab = 0;

  static const _updatesTab = 2;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    updates.addListener(_onUpdates);
    widget.state.pendingPushTap.addListener(_openPushTap);
    _pushes = widget.state.messaging.onForegroundMessage.listen((_) {
      if (!updates.loading) updates.load();
    });
    messages.realtime = () => _feed?.connected ?? false;
    messages.start().then((_) {
      if (mounted && messages.available) _startFeed();
    });
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      // A tapped notification that opened the app (or arrived before sign-in) first.
      await _openPushTap();
      // Privacy choices still to make (first sign-in after the notice, or a new notice version).
      if (mounted) await ConsentScreen.askIfNeeded(context, consent);
      if (mounted) await NotificationsPrompt.askIfNeeded(context, widget.state);
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
    if (n == null) {
      // Not in the inbox (any more): the place for its kind.
      if (tap.kind == 'message' && messages.available) return MessagesScreen.open(context, messages);
      return _go(_updatesTab);
    }
    await UpdatesTab.openNotification(context, n, controller: updates, study: study, messages: messages);
  }

  void _startFeed() {
    final token = widget.state.api.token;
    if (token == null || _feed != null) return;
    _feed = MessageFeed(
      connector: widget.state.liveConnector,
      baseUrl: widget.state.api.baseUrl,
      token: token,
      onMessage: messages.received,
      onReconnected: messages.load,
    )..start();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    updates.removeListener(_onUpdates);
    widget.state.pendingPushTap.removeListener(_openPushTap);
    _pushes?.cancel();
    _feed?.dispose();
    study.dispose();
    updates.dispose();
    messages.dispose();
    consent.dispose();
    super.dispose();
  }

  /// Back in the app: a class may have gone live, and replies may have come in.
  @override
  void didChangeAppLifecycleState(AppLifecycleState s) {
    if (s != AppLifecycleState.resumed) return;
    study.loadLive();
    if (!updates.loading) updates.load();
    if (messages.available) messages.load();
    _feed?.resume();
  }

  /// A new "Live now" update brings the banner up on Today straight away.
  void _onUpdates() {
    final fresh = updates.items.where((n) => n.kind == NotificationKind.live && n.unread && _seenLive.add(n.id)).toList();
    if (fresh.isNotEmpty) study.loadLive();
  }

  void _go(int i) {
    // Fresh on every visit: new notifications arrive while the app is open.
    if (i == _updatesTab && _tab != _updatesTab && !updates.loading) updates.load();
    setState(() => _tab = i);
  }

  void _ask() {
    _go(1);
    WidgetsBinding.instance.addPostFrameCallback((_) => _learn.currentState?.showAsk());
  }

  Widget _badge(IconData icon) => Badge(isLabelVisible: updates.unread > 0, label: Text('${updates.unread}'), child: Icon(icon));

  @override
  Widget build(BuildContext context) {
    final body = IndexedStack(
      key: _bodyKey,
      index: _tab,
      children: [
        TodayTab(study: study, me: widget.state.me!, messages: messages, onAsk: _ask, onOpenTopic: (id) => _learn.currentState?.openTopic(id)),
        LearnTab(key: _learn, state: widget.state, study: study),
        UpdatesTab(controller: updates, study: study, messages: messages),
        ProfileTab(state: widget.state, study: study, messages: messages),
      ],
    );
    final wide = MediaQuery.sizeOf(context).width >= StudentShell.railWidth;

    return ListenableBuilder(
      listenable: updates,
      builder: (context, _) {
        final l = context.l10n;
        if (wide) {
          return Scaffold(
            body: Row(
              children: [
                SafeArea(
                  right: false,
                  child: NavigationRail(
                    key: const Key('rail'),
                    selectedIndex: _tab,
                    onDestinationSelected: _go,
                    labelType: NavigationRailLabelType.all,
                    groupAlignment: -0.85,
                    destinations: [
                      NavigationRailDestination(
                        icon: const Icon(Icons.today_outlined),
                        selectedIcon: const Icon(Icons.today),
                        label: Text(l.today),
                      ),
                      NavigationRailDestination(
                        icon: const Icon(Icons.auto_awesome_outlined),
                        selectedIcon: const Icon(Icons.auto_awesome),
                        label: Text(l.navLearn),
                      ),
                      NavigationRailDestination(
                        icon: _badge(Icons.notifications_outlined),
                        selectedIcon: _badge(Icons.notifications),
                        label: Text(l.navUpdates),
                      ),
                      NavigationRailDestination(
                        icon: const Icon(Icons.person_outline),
                        selectedIcon: const Icon(Icons.person),
                        label: Text(l.navProfile),
                      ),
                    ],
                  ),
                ),
                const VerticalDivider(width: 1),
                Expanded(child: body),
              ],
            ),
          );
        }
        return Scaffold(
          body: body,
          bottomNavigationBar: NavigationBar(
            selectedIndex: _tab,
            onDestinationSelected: _go,
            destinations: [
              NavigationDestination(icon: const Icon(Icons.today_outlined), selectedIcon: const Icon(Icons.today), label: l.today),
              NavigationDestination(icon: const Icon(Icons.auto_awesome_outlined), selectedIcon: const Icon(Icons.auto_awesome), label: l.navLearn),
              NavigationDestination(
                key: const Key('updatesDestination'),
                icon: _badge(Icons.notifications_outlined),
                selectedIcon: _badge(Icons.notifications),
                label: l.navUpdates,
              ),
              NavigationDestination(icon: const Icon(Icons.person_outline), selectedIcon: const Icon(Icons.person), label: l.navProfile),
            ],
          ),
        );
      },
    );
  }
}

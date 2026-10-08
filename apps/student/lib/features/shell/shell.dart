import 'dart:async';

import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/app_state.dart';
import '../../core/message_feed.dart';
import '../../core/models.dart';
import '../../core/study.dart';
import '../../l10n/l10n.dart';
import '../exams/exams_tab.dart';
import '../learn/learn_tab.dart';
import '../messages/messages_controller.dart';
import '../messages/messages_screen.dart';
import '../privacy/privacy.dart';
import '../profile/profile_tab.dart';
import '../today/today_tab.dart';
import '../updates/notifications_prompt.dart';
import '../updates/updates_controller.dart';
import '../updates/updates_tab.dart';

/// The signed-in shell: Home, My Learning, Exams and More behind a bottom NavigationBar on
/// phones and a NavigationRail on tablets. Updates open from the bell on Home.
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

  static const _learnTab = 1, _moreTab = 3;

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
      // The socket brings new messages (colleges) and questions asked on the board (everyone).
      if (mounted) _startFeed();
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
      return _openUpdates();
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
      onMessage: (m) {
        if (messages.available) messages.received(m);
      },
      onReconnected: () {
        if (messages.available) messages.load();
        study.loadQuestion();
      },
      onPoll: study.loadQuestion,
      onBadge: (b) {
        study.loadBadges();
        final badge = KxBadge.fromApi(b.badge);
        if (badge != null && mounted) showKxBadgeToast(context, badge, teacher: b.teacher.isEmpty ? null : b.teacher);
      },
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
    study.loadQuestion();
    if (!updates.loading) updates.load();
    if (messages.available) messages.load();
    _feed?.resume();
  }

  /// A new "Live now" update brings the banner up on Today straight away.
  void _onUpdates() {
    final fresh = updates.items.where((n) => n.kind == NotificationKind.live && n.unread && _seenLive.add(n.id)).toList();
    if (fresh.isNotEmpty) study.loadLive();
  }

  void _go(int i) => setState(() => _tab = i);

  /// The notifications, as a page of their own (fresh on every visit: they arrive while the app is open).
  void _openUpdates() {
    if (!updates.loading) updates.load();
    Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => Scaffold(body: UpdatesTab(controller: updates, study: study, messages: messages))));
  }

  void _ask() {
    _go(_learnTab);
    WidgetsBinding.instance.addPostFrameCallback((_) => _learn.currentState?.showAsk());
  }

  @override
  Widget build(BuildContext context) {
    final body = IndexedStack(
      key: _bodyKey,
      index: _tab,
      children: [
        ListenableBuilder(
          listenable: updates,
          builder: (context, _) => TodayTab(
            study: study,
            me: widget.state.me!,
            messages: messages,
            prefs: widget.state.prefs,
            unread: updates.unread,
            onAsk: _ask,
            onOpenTopic: (id) {
              _go(_learnTab);
              WidgetsBinding.instance.addPostFrameCallback((_) => _learn.currentState?.openTopic(id));
            },
            onOpenUpdates: _openUpdates,
            onOpenExams: () => _go(2),
            onOpenMore: () => _go(_moreTab),
          ),
        ),
        LearnTab(key: _learn, state: widget.state, study: study),
        ExamsTab(api: widget.state.api, student: widget.state.student!),
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
                      NavigationRailDestination(icon: const Icon(Icons.home_outlined), selectedIcon: const Icon(Icons.home), label: Text(l.navHome)),
                      NavigationRailDestination(icon: const Icon(Icons.auto_awesome_outlined), selectedIcon: const Icon(Icons.auto_awesome), label: Text(l.navMyLearning)),
                      NavigationRailDestination(icon: const Icon(Icons.event_note_outlined), selectedIcon: const Icon(Icons.event_note), label: Text(l.navExams)),
                      NavigationRailDestination(icon: const Icon(Icons.menu), selectedIcon: const Icon(Icons.menu), label: Text(l.navMore)),
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
              NavigationDestination(key: const Key('navHome'), icon: const Icon(Icons.home_outlined), selectedIcon: const Icon(Icons.home), label: l.navHome),
              NavigationDestination(key: const Key('navLearn'), icon: const Icon(Icons.auto_awesome_outlined), selectedIcon: const Icon(Icons.auto_awesome), label: l.navMyLearning),
              NavigationDestination(key: const Key('navExams'), icon: const Icon(Icons.event_note_outlined), selectedIcon: const Icon(Icons.event_note), label: l.navExams),
              NavigationDestination(key: const Key('navMore'), icon: const Icon(Icons.menu), selectedIcon: const Icon(Icons.menu), label: l.navMore),
            ],
          ),
        );
      },
    );
  }
}

import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/api.dart';
import '../../core/app_state.dart';
import '../../core/l10n.dart';
import '../../core/models.dart';
import '../../core/push.dart';
import '../calendar/calendar_screen.dart';
import '../driver/driver_screen.dart';
import '../homework/homework_tab.dart';
import '../roster/roster_screen.dart';
import 'teacher_home_tab.dart';
import '../marks/marks_tab.dart';
import '../messages/messages_tab.dart';
import '../profile/profile_tab.dart';
import '../recordings/recordings_tab.dart';
import '../today/today_controller.dart';
import '../today/today_tab.dart';

/// The signed-in shell: Today, Homework, Marks, Messages and Recordings behind a bottom
/// NavigationBar. Profile opens from the avatar at the top of every tab, as in Google's apps.
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key, required this.state});

  final AppState state;

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  late final today = TodayController(widget.state.api)..load();
  late final homework = HomeworkController(widget.state.api)..load();
  late final marks = MarksController(widget.state.api);
  // Loaded up front so the Messages badge shows unread threads.
  late final messages = MessagesController(widget.state.api)..load();
  late final recordings = RecordingsController(widget.state.api);
  // Families write any time: new messages arrive over the realtime connection; as a fallback
  // (offline, or events missed while the app was in the background) the list is also refreshed
  // when the app comes back to the front, after a reconnect, and on tab changes.
  late final _lifecycle = AppLifecycleListener(onResume: _refreshMessages);
  final _subscriptions = <StreamSubscription<Object?>>[];
  int _tab = 0;

  static const _moreTab = 3;

  @override
  void initState() {
    super.initState();
    _lifecycle;
    // Loaded up front (these are lazy): homework feeds the quick action as well as its page.
    homework;
    final live = widget.state.realtime;
    _subscriptions
      ..add(live.messages.listen(messages.messageArrived))
      ..add(live.reconnected.listen((_) => _refreshMessages()));
    final token = widget.state.api.token;
    if (token != null) live.connect(baseUrl: widget.state.api.baseUrl, token: token);
    // A push tapped before this screen existed (it launched the app) waits in pushTap.
    widget.state.pushTap.addListener(_onPushTap);
    WidgetsBinding.instance.addPostFrameCallback((_) => _onPushTap());
  }

  void _onPushTap() {
    final tap = widget.state.pushTap.value;
    if (tap == null || !mounted) return;
    widget.state.pushTap.value = null;
    unawaited(_openPush(tap));
  }

  /// Opens what a tapped push is about: a message opens its conversation; homework, marks and
  /// recordings their tab; calendar events the calendar; anything else Today.
  Future<void> _openPush(PushTap tap) async {
    final api = widget.state.api;
    var data = tap.data;
    final id = tap.notificationId;
    if (id != null) {
      unawaited(api.markNotificationRead(id).then((_) {}, onError: (_) {}));
      // Pushes carry only the notification id and kind; the conversation is in the notification.
      if (tap.kind == 'message' && data['conversationId'] == null) {
        try {
          final n = (await api.notifications()).where((n) => n.id == id).firstOrNull;
          if (n != null) data = {...data, ...n.data};
        } on ApiException {
          // Offline: the Messages tab still opens.
        }
      }
    }
    if (!mounted) return;
    Navigator.of(context).popUntil((r) => r.isFirst);
    switch (tap.kind) {
      case 'message':
        final conversationId = data['conversationId'];
        _go(_moreTab);
        _openMessages();
        messages.refresh();
        if (conversationId == null) return;
        Conversation? find() => messages.items?.where((c) => c.id == conversationId).firstOrNull;
        if (find() == null) await messages.load();
        final c = find();
        if (c != null && mounted) await MessagesTab.open(context, messages, c, widget.state.me!.id);
      case 'homework':
        _go(_moreTab);
        _openHomework();
      case 'marks':
        _go(_moreTab);
        _openMarks();
      case 'recording':
        _go(_moreTab);
        _openRecordings();
      case 'calendar':
        await Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => CalendarScreen(api: api)));
      case 'transport':
        // Only drivers get transport pushes in this app; others land on Today.
        if (widget.state.me?.roles.contains('driver') ?? false) {
          await DriverScreen.open(context, api);
        } else {
          _go(0);
        }
      default:
        _go(0);
    }
  }

  void _refreshMessages() => messages.refresh();

  @override
  void dispose() {
    widget.state.pushTap.removeListener(_onPushTap);
    for (final s in _subscriptions) {
      s.cancel();
    }
    widget.state.realtime.disconnect();
    _lifecycle.dispose();
    today.dispose();
    homework.dispose();
    marks.dispose();
    messages.dispose();
    recordings.dispose();
    super.dispose();
  }

  void _go(int i) {
    // Messages refresh on any tab change so the badge stays current.
    if (_tab != i) _refreshMessages();
    setState(() => _tab = i);
  }

  /// Homework, Marks, Messages and Recordings open from More as full pages of their own.
  void _push(Widget page) => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => page));

  void _openHomework() => _push(
    Scaffold(
      body: HomeworkTab(controller: homework),
      floatingActionButton: FloatingActionButton.extended(
        key: const Key('assignHomeworkFab'),
        onPressed: () => HomeworkTab.assign(context, homework),
        icon: const Icon(Icons.add),
        label: Text(context.l10n.assignHomework),
      ),
    ),
  );

  Future<void> _newAssessment() async {
    if (marks.items == null && !marks.loading) await marks.load();
    if (mounted) await MarksTab.create(context, marks);
  }

  void _openMarks() {
    if (marks.items == null && !marks.loading) marks.load();
    _push(
      Scaffold(
        body: MarksTab(controller: marks),
        floatingActionButton: FloatingActionButton.extended(
          key: const Key('newAssessmentFab'),
          onPressed: () => MarksTab.create(context, marks),
          icon: const Icon(Icons.add),
          label: Text(context.l10n.newAssessment),
        ),
      ),
    );
  }

  void _openMessages() {
    _push(
      Scaffold(
        body: MessagesTab(controller: messages, myId: widget.state.me!.id),
        floatingActionButton: FloatingActionButton.extended(
          key: const Key('newMessageFab'),
          onPressed: () => MessagesTab.compose(context, messages, widget.state.me!.id),
          icon: const Icon(Icons.edit_outlined),
          label: Text(context.l10n.newMessage),
        ),
      ),
    );
  }

  void _openRecordings() {
    // Fresh on every visit: the board uploads recordings after class.
    if (!recordings.loading) recordings.load();
    _push(Scaffold(body: RecordingsTab(controller: recordings)));
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final me = widget.state.me!;
    return Scaffold(
      body: IndexedStack(
        index: _tab,
        children: [
          TeacherHomeTab(
            controller: today,
            me: me,
            photo: widget.state.api.photo(me.photoUrl),
            onOpenProfile: () => _go(_moreTab),
            onOpenClasses: () => _go(1),
            onAssign: () => HomeworkTab.assign(context, homework),
            onNewAssessment: _newAssessment,
          ),
          TodayTab(controller: today, me: me, onOpenProfile: () => _go(_moreTab)),
          RosterScreen(api: widget.state.api),
          ListenableBuilder(
            listenable: messages,
            builder: (context, _) => ProfileTab(
              state: widget.state,
              title: l.navMore,
              teachingTiles: [
                _MoreTile(key: const Key('openHomework'), icon: Icons.assignment_outlined, title: l.navHomework, onTap: _openHomework),
                _MoreTile(key: const Key('openMarks'), icon: Icons.grading_outlined, title: l.navMarks, onTap: _openMarks),
                _MoreTile(key: const Key('openMessages'), icon: Icons.forum_outlined, title: l.navMessages, badge: messages.unread, onTap: _openMessages),
                _MoreTile(key: const Key('openRecordings'), icon: Icons.video_library_outlined, title: l.navRecordings, onTap: _openRecordings),
              ],
            ),
          ),
        ],
      ),
      bottomNavigationBar: ListenableBuilder(
        listenable: messages,
        builder: (context, _) {
          final unread = messages.unread;
          return NavigationBar(
            selectedIndex: _tab,
            onDestinationSelected: _go,
            destinations: [
              NavigationDestination(key: const Key('navHome'), icon: const Icon(Icons.home_outlined), selectedIcon: const Icon(Icons.home), label: l.navHome),
              NavigationDestination(key: const Key('navClasses'), icon: const Icon(Icons.class_outlined), selectedIcon: const Icon(Icons.class_), label: l.navClasses),
              NavigationDestination(key: const Key('navStudents'), icon: const Icon(Icons.groups_outlined), selectedIcon: const Icon(Icons.groups), label: l.navStudents),
              NavigationDestination(
                key: const Key('navMore'),
                icon: Badge(key: const Key('messagesBadge'), isLabelVisible: unread > 0, label: Text('$unread'), child: const Icon(Icons.menu)),
                selectedIcon: Badge(isLabelVisible: unread > 0, label: Text('$unread'), child: const Icon(Icons.menu)),
                label: l.navMore,
              ),
            ],
          );
        },
      ),
    );
  }
}

class _MoreTile extends StatelessWidget {
  const _MoreTile({super.key, required this.icon, required this.title, required this.onTap, this.badge = 0});

  final IconData icon;
  final String title;
  final VoidCallback onTap;
  final int badge;

  @override
  Widget build(BuildContext context) => ListTile(
    leading: Icon(icon),
    title: Text(title),
    trailing: badge > 0 ? Badge(label: Text('$badge')) : const Icon(Icons.chevron_right),
    onTap: onTap,
  );
}

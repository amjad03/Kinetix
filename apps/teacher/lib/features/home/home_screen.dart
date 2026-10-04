import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/app_state.dart';
import '../../core/l10n.dart';
import '../../widgets/common.dart';
import '../homework/homework_tab.dart';
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

  static const _homeworkTab = 1, _marksTab = 2, _messagesTab = 3, _recordingsTab = 4;

  @override
  void initState() {
    super.initState();
    _lifecycle;
    final live = widget.state.realtime;
    _subscriptions
      ..add(live.messages.listen(messages.messageArrived))
      ..add(live.reconnected.listen((_) => _refreshMessages()));
    final token = widget.state.api.token;
    if (token != null) live.connect(baseUrl: widget.state.api.baseUrl, token: token);
  }

  void _refreshMessages() => messages.refresh();

  @override
  void dispose() {
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
    if (_tab != i) {
      // Fresh on every visit: the board uploads recordings after class. Messages refresh on any
      // tab change so the badge stays current.
      if (i == _recordingsTab && !recordings.loading) recordings.load();
      _refreshMessages();
      if (i == _marksTab && marks.items == null && !marks.loading) marks.load();
    }
    setState(() => _tab = i);
  }

  void _openProfile() => Navigator.of(context).push(
    MaterialPageRoute<void>(
      builder: (_) => Scaffold(body: ProfileTab(state: widget.state)),
    ),
  );

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final profile = ProfileButton(name: widget.state.me!.fullName, onPressed: _openProfile);
    return Scaffold(
      body: IndexedStack(
        index: _tab,
        children: [
          TodayTab(controller: today, me: widget.state.me!, onOpenProfile: _openProfile),
          HomeworkTab(controller: homework, profileButton: profile),
          MarksTab(controller: marks, profileButton: profile),
          MessagesTab(controller: messages, myId: widget.state.me!.id, profileButton: profile),
          RecordingsTab(controller: recordings, profileButton: profile),
        ],
      ),
      floatingActionButton: switch (_tab) {
        _homeworkTab => FloatingActionButton.extended(
          key: const Key('assignHomeworkFab'),
          onPressed: () => HomeworkTab.assign(context, homework),
          icon: const Icon(Icons.add),
          label: Text(l.assignHomework),
        ),
        _marksTab => FloatingActionButton.extended(
          key: const Key('newAssessmentFab'),
          onPressed: () => MarksTab.create(context, marks),
          icon: const Icon(Icons.add),
          label: Text(l.newAssessment),
        ),
        _messagesTab => FloatingActionButton.extended(
          key: const Key('newMessageFab'),
          onPressed: () => MessagesTab.compose(context, messages, widget.state.me!.id),
          icon: const Icon(Icons.edit_outlined),
          label: Text(l.newMessage),
        ),
        _ => null,
      },
      bottomNavigationBar: ListenableBuilder(
        listenable: messages,
        builder: (context, _) {
          final unread = messages.unread;
          return NavigationBar(
            selectedIndex: _tab,
            onDestinationSelected: _go,
            destinations: [
              NavigationDestination(
                key: const Key('navToday'),
                icon: const Icon(Icons.today_outlined),
                selectedIcon: const Icon(Icons.today),
                label: l.navToday,
              ),
              NavigationDestination(
                key: const Key('navHomework'),
                icon: const Icon(Icons.assignment_outlined),
                selectedIcon: const Icon(Icons.assignment),
                label: l.navHomework,
              ),
              NavigationDestination(
                key: const Key('navMarks'),
                icon: const Icon(Icons.grading_outlined),
                selectedIcon: const Icon(Icons.grading),
                label: l.navMarks,
              ),
              NavigationDestination(
                key: const Key('navMessages'),
                icon: Badge(
                  key: const Key('messagesBadge'),
                  isLabelVisible: unread > 0,
                  label: Text('$unread'),
                  child: const Icon(Icons.forum_outlined),
                ),
                selectedIcon: Badge(isLabelVisible: unread > 0, label: Text('$unread'), child: const Icon(Icons.forum)),
                label: l.navMessages,
              ),
              NavigationDestination(
                key: const Key('navRecordings'),
                icon: const Icon(Icons.video_library_outlined),
                selectedIcon: const Icon(Icons.video_library),
                label: l.navRecordings,
              ),
            ],
          );
        },
      ),
    );
  }
}

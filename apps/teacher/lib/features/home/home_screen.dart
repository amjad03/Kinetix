import 'package:flutter/material.dart';

import '../../core/app_state.dart';
import '../homework/homework_tab.dart';
import '../profile/profile_tab.dart';
import '../recordings/recordings_tab.dart';
import '../today/today_controller.dart';
import '../today/today_tab.dart';

/// The signed-in shell: Today, Homework, Recordings and Profile behind a bottom NavigationBar.
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key, required this.state});

  final AppState state;

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  late final today = TodayController(widget.state.api)..load();
  late final homework = HomeworkController(widget.state.api)..load();
  late final recordings = RecordingsController(widget.state.api);
  int _tab = 0;

  static const _recordingsTab = 2, _profileTab = 3;

  @override
  void dispose() {
    today.dispose();
    homework.dispose();
    recordings.dispose();
    super.dispose();
  }

  void _go(int i) {
    // Fresh on every visit: the board uploads recordings after class.
    if (i == _recordingsTab && _tab != i && !recordings.loading) recordings.load();
    setState(() => _tab = i);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: IndexedStack(
        index: _tab,
        children: [
          TodayTab(controller: today, me: widget.state.me!, onOpenProfile: () => _go(_profileTab)),
          HomeworkTab(controller: homework),
          RecordingsTab(controller: recordings),
          ProfileTab(state: widget.state),
        ],
      ),
      floatingActionButton: _tab == 1
          ? FloatingActionButton.extended(
              key: const Key('assignHomeworkFab'),
              onPressed: () => HomeworkTab.assign(context, homework),
              icon: const Icon(Icons.add),
              label: const Text('Assign homework'),
            )
          : null,
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: _go,
        destinations: const [
          NavigationDestination(icon: Icon(Icons.today_outlined), selectedIcon: Icon(Icons.today), label: 'Today'),
          NavigationDestination(icon: Icon(Icons.assignment_outlined), selectedIcon: Icon(Icons.assignment), label: 'Homework'),
          NavigationDestination(icon: Icon(Icons.video_library_outlined), selectedIcon: Icon(Icons.video_library), label: 'Recordings'),
          NavigationDestination(icon: Icon(Icons.person_outline), selectedIcon: Icon(Icons.person), label: 'Profile'),
        ],
      ),
    );
  }
}

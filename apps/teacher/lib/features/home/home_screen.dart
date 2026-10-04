import 'package:flutter/material.dart';

import '../../core/app_state.dart';
import '../homework/homework_tab.dart';
import '../profile/profile_tab.dart';
import '../today/today_controller.dart';
import '../today/today_tab.dart';

/// The signed-in shell: Today, Homework and Profile behind a bottom NavigationBar.
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key, required this.state});

  final AppState state;

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  late final today = TodayController(widget.state.api)..load();
  late final homework = HomeworkController(widget.state.api)..load();
  int _tab = 0;

  @override
  void dispose() {
    today.dispose();
    homework.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: IndexedStack(
        index: _tab,
        children: [
          TodayTab(controller: today, me: widget.state.me!, onOpenProfile: () => setState(() => _tab = 2)),
          HomeworkTab(controller: homework),
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
        onDestinationSelected: (i) => setState(() => _tab = i),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.today_outlined), selectedIcon: Icon(Icons.today), label: 'Today'),
          NavigationDestination(icon: Icon(Icons.assignment_outlined), selectedIcon: Icon(Icons.assignment), label: 'Homework'),
          NavigationDestination(icon: Icon(Icons.person_outline), selectedIcon: Icon(Icons.person), label: 'Profile'),
        ],
      ),
    );
  }
}

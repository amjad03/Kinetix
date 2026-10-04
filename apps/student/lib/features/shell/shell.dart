import 'package:flutter/material.dart';

import '../../core/app_state.dart';
import '../../core/study.dart';
import '../learn/learn_tab.dart';
import '../profile/profile_tab.dart';
import '../today/today_tab.dart';
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

class _StudentShellState extends State<StudentShell> {
  late final study = StudyController(widget.state.api, widget.state.student!)..load();
  late final updates = UpdatesController(widget.state.api)..load();
  final _learn = GlobalKey<LearnTabState>();

  // Keeps the tabs' state when the layout switches between bar and rail (rotating a tablet).
  final _bodyKey = GlobalKey();
  int _tab = 0;

  static const _updatesTab = 2;

  @override
  void dispose() {
    study.dispose();
    updates.dispose();
    super.dispose();
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
        TodayTab(study: study, me: widget.state.me!, onAsk: _ask),
        LearnTab(key: _learn, state: widget.state, study: study),
        UpdatesTab(controller: updates, study: study),
        ProfileTab(state: widget.state, study: study),
      ],
    );
    final wide = MediaQuery.sizeOf(context).width >= StudentShell.railWidth;

    return ListenableBuilder(
      listenable: updates,
      builder: (context, _) {
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
                      const NavigationRailDestination(
                        icon: Icon(Icons.today_outlined),
                        selectedIcon: Icon(Icons.today),
                        label: Text('Today'),
                      ),
                      const NavigationRailDestination(
                        icon: Icon(Icons.auto_awesome_outlined),
                        selectedIcon: Icon(Icons.auto_awesome),
                        label: Text('Learn'),
                      ),
                      NavigationRailDestination(
                        icon: _badge(Icons.notifications_outlined),
                        selectedIcon: _badge(Icons.notifications),
                        label: const Text('Updates'),
                      ),
                      const NavigationRailDestination(
                        icon: Icon(Icons.person_outline),
                        selectedIcon: Icon(Icons.person),
                        label: Text('Profile'),
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
              const NavigationDestination(icon: Icon(Icons.today_outlined), selectedIcon: Icon(Icons.today), label: 'Today'),
              const NavigationDestination(icon: Icon(Icons.auto_awesome_outlined), selectedIcon: Icon(Icons.auto_awesome), label: 'Learn'),
              NavigationDestination(
                key: const Key('updatesDestination'),
                icon: _badge(Icons.notifications_outlined),
                selectedIcon: _badge(Icons.notifications),
                label: 'Updates',
              ),
              const NavigationDestination(icon: Icon(Icons.person_outline), selectedIcon: Icon(Icons.person), label: 'Profile'),
            ],
          ),
        );
      },
    );
  }
}

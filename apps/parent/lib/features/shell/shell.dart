import 'package:flutter/material.dart';

import '../../core/app_state.dart';
import '../../core/family.dart';
import '../home/home_tab.dart';
import '../profile/profile_tab.dart';
import '../updates/updates_controller.dart';
import '../updates/updates_tab.dart';

/// The signed-in shell: Home, Updates and Profile behind a bottom NavigationBar.
class ParentShell extends StatefulWidget {
  const ParentShell({super.key, required this.state});

  final AppState state;

  @override
  State<ParentShell> createState() => _ParentShellState();
}

class _ParentShellState extends State<ParentShell> {
  late final family = FamilyController(widget.state.api, widget.state.prefs)..load();
  late final updates = UpdatesController(widget.state.api)..load();
  int _tab = 0;

  @override
  void dispose() {
    family.dispose();
    updates.dispose();
    super.dispose();
  }

  void _go(int i) {
    // Fresh on every visit: new notifications arrive while the app is open.
    if (i == 1 && _tab != 1 && !updates.loading) updates.load();
    setState(() => _tab = i);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: IndexedStack(
        index: _tab,
        children: [
          HomeTab(family: family, me: widget.state.me!),
          UpdatesTab(controller: updates, family: family),
          ProfileTab(state: widget.state, family: family),
        ],
      ),
      bottomNavigationBar: ListenableBuilder(
        listenable: updates,
        builder: (context, _) => NavigationBar(
          selectedIndex: _tab,
          onDestinationSelected: _go,
          destinations: [
            const NavigationDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home), label: 'Home'),
            NavigationDestination(
              icon: Badge(
                key: const Key('updatesBadge'),
                isLabelVisible: updates.unread > 0,
                label: Text('${updates.unread}'),
                child: const Icon(Icons.notifications_outlined),
              ),
              selectedIcon: Badge(
                isLabelVisible: updates.unread > 0,
                label: Text('${updates.unread}'),
                child: const Icon(Icons.notifications),
              ),
              label: 'Updates',
            ),
            const NavigationDestination(icon: Icon(Icons.person_outline), selectedIcon: Icon(Icons.person), label: 'Profile'),
          ],
        ),
      ),
    );
  }
}

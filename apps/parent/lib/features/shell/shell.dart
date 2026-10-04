import 'package:flutter/material.dart';

import '../../core/app_state.dart';
import '../../core/family.dart';
import '../../l10n/l10n.dart';
import '../home/home_tab.dart';
import '../messages/messages_controller.dart';
import '../messages/messages_tab.dart';
import '../profile/profile_tab.dart';
import '../updates/updates_controller.dart';
import '../updates/updates_tab.dart';

/// The signed-in shell: Home, Messages, Updates and Profile behind a bottom NavigationBar.
class ParentShell extends StatefulWidget {
  const ParentShell({super.key, required this.state});

  final AppState state;

  @override
  State<ParentShell> createState() => _ParentShellState();
}

class _ParentShellState extends State<ParentShell> {
  late final family = FamilyController(widget.state.api, widget.state.prefs)..load();
  late final updates = UpdatesController(widget.state.api)..load();
  late final messages = MessagesController(widget.state.api, meId: widget.state.me!.id)..load();
  int _tab = 0;

  static const _messagesTab = 1, _updatesTab = 2;

  @override
  void dispose() {
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

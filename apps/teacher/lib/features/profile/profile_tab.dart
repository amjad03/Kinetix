import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/app_state.dart';
import '../../core/models.dart';

class ProfileTab extends StatelessWidget {
  const ProfileTab({super.key, required this.state});

  final AppState state;

  Future<void> _signOut(BuildContext context) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Sign out?'),
        content: const Text('You will need your password to sign in again.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Sign out')),
        ],
      ),
    );
    if (ok == true) await state.signOut();
  }

  @override
  Widget build(BuildContext context) {
    final me = state.me!;
    final c = context.colors;
    void soon(String what) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$what is coming in a later update')));

    return CustomScrollView(
      slivers: [
        const SliverAppBar.large(title: Text('Profile')),
        SliverList.list(
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: Kx.s16),
              child: Row(
                children: [
                  KxAvatar(name: me.fullName, size: 64),
                  const SizedBox(width: Kx.s16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(me.fullName, style: context.text.titleLarge),
                        if (me.email != null || me.phone != null)
                          Text(me.email ?? me.phone!, style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant)),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: Kx.s16),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: Kx.s16),
              child: Wrap(
                spacing: Kx.s8,
                runSpacing: Kx.s8,
                children: [for (final r in me.roles) Chip(label: Text(Me.roleNames[r] ?? r), visualDensity: VisualDensity.compact)],
              ),
            ),
            const KxSectionHeader('Account'),
            ListTile(leading: const Icon(Icons.apartment_outlined), title: const Text('Institution'), subtitle: Text(me.institution)),
            ListTile(
              leading: const Icon(Icons.translate),
              title: const Text('Language'),
              subtitle: Text(me.languageName),
              // TODO: change language here once the app is localised (en / hi / kn).
            ),
            ListTile(leading: const Icon(Icons.dns_outlined), title: const Text('Server'), subtitle: Text(state.serverUrl)),
            const KxSectionHeader('Coming soon'),
            ListTile(
              leading: const Icon(Icons.campaign_outlined),
              title: const Text('Announcements'),
              subtitle: const Text('Send notices to your classes'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => soon('Announcements'),
            ),
            ListTile(
              leading: const Icon(Icons.forum_outlined),
              title: const Text('Student doubts'),
              subtitle: const Text('Answer questions from students'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => soon('Student doubts'),
            ),
            ListTile(
              leading: const Icon(Icons.quiz_outlined),
              title: const Text('MCQ tests'),
              subtitle: const Text('Online tests that sync to board quizzes'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => soon('MCQ tests'),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s24, Kx.s16, Kx.s32),
              child: OutlinedButton.icon(
                key: const Key('signOut'),
                onPressed: () => _signOut(context),
                icon: const Icon(Icons.logout),
                label: const Text('Sign out'),
              ),
            ),
          ],
        ),
      ],
    );
  }
}

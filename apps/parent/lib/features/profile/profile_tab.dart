import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/app_state.dart';
import '../../core/family.dart';
import '../../widgets/common.dart';
import '../fees/fees_screen.dart';

class ProfileTab extends StatelessWidget {
  const ProfileTab({super.key, required this.state, required this.family});

  final AppState state;
  final FamilyController family;

  /// "+919800000001" → "+91 98000 00001"
  static String phone(String p) {
    final m = RegExp(r'^\+91(\d{5})(\d{5})$').firstMatch(p);
    return m == null ? p : '+91 ${m[1]} ${m[2]}';
  }

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
    void soon(String what) {
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text('$what is coming in a later update')));
    }

    Widget soonTile(IconData icon, String title, String subtitle) =>
        ListTile(leading: Icon(icon), title: Text(title), subtitle: Text(subtitle), trailing: const SoonPill(), onTap: () => soon(title));

    return ListenableBuilder(
      listenable: family,
      builder: (context, _) => CustomScrollView(
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
                          if (me.phone != null) Text(phone(me.phone!), style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant)),
                          if (me.email != null) Text(me.email!, style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant)),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              KxSectionHeader(family.children.length == 1 ? 'Your child' : 'Your children'),
              for (final child in family.children)
                ListTile(
                  key: Key('profile-child-${child.id}'),
                  leading: KxAvatar(name: child.fullName),
                  title: Text(child.fullName),
                  subtitle: Text('${child.sectionName} · Roll no. ${child.rollNo}'),
                  trailing: family.children.length > 1 && child.id == family.selected?.id
                      ? Tooltip(
                          message: 'Shown on Home',
                          child: Icon(Icons.check_circle, color: c.primary),
                        )
                      : null,
                  selected: family.children.length > 1 && child.id == family.selected?.id,
                  onTap: family.children.length > 1 ? () => family.select(child.id) : null,
                ),
              if (family.children.isEmpty && !family.loading)
                const ListTile(leading: Icon(Icons.info_outline), title: Text("No children are linked yet. Ask your child's college.")),
              if (family.children.isNotEmpty) const KxSectionHeader('Fees & receipts'),
              for (final child in family.children)
                ListTile(
                  key: Key('profile-fees-${child.id}'),
                  leading: const Icon(Icons.receipt_long_outlined),
                  title: Text(family.children.length == 1 ? 'Fees and receipts' : "${child.firstName}'s fees"),
                  subtitle: const Text('Dues, payments and receipts'),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => FeesScreen.open(context, family, child),
                ),
              const KxSectionHeader('Account'),
              ListTile(leading: const Icon(Icons.apartment_outlined), title: const Text('College'), subtitle: Text(me.institution)),
              ListTile(leading: const Icon(Icons.dns_outlined), title: const Text('Server'), subtitle: Text(state.serverUrl)),
              const KxSectionHeader('Coming soon'),
              soonTile(Icons.forum_outlined, 'Message the teacher', "Ask about your child's progress"),
              soonTile(Icons.local_library_outlined, 'Library books', 'Books borrowed and due dates'),
              soonTile(Icons.translate, 'Language', 'English · हिन्दी · ಕನ್ನಡ'),
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
      ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/app_state.dart';
import '../../core/family.dart';
import '../../l10n/l10n.dart';
import '../../widgets/common.dart';
import '../calendar/calendar_screen.dart';
import '../fees/fees_screen.dart';
import '../library/library.dart';
import '../marks/marks.dart';
import '../privacy/privacy.dart';
import '../syllabus/syllabus_screen.dart';

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
    final l = context.l10n;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(l.signOutQuestion),
        content: Text(l.signOutBody),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(l.cancel)),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: Text(l.signOut)),
        ],
      ),
    );
    if (ok == true) await state.signOut();
  }

  @override
  Widget build(BuildContext context) {
    final me = state.me!;
    final c = context.colors;
    final l = context.l10n;

    return ListenableBuilder(
      listenable: family,
      builder: (context, _) => CustomScrollView(
        slivers: [
          SliverAppBar.large(title: Text(l.profile)),
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
              KxSectionHeader(family.children.length == 1 ? l.yourChild : l.yourChildren),
              for (final child in family.children)
                ListTile(
                  key: Key('profile-child-${child.id}'),
                  leading: KxAvatar(name: child.fullName),
                  title: Text(child.fullName),
                  subtitle: Text('${child.sectionName} · ${l.rollNo(child.rollNo)}'),
                  trailing: family.children.length > 1 && child.id == family.selected?.id
                      ? Tooltip(
                          message: l.shownOnHome,
                          child: Icon(Icons.check_circle, color: c.primary),
                        )
                      : null,
                  selected: family.children.length > 1 && child.id == family.selected?.id,
                  onTap: family.children.length > 1 ? () => family.select(child.id) : null,
                ),
              if (family.children.isEmpty && !family.loading)
                ListTile(leading: const Icon(Icons.info_outline), title: Text(l.noChildrenYet)),
              if (family.children.isNotEmpty) KxSectionHeader(l.feesReceiptsHeader),
              for (final child in family.children)
                ListTile(
                  key: Key('profile-fees-${child.id}'),
                  leading: const Icon(Icons.receipt_long_outlined),
                  title: Text(family.children.length == 1 ? l.feesAndReceipts : l.childFees(child.firstName)),
                  subtitle: Text(l.feesSubtitle),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => FeesScreen.open(context, family, child),
                ),
              if (family.children.isNotEmpty) KxSectionHeader(l.resultsLibraryHeader),
              for (final child in family.children) ...[
                ListTile(
                  key: Key('profile-results-${child.id}'),
                  leading: const Icon(Icons.grading_outlined),
                  title: Text(family.children.length == 1 ? l.results : l.childResults(child.firstName)),
                  subtitle: Text(l.resultsSubtitle),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => ResultsScreen.open(context, family, child),
                ),
                ListTile(
                  key: Key('profile-library-${child.id}'),
                  leading: const Icon(Icons.local_library_outlined),
                  title: Text(family.children.length == 1 ? l.libraryBooks : l.childLibraryBooks(child.firstName)),
                  subtitle: Text(l.librarySubtitle),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => LibraryScreen.open(context, family, child),
                ),
              ],
              if (family.children.isNotEmpty) KxSectionHeader(l.syllabusProgress),
              for (final child in family.children)
                ListTile(
                  key: Key('profile-syllabus-${child.id}'),
                  leading: const Icon(Icons.menu_book_outlined),
                  title: Text(family.children.length == 1 ? l.syllabusProgress : l.childSyllabusProgress(child.firstName)),
                  subtitle: Text(l.syllabusProgressSubtitle),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => SyllabusProgressScreen.open(context, family, child),
                ),
              ListTile(
                key: const Key('profile-calendar'),
                leading: const Icon(Icons.event_outlined),
                title: Text(l.calendar),
                subtitle: Text(l.calendarSubtitle),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => CalendarScreen.open(context, family.api),
              ),
              if (family.children.isNotEmpty) KxSectionHeader(l.privacy),
              for (final child in family.children)
                ListTile(
                  key: Key('profile-privacy-${child.id}'),
                  leading: const Icon(Icons.privacy_tip_outlined),
                  title: Text(family.children.length == 1 ? l.privacy : l.childPrivacy(child.firstName)),
                  subtitle: Text(l.privacySubtitle),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => PrivacyScreen.open(context, family.api, child),
                ),
              KxSectionHeader(l.settings),
              LanguageTile(onChanged: state.setLanguage),
              KxSectionHeader(l.account),
              ListTile(leading: const Icon(Icons.apartment_outlined), title: Text(l.college), subtitle: Text(me.institution)),
              ListTile(leading: const Icon(Icons.dns_outlined), title: Text(l.server), subtitle: Text(state.serverUrl)),
              Padding(
                padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s24, Kx.s16, Kx.s32),
                child: OutlinedButton.icon(
                  key: const Key('signOut'),
                  onPressed: () => _signOut(context),
                  icon: const Icon(Icons.logout),
                  label: Text(l.signOut),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

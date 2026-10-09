import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/profile_photo.dart';
import '../../core/app_state.dart';
import '../../core/family.dart';
import '../../l10n/l10n.dart';
import '../../widgets/common.dart';
import '../calendar/calendar_screen.dart';
import '../courses/courses_screen.dart';
import '../exams/exams_screen.dart';
import '../fees/fees_screen.dart';
import '../library/library.dart';
import '../careers/careers.dart';
import '../grievances/grievances.dart';
import '../marks/marks.dart';
import '../messages/messages_controller.dart';
import '../messages/messages_tab.dart';
import '../exams/report_card_screen.dart';
import '../privacy/dpdp_screen.dart';
import '../privacy/privacy.dart';
import '../school_life/school_life_screen.dart';
import '../syllabus/syllabus_screen.dart';

class ProfileTab extends StatelessWidget {
  const ProfileTab({super.key, required this.state, required this.family, this.messages});

  final AppState state;
  final FamilyController family;

  /// Messages with the teachers open from here (they are not a tab of their own).
  final MessagesController? messages;

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

  /// Photo, name and email (the phone number is the sign-in).
  Future<void> _edit(BuildContext context) async {
    final me = state.me!;
    final api = state.api;
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        fullscreenDialog: true,
        builder: (ctx) => KxProfileEditScreen(
          fullName: me.fullName,
          email: me.email,
          phone: me.phone == null ? null : phone(me.phone!),
          photo: api.photo(me.photoUrl),
          pickImage: pickProfileImage,
          onPhoto: (jpeg) async => state.updateMe(await api.uploadPhoto(jpeg)),
          onRemovePhoto: () async => state.updateMe(await api.removePhoto()),
          onSave: ({required fullName, required email, teachingSubjects}) async =>
              state.updateMe(await api.updateProfile(fullName: fullName, email: email)),
          describeError: ctx.errorText,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) => ListenableBuilder(listenable: state, builder: (context, _) => _build(context));

  Widget _build(BuildContext context) {
    final me = state.me!;
    final c = context.colors;
    final l = context.l10n;

    return ListenableBuilder(
      listenable: family,
      builder: (context, _) => CustomScrollView(
        slivers: [
          SliverAppBar.large(title: Text(l.navMore)),
          SliverList.list(
            children: [
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: Kx.s16),
                child: Row(
                  children: [
                    InkWell(
                      key: const Key('profileAvatar'),
                      customBorder: const CircleBorder(),
                      onTap: () => _edit(context),
                      child: KxAvatar(name: me.fullName, size: 64, image: state.api.photo(me.photoUrl)),
                    ),
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
                    IconButton(
                      key: const Key('editProfile'),
                      tooltip: KxStrings.of(context).editProfile,
                      icon: const Icon(Icons.edit_outlined),
                      onPressed: () => _edit(context),
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
              if (messages != null) ...[
                KxSectionHeader(l.moreFamily),
                ListenableBuilder(
                  listenable: messages!,
                  builder: (context, _) => ListTile(
                    key: const Key('openMessages'),
                    minTileHeight: 64,
                    leading: Badge(isLabelVisible: messages!.unread > 0, label: Text('${messages!.unread}'), child: const Icon(Icons.forum_outlined)),
                    title: Text(l.navMessages),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () {
                      messages!.load();
                      MessagesTab.open(context, messages!, family);
                    },
                  ),
                ),
              ],
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
                  key: Key('profile-exams-${child.id}'),
                  leading: const Icon(Icons.event_note_outlined),
                  title: Text(family.children.length == 1 ? l.examsTitle : l.examsForChild(child.firstName)),
                  subtitle: Text(l.examsSubtitle),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => ExamsScreen.open(context, family.api, child),
                ),
                ListTile(
                  key: Key('profile-grades-${child.id}'),
                  leading: const Icon(Icons.school_outlined),
                  title: Text(family.children.length == 1 ? l.gradesTitle : l.childGrades(child.firstName)),
                  subtitle: Text(l.gradesSubtitle),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => CoursesScreen.open(context, family.api, child),
                ),
                ListTile(
                  key: Key('profile-library-${child.id}'),
                  leading: const Icon(Icons.local_library_outlined),
                  title: Text(family.children.length == 1 ? l.libraryBooks : l.childLibraryBooks(child.firstName)),
                  subtitle: Text(l.librarySubtitle),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => LibraryScreen.open(context, family, child),
                ),
                ListTile(
                  key: Key('profile-schoollife-${child.id}'),
                  leading: const Icon(Icons.menu_book_outlined),
                  title: Text(family.children.length == 1 ? l.schoolLife : l.childSchoolLife(child.firstName)),
                  subtitle: Text(l.schoolLifeSubtitle),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => SchoolLifeScreen.open(context, family.api, child),
                ),
                ListTile(
                  key: Key('profile-careers-${child.id}'),
                  leading: const Icon(Icons.work_outline),
                  title: Text(family.children.length == 1 ? l.careersTitle : l.childCareers(child.firstName)),
                  subtitle: Text(l.careersSubtitle),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => CareersScreen.open(context, load: () => family.api.careerOverview(child.id)),
                ),
                ListTile(
                  key: Key('profile-grievances-${child.id}'),
                  leading: const Icon(Icons.report_problem_outlined),
                  title: Text(family.children.length == 1 ? l.grievancesTitle : l.childGrievances(child.firstName)),
                  subtitle: Text(l.grievancesSubtitle),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => GrievancesScreen.open(
                    context,
                    load: family.api.myGrievances,
                    raise: ({required category, required subject, required description, required anonymous}) =>
                        family.api.raiseGrievance(category: category, subject: subject, description: description, anonymous: anonymous, studentId: child.id),
                    rate: family.api.rateGrievance,
                  ),
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
              for (final child in family.children)
                ListTile(
                  key: Key('profile-reportcards-${child.id}'),
                  leading: const Icon(Icons.workspace_premium_outlined),
                  title: Text(family.children.length == 1 ? l.reportCardsTitle : l.childReportCards(child.firstName)),
                  subtitle: Text(l.reportCardsSubtitle),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => ReportCardsScreen.open(context, family.api, child),
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
              ListTile(
                key: const Key('profile-dpdp'),
                leading: const Icon(Icons.verified_user_outlined),
                title: Text(l.dpdpTitle),
                subtitle: Text(l.dpdpSubtitle),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => DpdpScreen.open(context, family.api, family.children),
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

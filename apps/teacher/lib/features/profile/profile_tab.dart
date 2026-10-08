import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../cards/answer_cards_screen.dart';
import '../../core/api.dart';
import '../../core/app_state.dart';
import '../../core/files.dart';
import '../../core/l10n.dart';
import '../calendar/calendar_screen.dart';
import '../driver/driver_screen.dart';
import '../hr/check_in_screen.dart';
import '../hr/leave_screen.dart';
import '../hr/payslips_screen.dart';
import '../roster/roster_screen.dart';
import '../syllabus/syllabus_screen.dart';
import '../work/duties_screens.dart';
import '../work/evaluation_screens.dart';
import '../work/mentoring_screens.dart';
import '../work/requests_screen.dart';
import '../work/roster_surveys_clubs.dart';
import '../work/tasks_screen.dart';

class ProfileTab extends StatelessWidget {
  const ProfileTab({super.key, required this.state, this.teachingTiles = const [], this.title});

  final AppState state;

  /// Entries shown first under Teaching: the shell puts Homework, Marks, Messages and Recordings here.
  final List<Widget> teachingTiles;

  /// The app bar title; Profile when null.
  final String? title;

  Future<void> _signOut(BuildContext context) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(ctx.l10n.signOutTitle),
        content: Text(ctx.l10n.signOutBody),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(ctx.l10n.cancel)),
          FilledButton(key: const Key('confirmSignOut'), onPressed: () => Navigator.pop(ctx, true), child: Text(ctx.l10n.signOut)),
        ],
      ),
    );
    if (ok == true) await state.signOut();
  }

  /// Photo, name, email and the subjects the teacher teaches.
  Future<void> _edit(BuildContext context) async {
    final me = state.me!;
    final api = state.api;
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        fullscreenDialog: true,
        builder: (ctx) => KxProfileEditScreen(
          fullName: me.fullName,
          email: me.email,
          phone: me.phone,
          photo: api.photo(me.photoUrl),
          teachingSubjects: me.teachingSubjects,
          pickImage: pickProfileImage,
          onPhoto: (jpeg) async => state.updateMe(await api.uploadPhoto(jpeg)),
          onRemovePhoto: () async => state.updateMe(await api.removePhoto()),
          onSave: ({required fullName, required email, teachingSubjects}) async =>
              state.updateMe(await api.updateProfile(fullName: fullName, email: email, teachingSubjects: teachingSubjects)),
          describeError: (e) => e is ApiException ? ctx.l10n.errorText(e) : '$e',
        ),
      ),
    );
  }

  /// English / हिन्दी / ಕನ್ನಡ. The app switches straight away; the account is updated too.
  Future<void> _chooseLanguage(BuildContext context) async {
    final current = state.language ?? Localizations.localeOf(context).languageCode;
    final chosen = await showDialog<String>(
      context: context,
      builder: (ctx) => SimpleDialog(
        title: Text(ctx.l10n.language),
        children: [
          RadioGroup<String>(
            groupValue: current,
            onChanged: (v) => Navigator.pop(ctx, v),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                for (final code in supportedLanguages)
                  RadioListTile<String>(key: Key('language-$code'), value: code, title: Text(languageEndonyms[code]!)),
              ],
            ),
          ),
        ],
      ),
    );
    if (chosen == null || chosen == current || !context.mounted) return;
    final messenger = ScaffoldMessenger.of(context);
    final saved = await state.setLanguage(chosen);
    if (!saved && context.mounted) {
      // Rebuilt in the new language by now.
      messenger.showSnackBar(SnackBar(content: Text(lookupAppLocalizations(Locale(chosen)).languageSaveFailed)));
    }
  }

  @override
  Widget build(BuildContext context) => ListenableBuilder(listenable: state, builder: (context, _) => _build(context));

  Widget _build(BuildContext context) {
    final me = state.me;
    // Signed out from here: the app returns to sign-in on the next frame.
    if (me == null) return const SizedBox.shrink();
    final c = context.colors;
    final l = context.l10n;
    void soon(String what) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(l.comingLater(what))));
    final language = state.language ?? Localizations.localeOf(context).languageCode;

    return CustomScrollView(
      slivers: [
        SliverAppBar.large(title: Text(title ?? l.profile)),
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
                        if (me.email != null || me.phone != null)
                          Text(me.email ?? me.phone!, style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant)),
                        if (me.teachingSubjects.isNotEmpty)
                          Text(me.teachingSubjects.join(' · '), style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant)),
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
            const SizedBox(height: Kx.s16),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: Kx.s16),
              child: Wrap(
                spacing: Kx.s8,
                runSpacing: Kx.s8,
                children: [for (final r in me.roles) Chip(label: Text(l.role(r)), visualDensity: VisualDensity.compact)],
              ),
            ),
            KxSectionHeader(l.account),
            ListTile(leading: const Icon(Icons.apartment_outlined), title: Text(l.institution), subtitle: Text(me.institution)),
            ListTile(
              key: const Key('languageSetting'),
              leading: const Icon(Icons.translate),
              title: Text(l.language),
              subtitle: Text(languageEndonyms[language] ?? language),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => _chooseLanguage(context),
            ),
            ListTile(leading: const Icon(Icons.dns_outlined), title: Text(l.server), subtitle: Text(state.serverUrl)),
            KxSectionHeader(l.teaching),
            ...teachingTiles,
            ListTile(
              key: const Key('openRoster'),
              leading: const Icon(Icons.military_tech_outlined),
              title: Text(l.classRoster),
              subtitle: Text(l.classRosterBody),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => RosterScreen(api: state.api))),
            ),
            ListTile(
              key: const Key('openCalendar'),
              leading: const Icon(Icons.event_outlined),
              title: Text(l.calendar),
              subtitle: Text(l.calendarBody),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => CalendarScreen(api: state.api))),
            ),
            ListTile(
              key: const Key('openAnswerCards'),
              leading: const Icon(Icons.qr_code_2),
              title: Text(l.answerCards),
              subtitle: Text(l.answerCardsMenuBody),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => AnswerCardsScreen(api: state.api))),
            ),
            ListTile(
              key: const Key('openSyllabus'),
              leading: const Icon(Icons.menu_book_outlined),
              title: Text(l.syllabusProgress),
              subtitle: Text(l.syllabusProgressBody),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute<void>(
                  builder: (_) => SyllabusClassesScreen(api: state.api, teacherName: me.fullName),
                ),
              ),
            ),
            if (me.roles.contains('driver'))
              ListTile(
                key: const Key('openDriver'),
                leading: const Icon(Icons.directions_bus_outlined),
                title: Text(l.driverMode),
                subtitle: Text(l.driverModeBody),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => DriverScreen.open(context, state.api),
              ),
            KxSectionHeader(l.workSection),
            ListTile(
              key: const Key('openCheckIn'),
              leading: const Icon(Icons.how_to_reg_outlined),
              title: Text(l.checkInTitle),
              subtitle: Text(l.checkInBody),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => CheckInScreen(api: state.api))),
            ),
            ListTile(
              key: const Key('openLeave'),
              leading: const Icon(Icons.beach_access_outlined),
              title: Text(l.leaveTitle),
              subtitle: Text(l.leaveBody),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute<void>(builder: (_) => LeaveScreen(api: state.api, canApprove: me.roles.any(leaveApproverRoles.contains))),
              ),
            ),
            ListTile(
              key: const Key('openPayslips'),
              leading: const Icon(Icons.receipt_long_outlined),
              title: Text(l.payslipsTitle),
              subtitle: Text(l.payslipsBody),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => PayslipsScreen(api: state.api))),
            ),
            KxSectionHeader(l.workToolsSection),
            for (final (key, icon, title, body, open) in <(String, IconData, String, String, Widget Function())>[
              ('openTasks', Icons.task_alt_outlined, l.tasksTitle, l.tasksBody, () => TasksScreen(api: state.api)),
              ('openRequests', Icons.approval_outlined, l.requestsTitle, l.requestsBody, () => RequestsScreen(api: state.api)),
              ('openSubstitutions', Icons.swap_horiz, l.subsTitle, l.subsBody, () => SubstitutionsScreen(api: state.api)),
              ('openDuties', Icons.fact_check_outlined, l.dutiesTitle, l.dutiesBody, () => DutiesScreen(api: state.api)),
              ('openEvaluation', Icons.rate_review_outlined, l.evalTitle, l.evalBody, () => EvaluationScreen(api: state.api)),
              ('openMentoring', Icons.diversity_3_outlined, l.mentoringTitle, l.mentoringBody, () => MentoringScreen(api: state.api)),
              ('openCourseRoster', Icons.groups_outlined, l.courseRosterTitle, l.courseRosterBody, () => CourseRosterScreen(api: state.api, userId: me.id)),
              ('openSurveys', Icons.poll_outlined, l.surveysTitle, l.surveysBody, () => SurveysScreen(api: state.api)),
              ('openClubs', Icons.groups_2_outlined, l.clubsTitle, l.clubsBody, () => ClubsScreen(api: state.api, userId: me.id)),
            ])
              ListTile(
                key: Key(key),
                leading: Icon(icon),
                title: Text(title),
                subtitle: Text(body),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => open())),
              ),
            KxSectionHeader(l.comingSoon),
            ListTile(
              leading: const Icon(Icons.campaign_outlined),
              title: Text(l.announcements),
              subtitle: Text(l.announcementsBody),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => soon(l.announcements),
            ),
            ListTile(
              leading: const Icon(Icons.forum_outlined),
              title: Text(l.studentDoubts),
              subtitle: Text(l.studentDoubtsBody),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => soon(l.studentDoubts),
            ),
            ListTile(
              leading: const Icon(Icons.quiz_outlined),
              title: Text(l.mcqTests),
              subtitle: Text(l.mcqTestsBody),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => soon(l.mcqTests),
            ),
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
    );
  }
}

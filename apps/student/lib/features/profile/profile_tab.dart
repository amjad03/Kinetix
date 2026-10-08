import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/app_state.dart';
import '../../core/format.dart';
import '../../core/models.dart';
import '../../core/profile_photo.dart';
import '../../core/study.dart';
import '../../l10n/l10n.dart';
import '../../widgets/common.dart';
import '../attendance/attendance_screen.dart';
import '../calendar/calendar_screen.dart';
import '../campus/bus_screen.dart';
import '../campus/certificates_screen.dart';
import '../campus/gate_pass_screen.dart';
import '../campus/leave_screen.dart';
import '../fees/scholarship_screen.dart';
import '../fees/fees_screen.dart';
import '../library/library.dart';
import '../careers/careers.dart';
import '../grievances/grievances.dart';
import '../marks/marks.dart';
import '../messages/messages_controller.dart';
import '../messages/messages_screen.dart';
import '../privacy/privacy.dart';

/// The student's details, attendance history, fees (read-only, with receipts), the language
/// KINETIX AI answers in, and sign out.
class ProfileTab extends StatefulWidget {
  const ProfileTab({super.key, required this.state, required this.study, this.messages});

  final AppState state;
  final StudyController study;

  /// Listed only where students may write to teachers (colleges).
  final MessagesController? messages;

  /// "+919800000001" → "+91 98000 00001"
  static String phone(String p) {
    final m = RegExp(r'^\+91(\d{5})(\d{5})$').firstMatch(p);
    return m == null ? p : '+91 ${m[1]} ${m[2]}';
  }

  @override
  State<ProfileTab> createState() => ProfileTabState();
}

class ProfileTabState extends State<ProfileTab> {
  FeeAccount? _fees;
  ApiException? _feesError;
  bool _feesLoading = false;

  @override
  void initState() {
    super.initState();
    loadFees();
  }

  Future<void> loadFees() async {
    setState(() {
      _feesLoading = true;
      _feesError = null;
    });
    try {
      final f = await widget.study.api.fees(widget.study.student.id);
      if (mounted) setState(() => _fees = f);
    } on ApiException catch (e) {
      if (mounted) setState(() => _feesError = e);
    } finally {
      if (mounted) setState(() => _feesLoading = false);
    }
  }

  Future<void> _signOut() async {
    final l = context.l10n;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(l.signOutQuestion),
        content: Text(l.signOutBody),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(l.cancel)),
          FilledButton(key: const Key('confirmSignOut'), onPressed: () => Navigator.pop(ctx, true), child: Text(l.signOut)),
        ],
      ),
    );
    if (ok == true) await widget.state.signOut();
  }

  Future<void> _chooseLanguage() async {
    final current = widget.state.aiLanguage;
    final picked = await showDialog<AiLanguage>(
      context: context,
      builder: (ctx) => SimpleDialog(
        title: Text(context.l10n.aiAnswersIn),
        children: [
          RadioGroup<AiLanguage>(
            groupValue: current,
            onChanged: (l) => Navigator.pop(ctx, l),
            child: Column(
              children: [
                for (final l in AiLanguage.values)
                  RadioListTile<AiLanguage>(
                    key: Key('pickLang-${l.name}'),
                    value: l,
                    title: Text(l.label),
                    subtitle: l == AiLanguage.en ? null : Text(l.englishName),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
    if (picked != null) await widget.state.setAiLanguage(picked);
  }

  /// Photo, name and email (the phone number is the sign-in).
  Future<void> _edit() async {
    final state = widget.state;
    final me = state.me!;
    final api = state.api;
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        fullscreenDialog: true,
        builder: (ctx) => KxProfileEditScreen(
          fullName: me.fullName,
          email: me.email,
          phone: me.phone == null ? null : ProfileTab.phone(me.phone!),
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

  void _soon(String what) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(context.l10n.comingLater(what))));
  }

  @override
  Widget build(BuildContext context) {
    final state = widget.state;
    final me = state.me!;
    final st = widget.study.student;
    final c = context.colors;
    final l = context.l10n;
    final today = widget.study.today;

    Widget soonTile(IconData icon, String title, String subtitle) =>
        ListTile(leading: Icon(icon), title: Text(title), subtitle: Text(subtitle), trailing: const SoonPill(), onTap: () => _soon(title));

    void openFees() => FeesScreen.open(context, widget.study.api, st.id, today: today);

    return ListenableBuilder(
      listenable: Listenable.merge([state, widget.study, ?widget.messages]),
      builder: (context, _) => CustomScrollView(
        slivers: [
          SliverAppBar.large(title: Text(l.navMore)),
          CenteredSliver(
            flush: true,
            sliver: SliverList.list(
              children: [
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: Kx.s16),
                  child: Row(
                    children: [
                      InkWell(
                        key: const Key('profileAvatar'),
                        customBorder: const CircleBorder(),
                        onTap: _edit,
                        child: KxAvatar(name: me.fullName, size: 64, image: state.api.photo(me.photoUrl)),
                      ),
                      const SizedBox(width: Kx.s16),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(me.fullName, style: context.text.titleLarge),
                            Text(st.sectionName, style: context.text.bodyLarge?.copyWith(color: c.onSurfaceVariant)),
                            if (me.email != null) Text(me.email!, style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant)),
                            if (me.phone != null)
                              Text(ProfileTab.phone(me.phone!), style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant)),
                          ],
                        ),
                      ),
                      IconButton(
                        key: const Key('editProfile'),
                        tooltip: KxStrings.of(context).editProfile,
                        icon: const Icon(Icons.edit_outlined),
                        onPressed: _edit,
                      ),
                    ],
                  ),
                ),
                KxSectionHeader(KxStrings.of(context).badges),
                KxBadgeShelf(
                  key: const Key('badgeShelf'),
                  entries: [
                    for (final b in widget.study.badges ?? const <BadgeAward>[])
                      if (KxBadge.fromApi(b.badge) case final kind?)
                        KxBadgeEntry(badge: kind, teacher: b.teacherName, subject: b.subjectName, awardedAt: b.awardedAt),
                  ],
                  formatDate: context.fmt.shortDay,
                ),
                KxSectionHeader(l.yourClass),
                ListTile(leading: const Icon(Icons.groups_outlined), title: Text(l.classLabel), subtitle: Text(st.sectionName)),
                ListTile(leading: const Icon(Icons.badge_outlined), title: Text(l.rollNoLabel), subtitle: Text(st.rollNo)),
                if (st.programName != null)
                  ListTile(
                    leading: const Icon(Icons.school_outlined),
                    title: Text(l.program),
                    subtitle: Text(
                      [
                        st.programName!,
                        ?switch (st.programLevel) {
                          'ug' => l.undergraduate,
                          'pg' => l.postgraduate,
                          _ => null,
                        },
                      ].join(' · '),
                    ),
                  ),
                ListTile(leading: const Icon(Icons.apartment_outlined), title: Text(l.college), subtitle: Text(me.institution)),
                ListTile(
                  key: const Key('attendanceHistory'),
                  leading: const Icon(Icons.fact_check_outlined),
                  title: Text(l.attendanceHistory),
                  subtitle: Text(_attendanceLine(l, widget.study.summary)),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => AttendanceScreen.open(context, widget.study.api, st),
                ),
                KxSectionHeader(l.resultsLibraryHeader),
                ListTile(
                  key: const Key('openResults'),
                  leading: const Icon(Icons.grading_outlined),
                  title: Text(l.results),
                  subtitle: Text(_resultsLine(l, widget.study.marks)),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => ResultsScreen.open(context, widget.study),
                ),
                ListTile(
                  key: const Key('openLibrary'),
                  leading: const Icon(Icons.local_library_outlined),
                  title: Text(l.libraryBooks),
                  subtitle: Text(_libraryLine(l, widget.study.library)),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => LibraryScreen.open(context, widget.study),
                ),
                ListTile(
                  key: const Key('openCareers'),
                  leading: const Icon(Icons.work_outline),
                  title: Text(l.careersTitle),
                  subtitle: Text(l.careersSubtitle),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () {
                    final api = widget.study.api;
                    CareersScreen.open(
                      context,
                      load: () => api.careerOverview(st.id),
                      onRegister: (drive) => api.registerForDrive(st.id, drive),
                      onWithdraw: (drive) => api.withdrawFromDrive(st.id, drive),
                      onRespond: (offer, accept) => api.respondToOffer(offer, accept: accept),
                    );
                  },
                ),
                ListTile(
                  key: const Key('openGrievances'),
                  leading: const Icon(Icons.report_problem_outlined),
                  title: Text(l.grievancesTitle),
                  subtitle: Text(l.grievancesSubtitle),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () {
                    final api = widget.study.api;
                    GrievancesScreen.open(
                      context,
                      load: api.myGrievances,
                      raise: ({required category, required subject, required description, required anonymous}) =>
                          api.raiseGrievance(category: category, subject: subject, description: description, anonymous: anonymous),
                      rate: api.rateGrievance,
                    );
                  },
                ),
                if (widget.messages?.available ?? false)
                  ListTile(
                    key: const Key('openMessages'),
                    leading: const Icon(Icons.forum_outlined),
                    title: Text(l.navMessages),
                    subtitle: Text(widget.messages!.unread > 0 ? l.nUnread(widget.messages!.unread) : l.writeToYourTeachers),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () => MessagesScreen.open(context, widget.messages!),
                  ),
                KxSectionHeader(l.fees),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: Kx.s12),
                  child: _feesError != null
                      ? Padding(
                          padding: const EdgeInsets.symmetric(horizontal: Kx.s4),
                          child: ErrorBanner(_feesError!, onRetry: loadFees),
                        )
                      : _fees == null
                      ? Padding(
                          padding: const EdgeInsets.all(Kx.s16),
                          child: Center(child: _feesLoading ? const CircularProgressIndicator() : const SizedBox()),
                        )
                      : FeesTotalCard(account: _fees!, today: today, onTap: openFees),
                ),
                ListTile(
                  key: const Key('openFees'),
                  leading: const Icon(Icons.receipt_long_outlined),
                  title: Text(l.feesAndReceipts),
                  subtitle: _fees == null ? null : Text(_feesLine(l, _fees!)),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: openFees,
                ),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: Kx.s16),
                  child: Text(feesNote(l), style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant)),
                ),
                KxSectionHeader(l.moreSchoolLife),
                ListTile(
                  key: const Key('openLeave'),
                  leading: const Icon(Icons.event_busy_outlined),
                  title: Text(l.leaveApplyTitle),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => LeaveScreen.open(context, widget.study.api, st.id),
                ),
                ListTile(
                  key: const Key('openScholarships'),
                  leading: const Icon(Icons.workspace_premium_outlined),
                  title: Text(l.scholarshipTitle),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => ScholarshipScreen.open(context, widget.study.api, st.id),
                ),
                ListTile(
                  key: const Key('openBus'),
                  leading: const Icon(Icons.directions_bus_outlined),
                  title: Text(l.busTitle),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => BusScreen.open(context, widget.study.api, st.id),
                ),
                ListTile(
                  key: const Key('openGatePass'),
                  leading: const Icon(Icons.apartment_outlined),
                  title: Text(l.gatePassTitle),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => GatePassScreen.open(context, widget.study.api, st.id),
                ),
                ListTile(
                  key: const Key('openCertificates'),
                  leading: const Icon(Icons.workspace_premium_outlined),
                  title: Text(l.certificatesTitle),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => CertificatesScreen.open(context, widget.study.api, st.id),
                ),
                KxSectionHeader(l.settings),
                LanguageTile(onChanged: state.setLanguage),
                ListTile(
                  key: const Key('openPrivacy'),
                  leading: const Icon(Icons.privacy_tip_outlined),
                  title: Text(l.privacy),
                  subtitle: Text(l.privacySubtitle),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => PrivacyScreen.open(context, widget.study.api, st.id),
                ),
                ListTile(
                  key: const Key('openCalendar'),
                  leading: const Icon(Icons.event_outlined),
                  title: Text(l.calendar),
                  subtitle: Text(l.calendarSubtitle),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => CalendarScreen.open(context, widget.study.api, program: st.programName),
                ),
                const KxSectionHeader('KINETIX AI'),
                ListTile(
                  key: const Key('aiLanguage'),
                  leading: const Icon(Icons.auto_awesome_outlined),
                  title: Text(l.answersIn),
                  subtitle: Text(state.aiLanguage.label),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: _chooseLanguage,
                ),
                KxSectionHeader(l.comingSoon),
                soonTile(Icons.calendar_view_week_outlined, l.timetable, l.timetableSubtitle),
                KxSectionHeader(l.account),
                ListTile(leading: const Icon(Icons.dns_outlined), title: Text(l.server), subtitle: Text(state.serverUrl)),
                Padding(
                  padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s16, Kx.s16, Kx.s32),
                  child: OutlinedButton.icon(
                    key: const Key('signOut'),
                    onPressed: _signOut,
                    icon: const Icon(Icons.logout),
                    label: Text(l.signOut),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  static String _attendanceLine(AppLocalizations l, StudentSummary? s) {
    final rate = s?.attendance.effectiveRate;
    if (s == null) return l.everyClass30;
    if (rate == null) return l.noAttendanceDays(s.days);
    return l.attendedPercent(Fmt.percent(rate), s.days);
  }

  static String _resultsLine(AppLocalizations l, StudentMarks? m) {
    if (m == null) return l.resultsSubtitle;
    if (m.assessments.isEmpty) return l.noMarksYet;
    return l.assessmentsPublished(m.assessments.length);
  }

  static String _libraryLine(AppLocalizations l, LibraryAccount? lib) {
    if (lib == null) return l.librarySubtitle;
    if (lib.current.isEmpty) return l.noBooksOutShort;
    final overdue = lib.overdue.length;
    return [l.booksOut(lib.current.length), if (overdue > 0) l.nOverdue(overdue)].join(l.listSeparator);
  }

  static String _feesLine(AppLocalizations l, FeeAccount f) =>
      [if (f.invoices.isNotEmpty) l.feesCount(f.invoices.length), l.receiptsCount(f.payments.length)].join(' · ');
}

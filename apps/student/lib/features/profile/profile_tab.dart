import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/app_state.dart';
import '../../core/format.dart';
import '../../core/models.dart';
import '../../core/study.dart';
import '../../widgets/common.dart';
import '../attendance/attendance_screen.dart';
import '../fees/fees_screen.dart';
import '../library/library.dart';
import '../marks/marks.dart';
import '../messages/messages_controller.dart';
import '../messages/messages_screen.dart';

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
  String? _feesError;
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
      if (mounted) setState(() => _feesError = e.message);
    } finally {
      if (mounted) setState(() => _feesLoading = false);
    }
  }

  Future<void> _signOut() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Sign out?'),
        content: const Text('You will need your password to sign in again.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(key: const Key('confirmSignOut'), onPressed: () => Navigator.pop(ctx, true), child: const Text('Sign out')),
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
        title: const Text('KINETIX AI answers in'),
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

  void _soon(String what) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text('$what is coming in a later update')));
  }

  @override
  Widget build(BuildContext context) {
    final state = widget.state;
    final me = state.me!;
    final st = widget.study.student;
    final c = context.colors;
    final today = widget.study.today;

    Widget soonTile(IconData icon, String title, String subtitle) =>
        ListTile(leading: Icon(icon), title: Text(title), subtitle: Text(subtitle), trailing: const SoonPill(), onTap: () => _soon(title));

    void openFees() => FeesScreen.open(context, widget.study.api, st.id, today: today);

    return ListenableBuilder(
      listenable: Listenable.merge([state, widget.study, ?widget.messages]),
      builder: (context, _) => CustomScrollView(
        slivers: [
          const SliverAppBar.large(title: Text('Profile')),
          CenteredSliver(
            flush: true,
            sliver: SliverList.list(
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
                            Text(st.sectionName, style: context.text.bodyLarge?.copyWith(color: c.onSurfaceVariant)),
                            if (me.email != null) Text(me.email!, style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant)),
                            if (me.phone != null)
                              Text(ProfileTab.phone(me.phone!), style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant)),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                const KxSectionHeader('Your class'),
                ListTile(leading: const Icon(Icons.groups_outlined), title: const Text('Class'), subtitle: Text(st.sectionName)),
                ListTile(leading: const Icon(Icons.badge_outlined), title: const Text('Roll no.'), subtitle: Text(st.rollNo)),
                if (st.programLine != null)
                  ListTile(leading: const Icon(Icons.school_outlined), title: const Text('Program'), subtitle: Text(st.programLine!)),
                ListTile(leading: const Icon(Icons.apartment_outlined), title: const Text('College'), subtitle: Text(me.institution)),
                ListTile(
                  key: const Key('attendanceHistory'),
                  leading: const Icon(Icons.fact_check_outlined),
                  title: const Text('Attendance history'),
                  subtitle: Text(_attendanceLine(widget.study.summary)),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => AttendanceScreen.open(context, widget.study.api, st),
                ),
                const KxSectionHeader('Results & library'),
                ListTile(
                  key: const Key('openResults'),
                  leading: const Icon(Icons.grading_outlined),
                  title: const Text('Results'),
                  subtitle: Text(_resultsLine(widget.study.marks)),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => ResultsScreen.open(context, widget.study),
                ),
                ListTile(
                  key: const Key('openLibrary'),
                  leading: const Icon(Icons.local_library_outlined),
                  title: const Text('Library books'),
                  subtitle: Text(_libraryLine(widget.study.library)),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => LibraryScreen.open(context, widget.study),
                ),
                if (widget.messages?.available ?? false)
                  ListTile(
                    key: const Key('openMessages'),
                    leading: const Icon(Icons.forum_outlined),
                    title: const Text('Messages'),
                    subtitle: Text(
                      widget.messages!.unread > 0 ? '${widget.messages!.unread} unread' : 'Write to your teachers',
                    ),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () => MessagesScreen.open(context, widget.messages!),
                  ),
                const KxSectionHeader('Fees'),
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
                  title: const Text('Fees and receipts'),
                  subtitle: _fees == null ? null : Text(_feesLine(_fees!)),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: openFees,
                ),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: Kx.s16),
                  child: Text(feesNote, style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant)),
                ),
                const KxSectionHeader('KINETIX AI'),
                ListTile(
                  key: const Key('aiLanguage'),
                  leading: const Icon(Icons.translate),
                  title: const Text('Answers in'),
                  subtitle: Text(state.aiLanguage.label),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: _chooseLanguage,
                ),
                const KxSectionHeader('Coming soon'),
                soonTile(Icons.calendar_view_week_outlined, 'Timetable', 'Your classes for the week'),
                const KxSectionHeader('Account'),
                ListTile(leading: const Icon(Icons.dns_outlined), title: const Text('Server'), subtitle: Text(state.serverUrl)),
                Padding(
                  padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s16, Kx.s16, Kx.s32),
                  child: OutlinedButton.icon(
                    key: const Key('signOut'),
                    onPressed: _signOut,
                    icon: const Icon(Icons.logout),
                    label: const Text('Sign out'),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  static String _attendanceLine(StudentSummary? s) {
    final rate = s?.attendance.effectiveRate;
    if (s == null) return 'Every class in the last 30 days';
    if (rate == null) return 'No attendance taken in the last ${s.days} days';
    return '${Fmt.percent(rate)} attended in the last ${s.days} days';
  }

  static String _resultsLine(StudentMarks? m) {
    if (m == null) return 'Published marks and class averages';
    if (m.assessments.isEmpty) return 'No marks published yet';
    return '${Fmt.plural(m.assessments.length, 'assessment')} published';
  }

  static String _libraryLine(LibraryAccount? l) {
    if (l == null) return 'Books borrowed, due dates and fines';
    if (l.current.isEmpty) return 'No books out';
    final overdue = l.overdue.length;
    return '${Fmt.plural(l.current.length, 'book')} out${overdue > 0 ? ', $overdue overdue' : ''}';
  }

  static String _feesLine(FeeAccount f) =>
      [if (f.invoices.isNotEmpty) Fmt.plural(f.invoices.length, 'fee'), Fmt.plural(f.payments.length, 'receipt')].join(' · ');
}

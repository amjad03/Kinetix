import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/format.dart';
import '../../core/l10n.dart';
import '../../core/models.dart';
import '../../widgets/common.dart';
import 'attendance_controller.dart';

/// Roster for one period. Tap a student to mark them absent; long-press for late or excused.
/// "10 present · 2 absent · 1 late"
String attendanceSummary(AppLocalizations l, AttendanceController c) =>
    [for (final (s, n) in c.summary) l.attendanceCount(s, n)].join(' · ');

class AttendanceScreen extends StatefulWidget {
  const AttendanceScreen({super.key, required this.api, required this.period, required this.date});

  final TeacherApi api;
  final Period period;
  final String date;

  @override
  State<AttendanceScreen> createState() => _AttendanceScreenState();
}

class _AttendanceScreenState extends State<AttendanceScreen> {
  late final controller = AttendanceController(
    api: widget.api,
    slotId: widget.period.slotId,
    sectionId: widget.period.section.id,
    date: widget.date,
  )..load();

  @override
  void dispose() {
    controller.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final messenger = ScaffoldMessenger.of(context);
    final l = context.l10n;
    final wasTaken = controller.alreadyTaken;
    final error = await controller.submit();
    if (!mounted) return;
    if (error != null) {
      messenger.showSnackBar(SnackBar(content: Text(l.errorText(error))));
      return;
    }
    final summary = attendanceSummary(l, controller);
    messenger.showSnackBar(SnackBar(content: Text(wasTaken ? l.attendanceUpdated(summary) : l.attendanceSaved(summary))));
    Navigator.of(context).pop(true);
  }

  Future<void> _chooseStatus(Student s) async {
    final chosen = await showModalBottomSheet<AttendanceStatus>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => SafeArea(
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(Kx.s24, 0, Kx.s24, Kx.s8),
                child: Text(s.fullName, style: context.text.titleMedium),
              ),
              for (final status in AttendanceStatus.values)
                ListTile(
                  key: Key('status-${status.name}'),
                  contentPadding: const EdgeInsets.symmetric(horizontal: Kx.s24),
                  leading: Icon(_icon(status)),
                  title: Text(ctx.l10n.attendanceStatus(status)),
                  trailing: controller.marks[s.id] == status ? Icon(Icons.check, color: ctx.colors.primary) : null,
                  onTap: () => Navigator.pop(ctx, status),
                ),
              const SizedBox(height: Kx.s8),
            ],
          ),
        ),
      ),
    );
    if (chosen != null) controller.set(s.id, chosen);
  }

  static IconData _icon(AttendanceStatus s) => switch (s) {
    AttendanceStatus.present => Icons.check_circle_outline,
    AttendanceStatus.absent => Icons.cancel_outlined,
    AttendanceStatus.late => Icons.schedule,
    AttendanceStatus.excused => Icons.event_note_outlined,
  };

  @override
  Widget build(BuildContext context) {
    final p = widget.period;
    return ListenableBuilder(
      listenable: controller,
      builder: (context, _) {
        final c = context.colors;
        final l = context.l10n;
        return Scaffold(
          appBar: AppBar(
            title: Text(l.attendance),
            actions: [
              if (controller.students.isNotEmpty)
                TextButton.icon(
                  key: const Key('markAllPresent'),
                  onPressed: controller.markAllPresent,
                  icon: const Icon(Icons.done_all, size: 18),
                  label: Text(l.markAllPresent),
                ),
              const SizedBox(width: Kx.s8),
            ],
          ),
          body: controller.loading
              ? const Center(child: CircularProgressIndicator())
              : controller.error != null
              ? Padding(
                  padding: const EdgeInsets.all(Kx.s16),
                  child: ErrorBanner.api(controller.error!, onRetry: controller.load),
                )
              : controller.students.isEmpty
              ? KxEmptyState(icon: Icons.groups_outlined, message: l.noStudentsInClass)
              : ListView(
                  padding: const EdgeInsets.only(bottom: Kx.s24),
                  children: [
                    Padding(
                      padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s8, Kx.s16, Kx.s12),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(p.subject.name, style: context.text.titleLarge),
                          const SizedBox(height: Kx.s4),
                          Text(
                            '${p.section.name} · ${Fmt.of(context).shortDay(parseIsoDate(widget.date))} · ${Fmt.of(context).clock(p.startsAt)}',
                            style: context.text.bodyLarge,
                          ),
                          const SizedBox(height: Kx.s12),
                          Text(
                            controller.alreadyTaken ? l.attendanceAlreadyTaken : l.attendanceHelp,
                            key: const Key('attendanceHelp'),
                            style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant),
                          ),
                        ],
                      ),
                    ),
                    for (final s in controller.students)
                      _StudentTile(
                        student: s,
                        photo: widget.api.photo(s.photoUrl),
                        status: controller.marks[s.id]!,
                        onTap: () => controller.toggle(s.id),
                        onLongPress: () => _chooseStatus(s),
                      ),
                  ],
                ),
          bottomNavigationBar: controller.loading || controller.students.isEmpty
              ? null
              : _SummaryBar(controller: controller, onSubmit: _submit),
        );
      },
    );
  }
}

class _StudentTile extends StatelessWidget {
  const _StudentTile({required this.student, required this.status, required this.onTap, required this.onLongPress, this.photo});

  final ImageProvider? photo;
  final Student student;
  final AttendanceStatus status;
  final VoidCallback onTap;
  final VoidCallback onLongPress;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final (bg, fg) = switch (status) {
      AttendanceStatus.present => (c.secondaryContainer, c.onSecondaryContainer),
      AttendanceStatus.absent => (c.errorContainer, c.onErrorContainer),
      AttendanceStatus.late => (c.tertiaryContainer, c.onTertiaryContainer),
      AttendanceStatus.excused => (c.surfaceContainerHighest, c.onSurfaceVariant),
    };
    return ListTile(
      key: ValueKey('student-${student.id}'),
      contentPadding: const EdgeInsets.symmetric(horizontal: Kx.s16),
      leading: KxAvatar(name: student.fullName, image: photo),
      title: Text(student.fullName),
      subtitle: Text(student.rollNo),
      onTap: onTap,
      onLongPress: onLongPress,
      trailing: Pill(context.l10n.attendanceStatus(status), key: ValueKey('status-${student.id}'), background: bg, foreground: fg),
    );
  }
}

class _SummaryBar extends StatelessWidget {
  const _SummaryBar({required this.controller, required this.onSubmit});

  final AttendanceController controller;
  final VoidCallback onSubmit;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Material(
      color: c.surfaceContainer,
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s12, Kx.s16, Kx.s12),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  attendanceSummary(context.l10n, controller),
                  key: const Key('attendanceSummary'),
                  style: context.text.titleSmall,
                ),
              ),
              FilledButton(
                key: const Key('submitAttendance'),
                onPressed: controller.submitting ? null : onSubmit,
                child: controller.submitting
                    ? const SizedBox.square(dimension: 20, child: CircularProgressIndicator(strokeWidth: 2))
                    : Text(controller.alreadyTaken ? context.l10n.update : context.l10n.submit),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

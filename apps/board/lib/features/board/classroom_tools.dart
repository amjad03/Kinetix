import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/models.dart';
import '../../l10n/l10n.dart';

/// One-tap attendance on the board: everyone starts present, tap to mark absent or late.
class AttendanceDialog extends StatefulWidget {
  const AttendanceDialog({super.key, required this.roster, required this.initial, required this.onSubmit});

  final List<Student> roster;
  final Map<String, AttendanceMark> initial;
  final ValueChanged<Map<String, AttendanceMark>> onSubmit;

  @override
  State<AttendanceDialog> createState() => _AttendanceDialogState();
}

class _AttendanceDialogState extends State<AttendanceDialog> {
  late final Map<String, AttendanceMark> _marks = {for (final s in widget.roster) s.id: widget.initial[s.id] ?? AttendanceMark.present};

  int _count(AttendanceMark m) => _marks.values.where((v) => v == m).length;

  void _cycle(String id) {
    setState(() {
      _marks[id] = switch (_marks[id]!) {
        AttendanceMark.present => AttendanceMark.absent,
        AttendanceMark.absent => AttendanceMark.late,
        AttendanceMark.late => AttendanceMark.present,
      };
    });
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final l = context.l10n;
    return AlertDialog(
      icon: const Icon(Icons.how_to_reg_outlined),
      title: Text(l.toolAttendance),
      content: SizedBox(
        width: 760,
        // Fit the class: about 64 px per row of four, within the screen.
        height: (((widget.roster.length + 3) ~/ 4) * 64 + 48).clamp(180, 520).toDouble(),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              l.attendanceSummary(_count(AttendanceMark.present), _count(AttendanceMark.absent), _count(AttendanceMark.late)),
              key: const Key('attendance-summary'),
              style: context.text.titleSmall?.copyWith(color: c.onSurfaceVariant),
            ),
            const SizedBox(height: Kx.s12),
            Expanded(
              child: GridView(
                // Rows of a fixed height, so a narrow phone's tiles keep room for name and roll number.
                // One column on a phone, so names are not cut short.
                gridDelegate: SliverGridDelegateWithMaxCrossAxisExtent(
                  maxCrossAxisExtent: MediaQuery.sizeOf(context).width < 600 ? 480 : 240,
                  mainAxisSpacing: Kx.s8,
                  crossAxisSpacing: Kx.s8,
                  mainAxisExtent: 56,
                ),
                children: [for (final s in widget.roster) _AttendanceTile(student: s, mark: _marks[s.id]!, onTap: () => _cycle(s.id))],
              ),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: Text(l.cancel)),
        FilledButton(
          key: const Key('attendance-submit'),
          onPressed: () {
            widget.onSubmit(Map.of(_marks));
            Navigator.pop(context);
          },
          child: Text(l.saveAttendance),
        ),
      ],
    );
  }
}

class _AttendanceTile extends StatelessWidget {
  const _AttendanceTile({required this.student, required this.mark, required this.onTap});

  final Student student;
  final AttendanceMark mark;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final l = context.l10n;
    final (bg, fg, label, icon, iconColor) = switch (mark) {
      AttendanceMark.present => (c.surfaceContainerHighest, c.onSurface, l.present, Icons.check_circle, const Color(0xFF81C995)),
      AttendanceMark.absent => (c.errorContainer, c.onErrorContainer, l.absent, Icons.cancel, c.onErrorContainer),
      AttendanceMark.late => (c.tertiaryContainer, c.onTertiaryContainer, l.late, Icons.schedule, c.onTertiaryContainer),
    };
    return Material(
      color: bg,
      borderRadius: BorderRadius.circular(Kx.rMd),
      child: InkWell(
        borderRadius: BorderRadius.circular(Kx.rMd),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: Kx.s12),
          child: Row(
            children: [
              KxAvatar(name: student.fullName, size: 32),
              const SizedBox(width: Kx.s8),
              Expanded(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      student.fullName,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(color: fg, fontWeight: FontWeight.w500),
                    ),
                    Text(student.rollNo, style: TextStyle(color: fg.withValues(alpha: 0.8), fontSize: 12)),
                    if (student.alert != null)
                      Semantics(
                        label: 'Early alert: ${student.alert}',
                        child: Container(
                          key: ValueKey('alert-${student.id}'),
                          width: 8,
                          height: 8,
                          decoration: BoxDecoration(shape: BoxShape.circle, color: student.alert == 'high' ? const Color(0xFFD32F2F) : const Color(0xFFF9A825)),
                        ),
                      ),
                    // The status reads from the colour and icon; the label is for screen readers.
                    Semantics(label: label, child: const SizedBox.shrink()),
                  ],
                ),
              ),
              Icon(icon, size: 20, color: iconColor),
            ],
          ),
        ),
      ),
    );
  }
}

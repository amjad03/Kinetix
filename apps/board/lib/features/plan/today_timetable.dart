import 'package:flutter/material.dart';
import 'package:zynetix_ui/zynetix_ui.dart';

import '../../core/board_controller.dart';
import '../board/sb_strings.dart';

/// One period of the room's day as the board shows it.
class BoardDayPeriod {
  const BoardDayPeriod({required this.slotId, required this.startsAt, required this.endsAt, required this.section, required this.subject, required this.teacher, this.usualTeacher, this.batch, this.isNow = false, this.logged = false});

  /// The API's `roomPeriods` row (`GET /v1/classroom/today`); null when it is not one.
  static BoardDayPeriod? tryParse(Object? j) {
    if (j is! Map) return null;
    final starts = j['startsAt'], ends = j['endsAt'];
    if (starts is! String || ends is! String) return null;
    return BoardDayPeriod(
      slotId: j['slotId'] as String?,
      startsAt: starts.substring(0, 5),
      endsAt: ends.substring(0, 5),
      section: j['section'] as String? ?? '',
      subject: j['subject'] as String? ?? '',
      teacher: j['teacher'] as String? ?? '',
      usualTeacher: j['usualTeacher'] as String?,
      batch: j['batch'] as String?,
      isNow: j['isNow'] == true,
      logged: j['logged'] == true,
    );
  }

  final String? slotId;
  final String startsAt;
  final String endsAt;
  final String section;
  final String subject;
  final String teacher;
  final String? usualTeacher;
  final String? batch;
  final bool isNow;
  final bool logged;
}

/// Today in this room on the board: each period with its class and teacher (and whom a substitute covers for), the one
/// on now highlighted, a holiday said plainly. For the period on now, the teacher can save the teaching diary from the
/// board: the topics marked taught here (Books) go in, and count as covered.
class TodayTimetableSection extends StatefulWidget {
  const TodayTimetableSection({super.key, required this.board});

  final BoardController board;

  @override
  State<TodayTimetableSection> createState() => _TodayTimetableSectionState();
}

class _TodayTimetableSectionState extends State<TodayTimetableSection> {
  List<BoardDayPeriod>? _periods;
  String? _room;
  String? _holiday;
  String? _currentSlot;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final api = widget.board.api;
    if (api == null || api.sessionToken == null) return;
    try {
      final j = await api.classroomToday();
      if (!mounted || j == null) return;
      setState(() {
        _periods = [for (final p in (j['roomPeriods'] as List? ?? const [])) ?BoardDayPeriod.tryParse(p)];
        _room = (j['room'] as Map?)?['name'] as String?;
        _holiday = j['holiday'] as String?;
        _currentSlot = j['currentSlotId'] as String?;
      });
    } catch (_) {
      // An older server, or offline: the section stays hidden.
    }
  }

  Future<void> _saveDiary() async {
    final s = SbStrings.of(context);
    final api = widget.board.api;
    if (api == null) return;
    setState(() => _saving = true);
    try {
      await api.writeTeachingLogFromBoard();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(s('ttDiarySaved'))));
      await _load();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(s('ttDiaryFailed'))));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final periods = _periods;
    if (periods == null) return const SizedBox.shrink();
    final s = SbStrings.of(context);
    final c = context.colors;
    return Padding(
      key: const Key('board-today'),
      padding: const EdgeInsets.fromLTRB(Kx.s24, Kx.s8, Kx.s24, Kx.s8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(_room == null ? s('ttToday') : s('ttTodayIn', {'room': _room!}), style: context.text.titleMedium),
          const SizedBox(height: Kx.s8),
          if (_holiday != null)
            Text(s('ttHoliday', {'title': _holiday!}), key: const Key('board-today-holiday'))
          else if (periods.isEmpty)
            Text(s('ttNoPeriods'), key: const Key('board-today-empty'), style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant))
          else
            for (final p in periods)
              Container(
                key: Key('board-today-${p.startsAt}'),
                margin: const EdgeInsets.only(bottom: Kx.s4),
                padding: const EdgeInsets.symmetric(horizontal: Kx.s12, vertical: Kx.s8),
                decoration: BoxDecoration(color: p.isNow ? c.primaryContainer : c.surfaceContainerHighest, borderRadius: BorderRadius.circular(Kx.rSm)),
                child: Row(
                  children: [
                    SizedBox(width: 110, child: Text('${p.startsAt}–${p.endsAt}', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600))),
                    Expanded(
                      child: Text(
                        [
                          p.subject,
                          p.section + (p.batch == null ? '' : ' (${p.batch})'),
                          p.usualTeacher == null ? p.teacher : s('ttCovering', {'teacher': p.teacher, 'usual': p.usualTeacher!}),
                        ].join(' · '),
                        style: const TextStyle(fontSize: 16),
                      ),
                    ),
                    if (p.isNow && p.slotId != null && p.slotId == _currentSlot)
                      FilledButton.tonalIcon(
                        key: const Key('board-diary'),
                        onPressed: _saving ? null : _saveDiary,
                        icon: Icon(p.logged ? Icons.task_alt : Icons.history_edu_outlined),
                        label: Text(p.logged ? s('ttDiaryAgain') : s('ttDiarySave')),
                      ),
                  ],
                ),
              ),
        ],
      ),
    );
  }
}

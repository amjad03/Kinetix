import 'package:flutter/material.dart';
import 'package:zynetix_ui/zynetix_ui.dart';

import '../../core/api.dart';
import '../../core/desk_models.dart';
import '../../core/files.dart';
import '../../core/format.dart';
import '../../core/hr_models.dart' show dayString;
import '../../core/l10n.dart';
import '../../core/models.dart';
import '../../widgets/async_body.dart';
import '../../widgets/common.dart';
import 'attendance_screen.dart';

/// The attendance desk: a class's day by period (with special classes), the periods left
/// unmarked, and students' leave and on duty that wait for this teacher's decision.
class AttendanceDeskScreen extends StatelessWidget {
  const AttendanceDeskScreen({super.key, required this.api, this.today, this.openFile = openWithSystem});

  final TeacherApi api;

  /// For tests; defaults to the device clock.
  final DateTime? today;
  final OpenFile openFile;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return DefaultTabController(
      length: 3,
      child: Scaffold(
        appBar: AppBar(
          title: Text(l.deskTitle),
          bottom: TabBar(
            isScrollable: true,
            tabAlignment: TabAlignment.start,
            tabs: [Tab(key: const Key('tabByClass'), text: l.deskByClass), Tab(key: const Key('tabUnmarked'), text: l.deskUnmarked), Tab(key: const Key('tabStudentLeave'), text: l.deskStudentLeave)],
          ),
        ),
        body: TabBarView(
          children: [
            _ClassDayTab(api: api, today: DateUtils.dateOnly(today ?? DateTime.now())),
            _UnmarkedTab(api: api),
            StudentLeaveApprovals(api: api, openFile: openFile),
          ],
        ),
      ),
    );
  }
}

class _ClassDayTab extends StatefulWidget {
  const _ClassDayTab({required this.api, required this.today});

  final TeacherApi api;
  final DateTime today;

  @override
  State<_ClassDayTab> createState() => _ClassDayTabState();
}

class _ClassDayTabState extends State<_ClassDayTab> with AutomaticKeepAliveClientMixin {
  List<DeskClass>? _classes;
  String? _sectionId;
  late DateTime _date = widget.today;
  ClassDay? _day;
  ApiException? _error;
  bool _loading = false;

  @override
  bool get wantKeepAlive => true;

  @override
  void initState() {
    super.initState();
    _loadClasses();
  }

  Future<void> _loadClasses() async {
    setState(() => _error = null);
    try {
      final c = await widget.api.deskClasses();
      if (!mounted) return;
      setState(() {
        _classes = c;
        _sectionId ??= c.firstOrNull?.id;
      });
      await _loadDay();
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  Future<void> _loadDay() async {
    final id = _sectionId;
    if (id == null) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final d = await widget.api.classDay(id, dayString(_date));
      if (mounted) setState(() => _day = d);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _pickDate() async {
    final d = await showDatePicker(context: context, initialDate: _date, firstDate: widget.today.subtract(const Duration(days: 60)), lastDate: widget.today.add(const Duration(days: 30)));
    if (d == null) return;
    setState(() => _date = d);
    await _loadDay();
  }

  Future<void> _markPeriod(DeskPeriod p) async {
    await Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => AttendanceScreen(api: widget.api, period: p.period, date: p.date)));
    await _loadDay();
  }

  Future<void> _markSpecial(SpecialClassRow s) async {
    await Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => SpecialAttendanceScreen(api: widget.api, specialId: s.id)));
    await _loadDay();
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    final l = context.l10n;
    final f = Fmt.of(context);
    final c = context.colors;
    final classes = _classes;
    final day = _day;
    final future = _date.isAfter(widget.today);
    return RefreshIndicator(
      onRefresh: _loadDay,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(Kx.s16),
        children: [
          if (_error != null) ...[ErrorBanner.api(_error!, onRetry: classes == null ? _loadClasses : _loadDay), const SizedBox(height: Kx.s12)],
          if (classes == null && _error == null) const Center(child: CircularProgressIndicator()),
          if (classes != null && classes.isEmpty) Text(l.deskNoClasses, key: const Key('deskNoClasses')),
          if (classes != null && classes.isNotEmpty) ...[
            Row(
              children: [
                Expanded(
                  child: DropdownButtonFormField<String>(
                    key: const Key('deskClass'),
                    initialValue: _sectionId,
                    isExpanded: true,
                    decoration: InputDecoration(labelText: l.deskClass),
                    items: [for (final k in classes) DropdownMenuItem(value: k.id, child: Text(k.program.isEmpty ? k.name : '${k.name} · ${k.program}', overflow: TextOverflow.ellipsis))],
                    onChanged: (v) {
                      setState(() => _sectionId = v);
                      _loadDay();
                    },
                  ),
                ),
                const SizedBox(width: Kx.s12),
                ActionChip(key: const Key('deskDate'), avatar: const Icon(Icons.event, size: 18), label: Text(f.shortDay(_date)), onPressed: _pickDate),
              ],
            ),
            const SizedBox(height: Kx.s12),
            if (_loading && day == null) const Center(child: CircularProgressIndicator()),
            if (day != null) ...[
              if (day.holiday != null)
                Card(
                  color: c.tertiaryContainer,
                  child: ListTile(leading: const Icon(Icons.celebration_outlined), title: Text(l.deskHoliday(day.holiday!))),
                ),
              KxSectionHeader(l.deskPeriods),
              if (day.periods.isEmpty) Text(l.deskNoPeriods, key: const Key('deskNoPeriods'), style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant)),
              for (final p in day.periods)
                Card(
                  key: Key('deskPeriod-${p.slotId}'),
                  child: ListTile(
                    leading: Text('${p.startsAt}\n${p.endsAt}', style: context.text.labelMedium),
                    title: Text(p.subject),
                    subtitle: Text([p.teacher, if (p.substitute) l.deskSubstitute, if (p.batch != null) l.deskBatch(p.batch!)].join(' · ')),
                    trailing: _MarkedPill(marked: p.marked, strength: day.strength),
                    onTap: future ? null : () => _markPeriod(p),
                  ),
                ),
              KxSectionHeader(l.deskSpecialClasses),
              if (day.special.isEmpty) Text(l.deskNoSpecial, style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant)),
              for (final s in day.special)
                Card(
                  key: Key('deskSpecial-${s.id}'),
                  child: ListTile(
                    leading: Text('${s.startsAt}\n${s.endsAt}', style: context.text.labelMedium),
                    title: Text('${s.subject} · ${_specialKind(l, s.kind)}'),
                    subtitle: Text(s.status == 'cancelled' ? l.deskCancelled : s.teacher),
                    trailing: _MarkedPill(marked: s.marked, strength: day.strength),
                    onTap: future || s.status == 'cancelled' ? null : () => _markSpecial(s),
                  ),
                ),
              if (future) Padding(padding: const EdgeInsets.only(top: Kx.s12), child: Text(l.deskFutureNote, style: context.text.bodySmall)),
            ],
          ],
        ],
      ),
    );
  }
}

String _specialKind(AppLocalizations l, String kind) => switch (kind) {
  'remedial' => l.deskKindRemedial,
  'extra' => l.deskKindExtra,
  'makeup' || 'compensatory' => l.deskKindMakeup,
  _ => l.deskKindSpecial,
};

class _MarkedPill extends StatelessWidget {
  const _MarkedPill({required this.marked, required this.strength});

  final int marked;
  final int strength;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final c = context.colors;
    final done = marked > 0;
    return Pill(
      done ? l.deskMarkedCount(marked) : l.deskNotMarked,
      icon: done ? Icons.check : Icons.pending_outlined,
      background: done ? c.secondaryContainer : c.errorContainer,
      foreground: done ? c.onSecondaryContainer : c.onErrorContainer,
    );
  }
}

class _UnmarkedTab extends StatelessWidget {
  const _UnmarkedTab({required this.api});

  final TeacherApi api;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final f = Fmt.of(context);
    return AsyncBody<List<DeskPeriod>>(
      key: const Key('unmarkedList'),
      load: () => api.unmarkedPeriods(),
      isEmpty: (rows) => rows.isEmpty,
      empty: l.deskAllMarked,
      builder: (context, rows, reload) => ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(Kx.s16),
        children: [
          Text(l.deskUnmarkedHelp(rows.length), style: context.text.bodyMedium),
          const SizedBox(height: Kx.s8),
          for (final p in rows)
            Card(
              key: Key('unmarked-${p.slotId}-${p.date}'),
              child: ListTile(
                leading: const Icon(Icons.pending_actions_outlined),
                title: Text('${p.section} · ${p.subject}'),
                subtitle: Text([f.shortDay(dayOf(p.date) ?? DateTime.now()), '${p.startsAt}–${p.endsAt}', if (p.substitute) l.deskSubstitute].join(' · ')),
                trailing: FilledButton.tonal(
                  key: Key('markUnmarked-${p.slotId}-${p.date}'),
                  onPressed: () async {
                    await Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => AttendanceScreen(api: api, period: p.period, date: p.date)));
                    await reload();
                  },
                  child: Text(l.deskMark),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// Students' leave and on duty waiting for this teacher (class teacher or a teacher of the class):
/// approve (the marks follow the policy) or decline with a reason.
class StudentLeaveApprovals extends StatelessWidget {
  const StudentLeaveApprovals({super.key, required this.api, this.openFile = openWithSystem});

  final TeacherApi api;
  final OpenFile openFile;

  Future<void> _decide(BuildContext context, StudentLeaveRow r, bool approve, Future<void> Function() reload) async {
    final l = context.l10n;
    final note = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(approve ? l.deskApproveLeaveTitle(r.fullName) : l.deskDeclineLeaveTitle(r.fullName)),
        content: TextField(
          key: const Key('studentLeaveNote'),
          controller: note,
          maxLength: 500,
          decoration: InputDecoration(labelText: approve ? l.deskNoteOptional : l.deskDeclineReason),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(l.cancel)),
          FilledButton(key: const Key('confirmStudentLeave'), onPressed: () => Navigator.pop(ctx, true), child: Text(approve ? l.leaveApprove : l.leaveReject)),
        ],
      ),
    );
    // The dialog's field may still be animating out: the controller is left to the garbage collector.
    final text = note.text.trim();
    if (ok != true || !context.mounted) return;
    if (!approve && text.length < 3) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(l.deskDeclineNeedsReason)));
      return;
    }
    final messenger = ScaffoldMessenger.of(context);
    if (await runOrSnack(context, () => api.decideStudentLeave(r.id, approve: approve, note: text.isEmpty ? null : text))) {
      messenger.showSnackBar(SnackBar(content: Text(approve ? l.deskLeaveApproved : l.deskLeaveDeclined)));
      await reload();
    }
  }

  Future<void> _document(BuildContext context, StudentLeaveRow r) async {
    final messenger = ScaffoldMessenger.of(context);
    final l = context.l10n;
    try {
      final bytes = await api.studentLeaveDocument(r.id);
      final pdf = bytes.length > 4 && String.fromCharCodes(bytes.take(4)) == '%PDF';
      final ok = await openFile(bytes, 'leave-${r.id}.${pdf ? 'pdf' : 'jpg'}', pdf ? 'application/pdf' : 'image/jpeg');
      if (!ok) messenger.showSnackBar(SnackBar(content: Text(l.couldNotOpenFile)));
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(l.errorText(e))));
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final f = Fmt.of(context);
    return AsyncBody<List<StudentLeaveRow>>(
      key: const Key('studentLeaveList'),
      load: api.pendingStudentLeaves,
      isEmpty: (rows) => rows.isEmpty,
      empty: l.deskNoStudentLeave,
      builder: (context, rows, reload) => ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(Kx.s16),
        children: [
          for (final r in rows)
            Card(
              key: Key('studentLeave-${r.id}'),
              child: Padding(
                padding: const EdgeInsets.all(Kx.s12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('${r.rollNo} ${r.fullName} · ${r.section}', style: context.text.titleSmall),
                    Text(
                      [
                        switch (r.kind) { 'on_duty' => l.deskKindOnDuty, 'medical' => l.deskKindMedical, _ => l.deskKindLeave },
                        r.fromDate == r.toDate ? f.shortDay(r.fromDate) : '${f.shortDay(r.fromDate)} – ${f.shortDay(r.toDate)}',
                        if (r.fromTime != null && r.toTime != null) '${r.fromTime}–${r.toTime}',
                      ].join(' · '),
                    ),
                    if (r.activity.isNotEmpty) Text(r.activity, style: context.text.bodyMedium),
                    Text(r.reason, style: context.text.bodyMedium),
                    if (r.requestedBy.isNotEmpty) Text(l.deskAskedBy(r.requestedBy), style: context.text.bodySmall),
                    if (r.hasDocument)
                      TextButton.icon(key: Key('leaveDoc-${r.id}'), onPressed: () => _document(context, r), icon: const Icon(Icons.attach_file), label: Text(l.deskViewDocument))
                    else if (r.kind == 'medical')
                      Text(l.deskNoCertificate, style: context.text.bodySmall?.copyWith(color: context.colors.error)),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.end,
                      children: [
                        TextButton(key: Key('declineStudentLeave-${r.id}'), onPressed: () => _decide(context, r, false, reload), child: Text(l.leaveReject)),
                        const SizedBox(width: Kx.s8),
                        FilledButton(key: Key('approveStudentLeave-${r.id}'), onPressed: () => _decide(context, r, true, reload), child: Text(l.leaveApprove)),
                      ],
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// Marking a special class: everyone present to start (leave that stands is shown and kept), a tap
/// changes a mark, Save writes it and the class counts as held.
class SpecialAttendanceScreen extends StatefulWidget {
  const SpecialAttendanceScreen({super.key, required this.api, required this.specialId});

  final TeacherApi api;
  final String specialId;

  @override
  State<SpecialAttendanceScreen> createState() => _SpecialAttendanceScreenState();
}

class _SpecialAttendanceScreenState extends State<SpecialAttendanceScreen> {
  SpecialSheet? _sheet;
  final _marks = <String, AttendanceStatus>{};
  ApiException? _error;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final s = await widget.api.specialSheet(widget.specialId);
      if (!mounted) return;
      setState(() {
        _sheet = s;
        _marks
          ..clear()
          ..addAll({for (final r in s.roster) r.id: r.status ?? r.leave?.countsAs ?? AttendanceStatus.present});
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  void _cycle(String id) {
    const order = [AttendanceStatus.present, AttendanceStatus.absent, AttendanceStatus.late, AttendanceStatus.excused];
    setState(() => _marks[id] = order[(order.indexOf(_marks[id]!) + 1) % order.length]);
  }

  Future<void> _save() async {
    final l = context.l10n;
    final messenger = ScaffoldMessenger.of(context);
    setState(() => _saving = true);
    final ok = await runOrSnack(context, () => widget.api.markSpecial(widget.specialId, Map.of(_marks)));
    if (!mounted) return;
    setState(() => _saving = false);
    if (ok) {
      messenger.showSnackBar(SnackBar(content: Text(l.deskSpecialSaved)));
      Navigator.of(context).pop();
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final c = context.colors;
    final s = _sheet;
    final absent = _marks.values.where((m) => m == AttendanceStatus.absent).length;
    return Scaffold(
      appBar: AppBar(title: Text(s == null ? l.deskSpecialClasses : '${s.subject} · ${s.section}')),
      body: s == null
          ? (_error == null ? const Center(child: CircularProgressIndicator()) : ListView(padding: const EdgeInsets.all(Kx.s16), children: [ErrorBanner.api(_error!, onRetry: _load)]))
          : ListView(
              padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s8, Kx.s16, 96),
              children: [
                Text('${s.date} · ${s.startsAt}–${s.endsAt}', style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant)),
                Text(l.deskTapToChange, style: context.text.bodySmall),
                const SizedBox(height: Kx.s8),
                for (final r in s.roster)
                  Card(
                    key: Key('specialRow-${r.id}'),
                    child: ListTile(
                      leading: CircleAvatar(child: Text(r.rollNo)),
                      title: Text(r.fullName),
                      subtitle: r.leave == null ? null : Text(r.leave!.kind == 'on_duty' ? l.deskOnDutyCovers : l.deskLeaveCovers),
                      trailing: _StatusChip(status: _marks[r.id]!),
                      onTap: s.future ? null : () => _cycle(r.id),
                    ),
                  ),
              ],
            ),
      floatingActionButton: s == null || s.future
          ? null
          : FloatingActionButton.extended(
              key: const Key('saveSpecial'),
              onPressed: _saving ? null : _save,
              icon: _saving ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.save_outlined),
              label: Text(l.deskSaveMarks(absent)),
            ),
    );
  }
}

class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.status});

  final AttendanceStatus status;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final c = context.colors;
    final (label, bg, fg) = switch (status) {
      AttendanceStatus.present => (l.attendanceStatus(status), c.secondaryContainer, c.onSecondaryContainer),
      AttendanceStatus.absent => (l.attendanceStatus(status), c.errorContainer, c.onErrorContainer),
      AttendanceStatus.late => (l.attendanceStatus(status), c.tertiaryContainer, c.onTertiaryContainer),
      AttendanceStatus.excused => (l.attendanceStatus(status), c.surfaceContainerHighest, c.onSurfaceVariant),
    };
    return Pill(label, background: bg, foreground: fg);
  }
}

import 'package:flutter/material.dart';
import 'package:zynetix_ui/zynetix_ui.dart';

import '../../core/api.dart';
import '../../core/attachments.dart';
import '../../core/format.dart';
import '../../core/models.dart';
import '../../core/self_service.dart';
import '../../l10n/l10n.dart';
import '../../widgets/common.dart';
import '../../widgets/load_view.dart';

String _pct(double? v) => v == null ? '–' : '${Fmt.marks(v)}%';

/// The tone of a percentage against the rules: short (red), close to the line (amber), fine (green).
KxTone _tone(double? pct, AttendancePolicyView p) {
  if (pct == null) return KxTone.neutral;
  if (pct < p.thresholdPct) return KxTone.danger;
  if (pct < p.warnPct) return KxTone.warning;
  return KxTone.success;
}

/// My attendance by subject against the minimum the university (or board, or the college) sets,
/// with a warning when I am short or close to it and how many classes would bring me back.
class AttendanceOverviewScreen extends StatefulWidget {
  const AttendanceOverviewScreen({super.key, required this.api, required this.studentId});

  final StudentApi api;
  final String studentId;

  static Future<void> open(BuildContext context, StudentApi api, String studentId) =>
      Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => AttendanceOverviewScreen(api: api, studentId: studentId)));

  @override
  State<AttendanceOverviewScreen> createState() => _AttendanceOverviewScreenState();
}

class _AttendanceOverviewScreenState extends State<AttendanceOverviewScreen> {
  AttendanceOverview? _data;
  ApiException? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final d = await widget.api.attendanceOverview(widget.studentId);
      if (mounted) setState(() => _data = d);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final c = context.colors;
    final d = _data;
    return Scaffold(
      appBar: AppBar(title: Text(l.atBySubject)),
      floatingActionButton: FloatingActionButton.extended(
        key: const Key('openAttendanceLeave'),
        onPressed: () async {
          await AttendanceLeaveScreen.open(context, widget.api);
          await _load();
        },
        icon: const Icon(Icons.event_note_outlined),
        label: Text(l.atLeaveOnDuty),
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s8, Kx.s16, 96),
          children: [
            if (_error != null) ErrorBanner(_error!, onRetry: _load),
            if (d == null && _error == null) const KxLoading(),
            if (d != null) ...[
              _OverallCard(data: d),
              const SizedBox(height: Kx.s8),
              Text(
                d.policy.profile == null ? l.atRuleOwn(Fmt.marks(d.policy.thresholdPct)) : l.atRuleBody(Fmt.marks(d.policy.thresholdPct), d.policy.profile!),
                key: const Key('atRule'),
                style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant),
              ),
              if (d.policy.perSubject) Text(l.atPerSubjectRule, style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant)),
              SectionTitle(l.atSubjects),
              if (d.subjects.isEmpty) EmptyNote(l.atNoSubjects),
              for (final s in d.subjects) _SubjectRow(subject: s, policy: d.policy),
            ],
          ],
        ),
      ),
    );
  }
}

class _OverallCard extends StatelessWidget {
  const _OverallCard({required this.data});

  final AttendanceOverview data;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final d = data;
    final p = d.policy;
    final pct = d.overall.counted;
    final tone = d.status == 'detained' || d.status == 'condonable' ? KxTone.danger : (d.warning ? KxTone.warning : _tone(pct, p));
    final t = kxTone(context, tone);
    final short = d.subjects.where((s) => s.short).toList();
    final message = switch (d.status) {
      'detained' => l.atDetained,
      'condonable' => short.isEmpty ? l.atShortOverall(Fmt.marks(p.thresholdPct)) : l.atShortIn(short.map((s) => s.subject).join(', ')),
      _ => d.warning ? l.atClose(Fmt.marks(p.thresholdPct)) : l.atFine,
    };
    return KxCard(
      key: const Key('atOverall'),
      color: t.bg,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(child: Text(d.windowLabel.isEmpty ? l.atOverall : l.atOverallIn(d.windowLabel), style: context.text.titleSmall?.copyWith(color: t.fg))),
              Text(_pct(pct), key: const Key('atOverallPct'), style: context.text.headlineSmall?.copyWith(color: t.fg, fontWeight: FontWeight.w700)),
            ],
          ),
          Text(l.atHeldAttended(d.overall.attended, d.overall.held), style: context.text.bodySmall?.copyWith(color: t.fg)),
          const SizedBox(height: Kx.s8),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(tone == KxTone.success ? Icons.check_circle_outline : Icons.warning_amber_rounded, color: t.fg, size: 20),
              const SizedBox(width: Kx.s8),
              Expanded(child: Text(message, key: const Key('atStatus'), style: context.text.bodyMedium?.copyWith(color: t.fg, fontWeight: FontWeight.w500))),
            ],
          ),
        ],
      ),
    );
  }
}

class _SubjectRow extends StatelessWidget {
  const _SubjectRow({required this.subject, required this.policy});

  final SubjectAttendance subject;
  final AttendancePolicyView policy;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final c = context.colors;
    final s = subject;
    final pct = s.counted;
    final tone = s.short ? KxTone.danger : _tone(pct, policy);
    final need = s.classesToReach(policy.thresholdPct);
    return Card(
      key: Key('atSubject-${s.subjectId}'),
      child: Padding(
        padding: const EdgeInsets.all(Kx.s12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(child: Text(s.subject, style: context.text.titleSmall)),
                if (s.code.isNotEmpty) Text(s.code, style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant)),
              ],
            ),
            const SizedBox(height: Kx.s8),
            KxProgressBar(value: (pct ?? 0) / 100, label: _pct(pct), tone: tone),
            const SizedBox(height: Kx.s4),
            Text(l.atHeldAttended(s.attended, s.held), style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant)),
            if (s.condoned > 0) Text(l.atCondoned(s.condoned), style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant)),
            if (tone == KxTone.danger && need > 0)
              Padding(
                padding: const EdgeInsets.only(top: Kx.s4),
                child: Text(l.atNeedClasses(need, Fmt.marks(policy.thresholdPct)), key: Key('atNeed-${s.subjectId}'), style: context.text.bodyMedium?.copyWith(color: c.error, fontWeight: FontWeight.w500)),
              )
            else if (tone == KxTone.warning)
              Padding(
                padding: const EdgeInsets.only(top: Kx.s4),
                child: Text(l.atCloseSubject(Fmt.marks(policy.thresholdPct)), style: context.text.bodyMedium?.copyWith(color: Tone.warn(context))),
              ),
          ],
        ),
      ),
    );
  }
}

/// Leave and on duty for attendance: my requests and where each stands, and a form to apply with
/// a document (a medical certificate is needed for medical leave).
class AttendanceLeaveScreen extends StatefulWidget {
  const AttendanceLeaveScreen({super.key, required this.api});

  final StudentApi api;

  static Future<void> open(BuildContext context, StudentApi api) => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => AttendanceLeaveScreen(api: api)));

  @override
  State<AttendanceLeaveScreen> createState() => _AttendanceLeaveScreenState();
}

class _AttendanceLeaveScreenState extends State<AttendanceLeaveScreen> {
  List<AttendanceLeave>? _items;
  ApiException? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final r = await widget.api.attendanceLeaves();
      if (mounted) setState(() => _items = r);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  Future<void> _apply() async {
    final sent = await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => ApplyAttendanceLeaveScreen(api: widget.api)));
    if (sent == true && mounted) {
      say(context, context.l10n.atLeaveSent);
      await _load();
    }
  }

  Future<void> _cancel(AttendanceLeave x) async {
    if (await attempt(context, () => widget.api.cancelAttendanceLeave(x.id), done: context.l10n.atLeaveWithdrawn)) await _load();
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final c = context.colors;
    final items = _items;
    return Scaffold(
      appBar: AppBar(title: Text(l.atLeaveOnDuty)),
      floatingActionButton: FloatingActionButton.extended(key: const Key('applyAttendanceLeave'), onPressed: _apply, icon: const Icon(Icons.add), label: Text(l.atApply)),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s8, Kx.s16, 96),
          children: [
            if (_error != null) ErrorBanner(_error!, onRetry: _load),
            if (items == null && _error == null) const KxLoading(),
            if (items != null && items.isEmpty) KxEmptyState(key: const Key('atLeaveEmpty'), icon: Icons.event_available_outlined, message: l.atLeaveEmpty),
            for (final x in items ?? const <AttendanceLeave>[])
              Card(
                key: Key('atLeave-${x.id}'),
                child: Padding(
                  padding: const EdgeInsets.all(Kx.s12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Icon(_kindIcon(x.kind), color: c.primary),
                          const SizedBox(width: Kx.s8),
                          Expanded(child: Text(_kindName(l, x.kind), style: context.text.titleSmall)),
                          _LeaveStatus(status: x.status),
                        ],
                      ),
                      const SizedBox(height: Kx.s4),
                      Text(
                        [context.fmt.dayRange(x.fromDate, x.toDate), if (x.fromTime != null && x.toTime != null) '${x.fromTime}–${x.toTime}'].join(' · '),
                        style: context.text.bodyMedium,
                      ),
                      if (x.activity.isNotEmpty) Text(x.activity, style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant)),
                      Text(x.reason, style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant)),
                      if (x.hasDocument) Padding(padding: const EdgeInsets.only(top: Kx.s4), child: Text(l.atDocumentAttached, style: context.text.bodySmall)),
                      if (x.status == 'approved' && x.countsAs != null) Text(l.atCountsAs(_countsName(l, x.countsAs!)), style: context.text.bodySmall?.copyWith(color: Tone.good(context))),
                      if (x.decisionNote.isNotEmpty) Text(x.decisionNote, style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant)),
                      if (x.status == 'pending')
                        Align(alignment: Alignment.centerRight, child: TextButton(key: Key('withdraw-${x.id}'), onPressed: () => _cancel(x), child: Text(l.atWithdraw))),
                    ],
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

IconData _kindIcon(String kind) => switch (kind) {
  'on_duty' => Icons.emoji_events_outlined,
  'medical' => Icons.medical_services_outlined,
  _ => Icons.event_busy_outlined,
};

String _kindName(AppLocalizations l, String kind) => switch (kind) {
  'on_duty' => l.atKindOnDuty,
  'medical' => l.atKindMedical,
  _ => l.atKindPersonal,
};

String _countsName(AppLocalizations l, String v) => switch (v) {
  'present' => l.atCountsPresent,
  'excused' => l.atCountsExcused,
  _ => l.atCountsAbsent,
};

class _LeaveStatus extends StatelessWidget {
  const _LeaveStatus({required this.status});

  final String status;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final (label, tone) = switch (status) {
      'approved' => (l.atApproved, KxTone.success),
      'rejected' => (l.atDeclined, KxTone.danger),
      'revoked' => (l.atRevoked, KxTone.danger),
      'cancelled' => (l.atWithdrawn, KxTone.neutral),
      _ => (l.atAwaiting, KxTone.warning),
    };
    final t = kxTone(context, tone);
    return Pill(label, background: t.bg, foreground: t.fg);
  }
}

/// Applying for leave or on duty: the kind, the days (or part of a day), the reason, the event for
/// on duty, and the supporting document.
class ApplyAttendanceLeaveScreen extends StatefulWidget {
  const ApplyAttendanceLeaveScreen({super.key, required this.api, this.now});

  final StudentApi api;
  final DateTime Function()? now;

  @override
  State<ApplyAttendanceLeaveScreen> createState() => _ApplyAttendanceLeaveScreenState();
}

class _ApplyAttendanceLeaveScreenState extends State<ApplyAttendanceLeaveScreen> {
  String _kind = 'on_duty';
  late final DateTime _today = DateUtils.dateOnly((widget.now ?? DateTime.now)());
  late DateTime _from = _today;
  late DateTime _to = _today;
  bool _partDay = false;
  TimeOfDay _fromTime = const TimeOfDay(hour: 9, minute: 0);
  TimeOfDay _toTime = const TimeOfDay(hour: 13, minute: 0);
  final _reason = TextEditingController();
  final _activity = TextEditingController();
  UploadFile? _document;
  bool _busy = false;
  Object? _problem;

  @override
  void dispose() {
    _reason.dispose();
    _activity.dispose();
    super.dispose();
  }

  String _hm(TimeOfDay t) => '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';

  Future<void> _pickDoc(AttachmentSource source) async {
    final picked = await AttachmentPicker.instance.pick(source, max: 1);
    if (picked.isEmpty || !mounted) return;
    final f = picked.first;
    if (f.bytes.length > 5 * 1024 * 1024) return setState(() => _problem = context.l10n.atDocTooBig);
    setState(() {
      _document = f;
      _problem = null;
    });
  }

  Future<void> _pickDate(bool from) async {
    final d = await showDatePicker(context: context, initialDate: from ? _from : _to, firstDate: _today.subtract(const Duration(days: 30)), lastDate: _today.add(const Duration(days: 180)));
    if (d == null) return;
    setState(() {
      if (from) {
        _from = d;
        if (_to.isBefore(d)) _to = d;
      } else {
        _to = d;
      }
    });
  }

  Future<void> _send() async {
    final l = context.l10n;
    if (_reason.text.trim().length < 3) return setState(() => _problem = l.atReasonNeeded);
    if (_to.isBefore(_from)) return setState(() => _problem = l.atEndBeforeStart);
    if (_kind == 'medical' && _document == null) return setState(() => _problem = l.atNeedCertificate);
    if (_kind == 'on_duty' && _activity.text.trim().isEmpty) return setState(() => _problem = l.atNeedActivity);
    if (_partDay && _hm(_fromTime).compareTo(_hm(_toTime)) >= 0) return setState(() => _problem = l.atTimesOrder);
    setState(() {
      _busy = true;
      _problem = null;
    });
    try {
      await widget.api.applyAttendanceLeave(
        kind: _kind,
        from: _from,
        to: _partDay ? _from : _to,
        reason: _reason.text.trim(),
        activity: _kind == 'on_duty' ? _activity.text.trim() : '',
        fromTime: _partDay ? _hm(_fromTime) : null,
        toTime: _partDay ? _hm(_toTime) : null,
        document: _document,
      );
      if (mounted) Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      if (mounted) {
        setState(() {
          _busy = false;
          _problem = e;
        });
      }
    }
  }

  Widget _field(String label, String value, VoidCallback onTap, {Key? key}) => InkWell(
    key: key,
    borderRadius: Kx.radiusMd,
    onTap: onTap,
    child: InputDecorator(decoration: InputDecoration(labelText: label), child: Text(value, style: context.text.bodyLarge)),
  );

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final c = context.colors;
    return Scaffold(
      appBar: AppBar(title: Text(l.atApplyTitle)),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s8, Kx.s16, Kx.s32),
        children: [
          Wrap(
            spacing: Kx.s8,
            runSpacing: Kx.s8,
            children: [
              for (final k in ['on_duty', 'medical', 'personal'])
                ChoiceChip(key: Key('kind-$k'), avatar: Icon(_kindIcon(k), size: 18), label: Text(_kindName(l, k)), selected: _kind == k, onSelected: (_) => setState(() => _kind = k)),
            ],
          ),
          const SizedBox(height: Kx.s8),
          Text(switch (_kind) { 'on_duty' => l.atOnDutyHelp, 'medical' => l.atMedicalHelp, _ => l.atPersonalHelp }, style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant)),
          const SizedBox(height: Kx.s12),
          SwitchListTile(key: const Key('partDay'), contentPadding: EdgeInsets.zero, title: Text(l.atPartOfDay), value: _partDay, onChanged: (v) => setState(() => _partDay = v)),
          Row(
            children: [
              Expanded(child: _field(_partDay ? l.atOnDay : l.atFirstDay, context.fmt.date(_from), () => _pickDate(true), key: const Key('atFrom'))),
              if (!_partDay) ...[const SizedBox(width: Kx.s12), Expanded(child: _field(l.atLastDay, context.fmt.date(_to), () => _pickDate(false), key: const Key('atTo')))],
            ],
          ),
          if (_partDay) ...[
            const SizedBox(height: Kx.s8),
            Row(
              children: [
                Expanded(
                  child: _field(l.atFromTime, _hm(_fromTime), () async {
                    final t = await showTimePicker(context: context, initialTime: _fromTime);
                    if (t != null) setState(() => _fromTime = t);
                  }, key: const Key('atFromTime')),
                ),
                const SizedBox(width: Kx.s12),
                Expanded(
                  child: _field(l.atToTime, _hm(_toTime), () async {
                    final t = await showTimePicker(context: context, initialTime: _toTime);
                    if (t != null) setState(() => _toTime = t);
                  }, key: const Key('atToTime')),
                ),
              ],
            ),
          ],
          if (_kind == 'on_duty') TextField(key: const Key('atActivity'), controller: _activity, maxLength: 200, decoration: InputDecoration(labelText: l.atActivity)),
          TextField(key: const Key('atReason'), controller: _reason, maxLength: 1000, maxLines: 3, decoration: InputDecoration(labelText: l.atReason)),
          const SizedBox(height: Kx.s8),
          Text(_kind == 'medical' ? l.atDocumentNeeded : l.atDocumentOptional, style: context.text.labelLarge),
          const SizedBox(height: Kx.s8),
          if (_document != null)
            Card(
              child: ListTile(
                key: const Key('atDocument'),
                leading: Icon(_document!.isImage ? Icons.image_outlined : Icons.picture_as_pdf_outlined),
                title: Text(_document!.name, maxLines: 1, overflow: TextOverflow.ellipsis),
                subtitle: Text(Fmt.fileSize(_document!.bytes.length)),
                trailing: IconButton(tooltip: l.atRemove, icon: const Icon(Icons.close), onPressed: () => setState(() => _document = null)),
              ),
            )
          else
            Wrap(
              spacing: Kx.s8,
              runSpacing: Kx.s8,
              children: [
                OutlinedButton.icon(key: const Key('atDocCamera'), onPressed: () => _pickDoc(AttachmentSource.camera), icon: const Icon(Icons.photo_camera_outlined), label: Text(l.atTakePhoto)),
                OutlinedButton.icon(key: const Key('atDocPdf'), onPressed: () => _pickDoc(AttachmentSource.pdf), icon: const Icon(Icons.picture_as_pdf_outlined), label: Text(l.atChooseFile)),
              ],
            ),
          if (_problem != null) Padding(padding: const EdgeInsets.only(top: Kx.s12), child: ErrorBanner(_problem!)),
          const SizedBox(height: Kx.s16),
          FilledButton(
            key: const Key('atSend'),
            onPressed: _busy ? null : _send,
            style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(Kx.target)),
            child: _busy ? const SizedBox.square(dimension: 20, child: CircularProgressIndicator(strokeWidth: 2)) : Text(l.atSend),
          ),
        ],
      ),
    );
  }
}

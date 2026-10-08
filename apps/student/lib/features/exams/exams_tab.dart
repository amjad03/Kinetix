import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/campus_services.dart';
import '../../core/files.dart';
import '../../core/models.dart';
import '../../l10n/l10n.dart';
import '../../widgets/common.dart';

/// Exams: the timetable of every session, the hall ticket as a PDF, published results with
/// SGPA and CGPA, and a request to have a paper re-checked while the window is open.
class ExamsTab extends StatefulWidget {
  const ExamsTab({super.key, required this.api, required this.student, this.openFile = openWithSystem});

  final StudentApi api;
  final StudentProfile student;
  final OpenFile openFile;

  @override
  State<ExamsTab> createState() => _ExamsTabState();
}

class _ExamsTabState extends State<ExamsTab> {
  List<ExamSession>? _sessions;
  ExamResults? _results;
  ApiException? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final r = await Future.wait([widget.api.exams(widget.student.id), widget.api.examResults(widget.student.id)]);
      if (!mounted) return;
      setState(() {
        _sessions = r[0] as List<ExamSession>;
        _results = r[1] as ExamResults;
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  Future<void> _hallTicket(ExamSession s) async {
    final l = context.l10n;
    final messenger = ScaffoldMessenger.of(context);
    try {
      final bytes = await widget.api.hallTicketPdf(s.id, widget.student.id);
      final ok = await widget.openFile(bytes, 'hall-ticket-${s.hallTicket?.ticketNo ?? s.id}.pdf', 'application/pdf');
      if (!ok) messenger.showSnackBar(SnackBar(content: Text(l.fileOpenFailed)));
    } on ApiException catch (e) {
      if (mounted) messenger.showSnackBar(SnackBar(content: Text(context.errorText(e))));
    }
  }

  Future<void> _revalue(ExamSession s, ResultLine line, String subjectId) async {
    final l = context.l10n;
    final messenger = ScaffoldMessenger.of(context);
    final reason = await showDialog<String>(context: context, builder: (_) => const _ReasonDialog());
    if (reason == null) return;
    try {
      await widget.api.requestRevaluation(widget.student.id, sessionId: s.id, subjectId: subjectId, reason: reason);
      messenger.showSnackBar(SnackBar(content: Text(l.revaluationSent)));
      await _load();
    } on ApiException catch (e) {
      if (mounted) messenger.showSnackBar(SnackBar(content: Text(context.errorText(e))));
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final sessions = _sessions;
    final upcoming = [for (final s in sessions ?? const <ExamSession>[]) if (!s.resultsOut) s];
    final results = _results;
    return Scaffold(
      appBar: AppBar(title: Text(l.examsTitle)),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s8, Kx.s16, Kx.s32),
          children: [
            if (_error != null) ErrorBanner(_error!, onRetry: _load),
            if (sessions == null && _error == null) const KxLoading(),
            if (sessions != null) ...[
              SectionTitle(l.examTimetable),
              if (upcoming.isEmpty)
                KxCard(child: Text(l.noExamsScheduled, key: const Key('noExams'), style: context.text.bodyLarge))
              else
                for (final s in upcoming) ...[_SessionCard(session: s, onHallTicket: () => _hallTicket(s)), const SizedBox(height: Kx.s12)],
              SectionTitle(l.examResultsTitle),
              if (results == null || results.terms.isEmpty)
                KxCard(child: Text(l.noExamResults, key: const Key('noResults'), style: context.text.bodyLarge))
              else ...[
                if (results.cgpa != null) _CgpaCard(cgpa: results.cgpa!),
                const SizedBox(height: Kx.s12),
                for (final t in results.terms.reversed) ...[
                  _TermCard(term: t, session: sessions.where((s) => s.id == t.sessionId).firstOrNull, onRevalue: _revalue),
                  const SizedBox(height: Kx.s12),
                ],
              ],
            ],
          ],
        ),
      ),
    );
  }
}

class _SessionCard extends StatelessWidget {
  const _SessionCard({required this.session, required this.onHallTicket});

  final ExamSession session;
  final VoidCallback onHallTicket;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final fmt = context.fmt;
    final c = context.colors;
    final t = session.hallTicket;
    return KxCard(
      key: Key('exam-${session.id}'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(session.name, style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w600)),
          Text(l.examDates(fmt.date(session.startsOn), fmt.date(session.endsOn)), style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant)),
          const SizedBox(height: Kx.s8),
          for (final p in session.papers)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: Kx.s8),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  KxIconBox(Icons.event_note_outlined, tone: KxTone.primary, size: 40),
                  const SizedBox(width: Kx.s12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(p.subject, style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w600)),
                        Text('${fmt.shortDay(p.examDate)} · ${l.examPaperTime(fmt.clock(p.startsAt), fmt.clock(p.endsAt))}', style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant)),
                        Text(
                          [if (p.room != null) (p.seat != null ? l.examSeat(p.room!, p.seat!) : p.room!), l.examMaxMarks(p.maxMarks)].join(' · '),
                          style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          const Divider(height: Kx.s24),
          if (t == null)
            Text(l.hallTicketNotIssued, key: const Key('hallTicketNone'), style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant))
          else if (t.blocked)
            Row(
              key: const Key('hallTicketWithheld'),
              children: [
                Icon(Icons.block, color: c.error),
                const SizedBox(width: Kx.s12),
                Expanded(
                  child: Text(
                    t.blockedReason == null || t.blockedReason!.isEmpty ? l.hallTicketWithheldNoReason : l.hallTicketWithheld(t.blockedReason!),
                    style: context.text.bodyMedium?.copyWith(color: c.error),
                  ),
                ),
              ],
            )
          else
            SizedBox(
              width: double.infinity,
              child: FilledButton.tonalIcon(
                key: Key('hallTicket-${session.id}'),
                onPressed: onHallTicket,
                style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(Kx.target)),
                icon: const Icon(Icons.badge_outlined),
                label: Text(l.hallTicketDownload),
              ),
            ),
        ],
      ),
    );
  }
}

class _CgpaCard extends StatelessWidget {
  const _CgpaCard({required this.cgpa});

  final double cgpa;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return KxCard(
      color: c.primaryContainer,
      child: Row(
        children: [
          Icon(Icons.school_outlined, color: c.onPrimaryContainer),
          const SizedBox(width: Kx.s12),
          Expanded(
            child: Text(
              context.l10n.cgpaLine(cgpa.toStringAsFixed(2)),
              key: const Key('cgpa'),
              style: context.text.headlineSmall?.copyWith(color: c.onPrimaryContainer, fontWeight: FontWeight.w600),
            ),
          ),
        ],
      ),
    );
  }
}

class _TermCard extends StatelessWidget {
  const _TermCard({required this.term, required this.session, required this.onRevalue});

  final TermResult term;
  final ExamSession? session;
  final Future<void> Function(ExamSession, ResultLine, String subjectId) onRevalue;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final c = context.colors;
    final good = kxTone(context, KxTone.success);
    final bad = kxTone(context, KxTone.danger);
    return KxCard(
      key: Key('term-${term.sessionId}'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(child: Text(term.sessionName, style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w600))),
              Pill(term.passed ? l.resultPass : l.resultFail, background: term.passed ? good.bg : bad.bg, foreground: term.passed ? good.fg : bad.fg),
            ],
          ),
          const SizedBox(height: Kx.s4),
          Text(l.sgpaLine(term.sgpa.toStringAsFixed(2)), key: Key('sgpa-${term.sessionId}'), style: context.text.titleLarge?.copyWith(color: c.primary, fontWeight: FontWeight.w600)),
          const SizedBox(height: Kx.s8),
          for (final line in term.lines) _line(context, line),
        ],
      ),
    );
  }

  Widget _line(BuildContext context, ResultLine line) {
    final l = context.l10n;
    final c = context.colors;
    final s = session;
    final subjectId = s?.papers.where((p) => p.subject == line.subject).firstOrNull?.subjectId;
    final existing = subjectId == null ? null : s?.revaluationFor(subjectId);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: Kx.s4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(child: Text(line.subject, style: context.text.bodyLarge, maxLines: 2, overflow: TextOverflow.ellipsis)),
              const SizedBox(width: Kx.s8),
              Text(l.resultLine(line.percent.toStringAsFixed(line.percent == line.percent.roundToDouble() ? 0 : 1), line.grade),
                  style: context.text.labelLarge?.copyWith(color: line.passed ? c.onSurface : c.error)),
            ],
          ),
          if (existing != null)
            Padding(
              padding: const EdgeInsets.only(top: Kx.s4),
              child: Text(_status(l, existing.status), key: Key('reval-${existing.subjectId}'), style: context.text.bodySmall?.copyWith(color: c.primary)),
            )
          else if (s != null && s.canRequestRevaluation && subjectId != null)
            Align(
              alignment: AlignmentDirectional.centerStart,
              child: TextButton(
                key: Key('revalue-$subjectId'),
                style: TextButton.styleFrom(minimumSize: const Size(Kx.target, Kx.target), padding: EdgeInsets.zero),
                onPressed: () => onRevalue(s, line, subjectId),
                child: Text(l.revaluationRequest),
              ),
            ),
        ],
      ),
    );
  }

  static String _status(AppLocalizations l, RevaluationStatus s) => switch (s) {
    RevaluationStatus.requested => l.revaluationRequested,
    RevaluationStatus.accepted => l.revaluationAccepted,
    RevaluationStatus.rejected => l.revaluationRejected,
    RevaluationStatus.completed => l.revaluationCompleted,
  };
}

class _ReasonDialog extends StatefulWidget {
  const _ReasonDialog();

  @override
  State<_ReasonDialog> createState() => _ReasonDialogState();
}

class _ReasonDialogState extends State<_ReasonDialog> {
  final _controller = TextEditingController();
  bool _invalid = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return AlertDialog(
      title: Text(l.revaluationRequest),
      content: TextField(
        key: const Key('revalReason'),
        controller: _controller,
        autofocus: true,
        maxLines: 3,
        maxLength: 500,
        decoration: InputDecoration(labelText: l.revaluationWhy, errorText: _invalid ? l.revaluationNeedReason : null),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: Text(l.cancel)),
        FilledButton(
          key: const Key('revalSend'),
          onPressed: () {
            final text = _controller.text.trim();
            if (text.length < 3) return setState(() => _invalid = true);
            Navigator.pop(context, text);
          },
          child: Text(l.send),
        ),
      ],
    );
  }
}

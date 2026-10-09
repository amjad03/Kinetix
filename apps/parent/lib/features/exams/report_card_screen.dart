import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/files.dart';
import '../../core/growth.dart';
import '../../core/models.dart';
import '../../l10n/l10n.dart';
import '../../widgets/common.dart';

String _promotion(AppLocalizations l, String status) => switch (status) {
  'promoted' => l.promotionPromoted,
  'promoted_with_grace' => l.promotionGrace,
  'detained' => l.promotionDetained,
  _ => l.promotionPending,
};

String _num(double n) => n == n.roundToDouble() ? '${n.round()}' : n.toStringAsFixed(1);

/// A child's report cards, one per term, with the promotion decision.
class ReportCardsScreen extends StatefulWidget {
  const ReportCardsScreen({super.key, required this.api, required this.child, this.openFile = openWithSystem});

  final ParentApi api;
  final Child child;
  final OpenFile openFile;

  static Future<void> open(BuildContext context, ParentApi api, Child child) =>
      Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => ReportCardsScreen(api: api, child: child)));

  @override
  State<ReportCardsScreen> createState() => _ReportCardsScreenState();
}

class _ReportCardsScreenState extends State<ReportCardsScreen> {
  List<ReportCardRow>? _cards;
  ApiException? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final c = await widget.api.reportCards(widget.child.id);
      if (mounted) setState(() => _cards = c);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final cards = _cards;
    return Scaffold(
      appBar: AppBar(title: Text(l.reportCardsTitle)),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(Kx.s16),
          children: [
            Text(widget.child.fullName, style: context.text.titleMedium),
            if (_error != null) ErrorBanner(_error!, onRetry: _load),
            if (cards == null && _error == null) const KxLoading(),
            if (cards != null && cards.isEmpty) KxEmptyState(icon: Icons.workspace_premium_outlined, message: l.reportCardsNone),
            for (final c in cards ?? const <ReportCardRow>[])
              ListTile(
                key: Key('reportCard-${c.id}'),
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.description_outlined),
                title: Text(c.termLabel),
                subtitle: Text(_promotion(l, c.promotionStatus)),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => Navigator.of(context).push<void>(MaterialPageRoute(builder: (_) => ReportCardScreen(api: widget.api, id: c.id, openFile: widget.openFile))),
              ),
          ],
        ),
      ),
    );
  }
}

/// One report card: marks per subject, co-curricular grades, attendance, remarks and promotion; opens as a PDF too.
class ReportCardScreen extends StatefulWidget {
  const ReportCardScreen({super.key, required this.api, required this.id, this.openFile = openWithSystem});

  final ParentApi api;
  final String id;
  final OpenFile openFile;

  @override
  State<ReportCardScreen> createState() => _ReportCardScreenState();
}

class _ReportCardScreenState extends State<ReportCardScreen> {
  ReportCardDetail? _card;
  ApiException? _error;
  String? _message;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final c = await widget.api.reportCard(widget.id);
      if (mounted) setState(() => _card = c);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  Future<void> _pdf() async {
    final l = context.l10n;
    try {
      final bytes = await widget.api.reportCardPdf(widget.id);
      final ok = await widget.openFile(bytes, 'report-card.pdf', 'application/pdf');
      if (!ok && mounted) setState(() => _message = l.fileOpenFailed);
    } on ApiException catch (e) {
      if (mounted) setState(() => _message = context.errorText(e));
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final c = _card;
    return Scaffold(
      appBar: AppBar(title: Text(c?.termLabel ?? l.reportCardsTitle)),
      body: ListView(
        padding: const EdgeInsets.all(Kx.s16),
        children: [
          if (_error != null) ErrorBanner(_error!, onRetry: _load),
          if (c == null && _error == null) const KxLoading(),
          if (c != null) ...[
            Card(
              key: const Key('promotionCard'),
              child: ListTile(
                leading: const Icon(Icons.trending_up),
                title: Text(_promotion(l, c.promotionStatus)),
                subtitle: c.promotedTo == null ? null : Text('${l.promotedTo}: ${c.promotedTo}'),
              ),
            ),
            const SizedBox(height: Kx.s16),
            for (final line in c.lines)
              ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(line.subject),
                subtitle: line.remark.isEmpty ? null : Text(line.remark),
                trailing: Text('${_num(line.marks)}/${_num(line.maxMarks)}${line.grade.isEmpty ? '' : ' · ${line.grade}'}'),
              ),
            if (c.coCurricular.isNotEmpty) ...[
              const SizedBox(height: Kx.s8),
              Text(l.coCurricular, style: context.text.titleSmall),
              for (final g in c.coCurricular) Text('${g.activity}: ${g.grade}'),
            ],
            if (c.attendancePercent != null) Padding(padding: const EdgeInsets.only(top: Kx.s12), child: Text('${l.attendance}: ${_num(c.attendancePercent!)}%', key: const Key('reportAttendance'))),
            if (c.behaviourGrade != null) Text('${l.behaviour}: ${c.behaviourGrade}'),
            if (c.remarks.isNotEmpty) Padding(padding: const EdgeInsets.only(top: Kx.s12), child: Text(c.remarks)),
            if (_message != null) Padding(padding: const EdgeInsets.only(top: Kx.s12), child: Text(_message!)),
            const SizedBox(height: Kx.s16),
            OutlinedButton.icon(key: const Key('reportCardPdf'), onPressed: _pdf, icon: const Icon(Icons.picture_as_pdf_outlined), label: Text(l.reportCardPdf)),
          ],
        ],
      ),
    );
  }
}

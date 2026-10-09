import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/growth.dart';
import '../../l10n/l10n.dart';
import '../../widgets/common.dart';

/// Peer review of one homework: classmates' work to review (names hidden) and what classmates said about mine.
class PeerReviewScreen extends StatelessWidget {
  const PeerReviewScreen({super.key, required this.api, required this.homeworkId});

  final StudentApi api;
  final String homeworkId;

  static Future<void> open(BuildContext context, StudentApi api, String homeworkId) =>
      Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => PeerReviewScreen(api: api, homeworkId: homeworkId)));

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: AppBar(title: Text(l.peerTitle), bottom: TabBar(tabs: [Tab(text: l.peerToReview), Tab(text: l.peerMyFeedback)])),
        body: TabBarView(children: [_ToReview(api: api, homeworkId: homeworkId), _Feedback(api: api, homeworkId: homeworkId)]),
      ),
    );
  }
}

class _ToReview extends StatefulWidget {
  const _ToReview({required this.api, required this.homeworkId});

  final StudentApi api;
  final String homeworkId;

  @override
  State<_ToReview> createState() => _ToReviewState();
}

class _ToReviewState extends State<_ToReview> {
  List<PeerReviewTask>? _tasks;
  ApiException? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final t = await widget.api.peerReviewTasks(widget.homeworkId);
      if (mounted) setState(() => _tasks = t);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final tasks = _tasks;
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(Kx.s16),
        children: [
          if (_error != null) ErrorBanner(_error!, onRetry: _load),
          if (tasks == null && _error == null) const KxLoading(),
          if (tasks != null && tasks.isEmpty) KxEmptyState(icon: Icons.rate_review_outlined, message: l.peerNone),
          if (tasks != null && tasks.isNotEmpty) Padding(padding: const EdgeInsets.only(bottom: Kx.s12), child: Text(l.peerAnonymous)),
          for (final t in tasks ?? const <PeerReviewTask>[]) _TaskCard(key: ValueKey(t.id), api: widget.api, homeworkId: widget.homeworkId, task: t, onSaved: _load),
        ],
      ),
    );
  }
}

class _TaskCard extends StatefulWidget {
  const _TaskCard({super.key, required this.api, required this.homeworkId, required this.task, required this.onSaved});

  final StudentApi api;
  final String homeworkId;
  final PeerReviewTask task;
  final Future<void> Function() onSaved;

  @override
  State<_TaskCard> createState() => _TaskCardState();
}

class _TaskCardState extends State<_TaskCard> {
  late int? _clarity = widget.task.clarity;
  late int? _accuracy = widget.task.accuracy;
  late int? _effort = widget.task.effort;
  late final _comment = TextEditingController(text: widget.task.comment ?? '');
  bool _busy = false;
  String? _message;

  @override
  void dispose() {
    _comment.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final l = context.l10n;
    if (_clarity == null || _accuracy == null || _effort == null || _comment.text.trim().length < 3) {
      setState(() => _message = l.peerNeedAll);
      return;
    }
    setState(() {
      _busy = true;
      _message = null;
    });
    try {
      await widget.api.submitPeerReview(widget.homeworkId, widget.task.id, clarity: _clarity!, accuracy: _accuracy!, effort: _effort!, comment: _comment.text.trim());
      if (!mounted) return;
      setState(() => _message = l.peerSaved);
      await widget.onSaved();
    } on ApiException catch (e) {
      if (mounted) setState(() => _message = context.errorText(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Widget _scale(String id, String label, int? value, ValueChanged<int> onPick) => Padding(
    padding: const EdgeInsets.only(top: Kx.s8),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: context.text.labelLarge),
        Wrap(
          spacing: Kx.s8,
          children: [
            for (var n = 1; n <= 5; n++) ChoiceChip(key: Key('rubric-${widget.task.id}-$id-$n'), label: Text('$n'), selected: value == n, onSelected: (_) => setState(() => onPick(n))),
          ],
        ),
      ],
    ),
  );

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final t = widget.task;
    return Card(
      key: Key('peerTask-${t.id}'),
      margin: const EdgeInsets.only(bottom: Kx.s16),
      child: Padding(
        padding: const EdgeInsets.all(Kx.s16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('${l.peerWork} ${t.label}${t.done ? ' ✓' : ''}', style: context.text.titleMedium),
            const SizedBox(height: Kx.s8),
            Text(t.text.isEmpty ? l.peerNoText : t.text),
            if (t.fileCount > 0) Text('${l.peerFiles}: ${t.fileCount}'),
            _scale('clarity', l.peerClarity, _clarity, (n) => _clarity = n),
            _scale('accuracy', l.peerAccuracy, _accuracy, (n) => _accuracy = n),
            _scale('effort', l.peerEffort, _effort, (n) => _effort = n),
            const SizedBox(height: Kx.s8),
            TextField(key: Key('peerComment-${t.id}'), controller: _comment, maxLength: 500, decoration: InputDecoration(labelText: l.peerComment)),
            if (_message != null) Text(_message!, key: Key('peerMessage-${t.id}')),
            const SizedBox(height: Kx.s8),
            FilledButton(key: Key('peerSave-${t.id}'), onPressed: _busy ? null : _save, child: Text(l.peerSave)),
          ],
        ),
      ),
    );
  }
}

class _Feedback extends StatefulWidget {
  const _Feedback({required this.api, required this.homeworkId});

  final StudentApi api;
  final String homeworkId;

  @override
  State<_Feedback> createState() => _FeedbackState();
}

class _FeedbackState extends State<_Feedback> {
  PeerFeedback? _data;
  ApiException? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final d = await widget.api.peerFeedback(widget.homeworkId);
      if (mounted) setState(() => _data = d);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final d = _data;
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(Kx.s16),
        children: [
          if (_error != null) ErrorBanner(_error!, onRetry: _load),
          if (d == null && _error == null) const KxLoading(),
          if (d != null && d.reviews.isEmpty) KxEmptyState(icon: Icons.forum_outlined, message: l.peerNoFeedback),
          if (d != null && d.average != null) Text('${l.peerAverage}: ${d.average}', key: const Key('peerAverage'), style: context.text.titleMedium),
          if (d != null && d.pending > 0) Text('${l.peerPending}: ${d.pending}', key: const Key('peerPending')),
          for (final r in d?.reviews ?? const <({int clarity, int accuracy, int effort, int total, String comment})>[])
            Card(
              margin: const EdgeInsets.only(top: Kx.s12),
              child: ListTile(
                title: Text('${l.peerClarity} ${r.clarity} · ${l.peerAccuracy} ${r.accuracy} · ${l.peerEffort} ${r.effort}'),
                subtitle: Text(r.comment),
                trailing: Text('${r.total}/15'),
              ),
            ),
        ],
      ),
    );
  }
}

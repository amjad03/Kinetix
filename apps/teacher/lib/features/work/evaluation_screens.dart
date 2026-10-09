import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/growth_models.dart';
import '../../core/l10n.dart';
import '../../core/work_models.dart';
import '../../widgets/async_body.dart';
import '../../widgets/common.dart';

/// Scripts allocated to me for on-screen valuation (the examiner never sees the student's name).
class EvaluationScreen extends StatefulWidget {
  const EvaluationScreen({super.key, required this.api});

  final TeacherApi api;

  @override
  State<EvaluationScreen> createState() => _EvaluationScreenState();
}

class _EvaluationScreenState extends State<EvaluationScreen> {
  int _round = 0;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return Scaffold(
      appBar: AppBar(title: Text(l.evalTitle)),
      body: AsyncBody<List<EvalAllocation>>(
        key: ValueKey(_round),
        load: widget.api.evaluationAllocations,
        isEmpty: (rows) => rows.isEmpty,
        empty: l.evalEmpty,
        builder: (context, rows, reload) => ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          children: [
            for (final a in rows)
              ListTile(
                key: Key('script-${a.id}'),
                leading: Icon(a.submitted ? Icons.check_circle_outline : Icons.edit_note_outlined),
                title: Text('${a.subject} · ${l.evalScript(a.dummyNo)}'),
                subtitle: Text(
                  [a.session, l.evalRound('${a.round}'), if (a.submitted) l.evalStatusSubmitted else l.evalStatusTodo, if (a.total != null) l.evalTotal(numText(a.total!))].join(' · '),
                ),
                trailing: const Icon(Icons.chevron_right),
                onTap: () async {
                  await Navigator.of(context).push<void>(MaterialPageRoute(builder: (_) => EvaluationScriptScreen(api: widget.api, id: a.id)));
                  if (mounted) setState(() => _round++);
                },
              ),
          ],
        ),
      ),
    );
  }
}

/// One script: its scanned pages on top, then marks and a comment for each question.
class EvaluationScriptScreen extends StatefulWidget {
  const EvaluationScriptScreen({super.key, required this.api, required this.id});

  final TeacherApi api;
  final String id;

  @override
  State<EvaluationScriptScreen> createState() => _EvaluationScriptScreenState();
}

class _EvaluationScriptScreenState extends State<EvaluationScriptScreen> {
  EvalScript? _script;
  ApiException? _loadError;
  final _marks = <String, TextEditingController>{};
  final _comments = <String, TextEditingController>{};
  final _pages = <int, Future<Uint8List>>{};
  int _page = 0;
  List<EvalAnnotation> _mine = [];
  List<EvalAnnotation> _earlier = [];
  String _tool = 'tick';
  bool _busy = false;
  String? _error;
  String? _notice;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    for (final c in [..._marks.values, ..._comments.values]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final s = await widget.api.evaluationScript(widget.id);
      final marks = await widget.api.evaluationAnnotations(widget.id);
      if (!mounted) return;
      setState(() {
        _script = s;
        _mine = marks.mine;
        _earlier = marks.earlier;
        for (final q in s.questions) {
          final e = s.entries.where((e) => e.questionId == q.id).firstOrNull;
          _marks[q.id] = TextEditingController(text: e == null ? '' : numText(e.marks));
          _comments[q.id] = TextEditingController(text: e?.comment ?? '');
        }
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _loadError = e);
    }
  }

  Future<Uint8List> _pageBytes(int i) => _pages.putIfAbsent(i, () => widget.api.evaluationPage(widget.id, i));

  /// Puts the chosen mark at a tap on page [page]; a comment asks for its words first.
  Future<void> _mark(int page, Offset at) async {
    final l = context.l10n;
    String? text;
    if (_tool == 'comment') {
      final c = TextEditingController();
      text = await showDialog<String>(
        context: context,
        builder: (ctx) => AlertDialog(
          content: TextField(key: const Key('annotationText'), controller: c, autofocus: true, maxLength: 500, decoration: InputDecoration(labelText: l.evalCommentPrompt)),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: Text(l.cancel)),
            FilledButton(key: const Key('confirmAnnotation'), onPressed: () => Navigator.pop(ctx, c.text.trim()), child: Text(l.evalAddMark)),
          ],
        ),
      );
      if (text == null || text.isEmpty || !mounted) return;
    }
    try {
      final a = await widget.api.addEvaluationAnnotation(widget.id, pageIndex: page, kind: _tool, x: at.dx.clamp(0.0, 1.0), y: at.dy.clamp(0.0, 1.0), text: text);
      if (mounted) setState(() => _mine = [..._mine, a]);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = l.errorText(e));
    }
  }

  Future<void> _unmark(EvalAnnotation a) async {
    try {
      await widget.api.deleteEvaluationAnnotation(widget.id, a.id);
      if (mounted) setState(() => _mine = [for (final m in _mine) if (m.id != a.id) m]);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = context.l10n.errorText(e));
    }
  }

  /// A page with the marks drawn over it; marks sit at fractions of the page so they hold at any size.
  Widget _pageView(int i, Uint8List bytes, bool locked) {
    final marks = [..._earlier, ..._mine].where((a) => a.pageIndex == i);
    return Center(
      child: AspectRatio(
        aspectRatio: 0.707,
        child: LayoutBuilder(
          builder: (context, box) => Stack(
            children: [
              Positioned.fill(child: Image.memory(bytes, key: Key('page-$i'), fit: BoxFit.contain, errorBuilder: (_, _, _) => const Icon(Icons.broken_image_outlined))),
              Positioned.fill(
                child: GestureDetector(
                  key: Key('pageTap-$i'),
                  behavior: HitTestBehavior.opaque,
                  onTapUp: locked ? null : (d) => _mark(i, Offset(d.localPosition.dx / box.maxWidth, d.localPosition.dy / box.maxHeight)),
                ),
              ),
              for (final a in marks)
                Positioned(
                  left: a.x * box.maxWidth - 14,
                  top: a.y * box.maxHeight - 14,
                  child: GestureDetector(
                    key: Key('ann-${a.id}'),
                    onTap: locked || a.earlier ? null : () => _unmark(a),
                    child: Tooltip(
                      message: a.text ?? '',
                      child: Opacity(
                        opacity: a.earlier ? 0.45 : 1,
                        child: Icon(
                          switch (a.kind) {
                            'tick' => Icons.check,
                            'cross' => Icons.close,
                            _ => Icons.chat_bubble,
                          },
                          size: 28,
                          color: switch (a.kind) {
                            'tick' => Colors.green.shade700,
                            'cross' => Colors.red.shade700,
                            _ => Colors.blue.shade700,
                          },
                        ),
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  /// The entries as typed, or null (with the reason shown) when something is wrong.
  List<EvalEntry>? _entries({required bool requireAll}) {
    final l = context.l10n;
    final out = <EvalEntry>[];
    for (final q in _script!.questions) {
      final text = _marks[q.id]!.text.trim();
      if (text.isEmpty) {
        if (requireAll) {
          setState(() => _error = l.evalMissing);
          return null;
        }
        continue;
      }
      final m = double.tryParse(text);
      if (m == null || m < 0 || m > q.maxMarks) {
        setState(() => _error = '${l.evalQuestionLabel(q.no, numText(q.maxMarks))}: ${l.evalOverMax(numText(q.maxMarks))}');
        return null;
      }
      final c = _comments[q.id]!.text.trim();
      out.add(EvalEntry(questionId: q.id, marks: m, comment: c.isEmpty ? null : c));
    }
    if (out.isEmpty) {
      setState(() => _error = l.evalMissing);
      return null;
    }
    return out;
  }

  Future<bool> _save({required bool requireAll}) async {
    setState(() {
      _error = null;
      _notice = null;
    });
    final entries = _entries(requireAll: requireAll);
    if (entries == null) return false;
    setState(() => _busy = true);
    try {
      await widget.api.saveEvaluationMarks(widget.id, entries);
      return true;
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = context.l10n.errorText(e));
      return false;
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _submit() async {
    final l = context.l10n;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        content: Text(l.evalSubmitConfirm),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(l.cancel)),
          FilledButton(key: const Key('confirmSubmitEval'), onPressed: () => Navigator.pop(ctx, true), child: Text(l.evalSubmit)),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    if (!await _save(requireAll: true) || !mounted) return;
    setState(() => _busy = true);
    try {
      final r = await widget.api.submitEvaluation(widget.id);
      if (!mounted) return;
      setState(() => _notice = '${l.evalSubmittedMsg(numText(r.total))}${r.needsThird ? ' ${l.evalThirdNeeded}' : ''}');
      await _load();
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = l.errorText(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final s = _script;
    return Scaffold(
      appBar: AppBar(title: Text(s == null ? l.evalTitle : l.evalScript(s.dummyNo))),
      body: s == null
          ? Center(child: _loadError == null ? const CircularProgressIndicator() : Padding(padding: const EdgeInsets.all(Kx.s16), child: ErrorBanner.api(_loadError!, onRetry: _load)))
          : ListView(
              padding: const EdgeInsets.all(Kx.s16),
              children: [
                if (s.pageCount == 0)
                  Text(l.evalNoPages)
                else ...[
                  SizedBox(
                    height: 380,
                    child: PageView.builder(
                      key: const Key('pages'),
                      itemCount: s.pageCount,
                      onPageChanged: (i) => setState(() => _page = i),
                      itemBuilder: (context, i) => FutureBuilder<Uint8List>(
                        future: _pageBytes(i),
                        builder: (context, snap) => snap.hasData
                            ? InteractiveViewer(maxScale: 5, child: _pageView(i, snap.data!, s.submitted))
                            : snap.hasError
                            ? const Center(child: Icon(Icons.broken_image_outlined))
                            : const Center(child: CircularProgressIndicator()),
                      ),
                    ),
                  ),
                  Center(child: Text(l.evalPageLabel('${_page + 1}', '${s.pageCount}'), key: const Key('pageLabel'))),
                  if (!s.submitted)
                    Wrap(
                      spacing: Kx.s8,
                      crossAxisAlignment: WrapCrossAlignment.center,
                      children: [
                        for (final (kind, label) in [('tick', l.evalToolTick), ('cross', l.evalToolCross), ('comment', l.evalToolComment)])
                          ChoiceChip(key: Key('tool-$kind'), label: Text(label), selected: _tool == kind, onSelected: (_) => setState(() => _tool = kind)),
                        Text('${l.evalMarksOnPage}: ${_mine.length}', key: const Key('annotationCount')),
                      ],
                    ),
                  if (_earlier.isNotEmpty) Text(l.evalEarlierNote, key: const Key('earlierNote')),
                ],
                const SizedBox(height: Kx.s16),
                if (s.submitted) Text(l.evalLockedMsg, key: const Key('locked')),
                for (final q in s.questions) ...[
                  Text(l.evalQuestionLabel(q.no, numText(q.maxMarks)), style: context.text.titleSmall),
                  Row(
                    children: [
                      SizedBox(
                        width: 110,
                        child: TextField(
                          key: Key('marks-${q.id}'),
                          controller: _marks[q.id],
                          enabled: !s.submitted,
                          keyboardType: const TextInputType.numberWithOptions(decimal: true),
                          decoration: InputDecoration(labelText: l.evalMarksLabel),
                        ),
                      ),
                      const SizedBox(width: Kx.s12),
                      Expanded(
                        child: TextField(key: Key('comment-${q.id}'), controller: _comments[q.id], enabled: !s.submitted, maxLength: 500, decoration: InputDecoration(labelText: l.evalCommentLabel)),
                      ),
                    ],
                  ),
                ],
                if (_error != null) Padding(padding: const EdgeInsets.only(top: Kx.s12), child: ErrorBanner(_error!)),
                if (_notice != null) Padding(padding: const EdgeInsets.only(top: Kx.s12), child: Text(_notice!, key: const Key('evalNotice'))),
                if (!s.submitted) ...[
                  const SizedBox(height: Kx.s16),
                  OutlinedButton(
                    key: const Key('saveMarks'),
                    onPressed: _busy
                        ? null
                        : () async {
                            final messenger = ScaffoldMessenger.of(context);
                            if (await _save(requireAll: false)) messenger.showSnackBar(SnackBar(content: Text(l.evalSavedMsg)));
                          },
                    child: Text(l.evalSave),
                  ),
                  const SizedBox(height: Kx.s8),
                  FilledButton(key: const Key('submitEval'), onPressed: _busy ? null : _submit, child: Text(l.evalSubmit)),
                ],
              ],
            ),
    );
  }
}

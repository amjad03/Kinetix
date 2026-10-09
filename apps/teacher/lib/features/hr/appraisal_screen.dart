import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/growth_models.dart';
import '../../core/l10n.dart';
import '../../core/work_models.dart' show numText;
import '../../widgets/async_body.dart';
import '../../widgets/common.dart';

/// What the form needs: the categories, the cycle that is open (if any) and my form so far.
class _AppraisalData {
  const _AppraisalData(this.categories, this.cycle, this.mine);

  final List<AppraisalCategory> categories;
  final AppraisalCycle? cycle;
  final MyAppraisal? mine;
}

/// My self-appraisal for the open cycle: a score and evidence per category, saved as a draft or submitted.
class AppraisalScreen extends StatelessWidget {
  const AppraisalScreen({super.key, required this.api});

  final TeacherApi api;

  Future<_AppraisalData> _load() async {
    final cats = await api.appraisalCategories();
    final cycles = await api.appraisalCycles();
    final open = cycles.where((c) => c.open).firstOrNull;
    return _AppraisalData(cats, open, open == null ? null : await api.myAppraisal(open.id));
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return Scaffold(
      appBar: AppBar(title: Text(l.appraisalTitle)),
      body: AsyncBody<_AppraisalData>(
        load: _load,
        isEmpty: (d) => d.cycle == null,
        empty: l.appraisalNoCycle,
        builder: (context, d, reload) => _AppraisalForm(api: api, data: d),
      ),
    );
  }
}

class _AppraisalForm extends StatefulWidget {
  const _AppraisalForm({required this.api, required this.data});

  final TeacherApi api;
  final _AppraisalData data;

  @override
  State<_AppraisalForm> createState() => _AppraisalFormState();
}

class _AppraisalFormState extends State<_AppraisalForm> {
  final _score = <String, TextEditingController>{};
  final _evidence = <String, TextEditingController>{};
  late MyAppraisal? _mine = widget.data.mine;
  bool _busy = false;
  String? _error;
  String? _notice;

  @override
  void initState() {
    super.initState();
    for (final c in widget.data.categories) {
      final have = _mine?.scores[c.key];
      _score[c.key] = TextEditingController(text: have == null ? '' : numText(have.score));
      _evidence[c.key] = TextEditingController(text: have?.evidence ?? '');
    }
  }

  @override
  void dispose() {
    for (final c in [..._score.values, ..._evidence.values]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _send({required bool submit}) async {
    final l = context.l10n;
    final scores = <String, ({double score, String evidence})>{};
    for (final c in widget.data.categories) {
      final text = _score[c.key]!.text.trim();
      if (text.isEmpty) continue;
      final v = double.tryParse(text);
      if (v == null || v < 0 || v > c.max) {
        setState(() => _error = '${c.label}: ${l.appraisalOverMax(numText(c.max))}');
        return;
      }
      scores[c.key] = (score: v, evidence: _evidence[c.key]!.text.trim());
    }
    if (scores.isEmpty) {
      setState(() => _error = l.appraisalNeedScore);
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
      _notice = null;
    });
    try {
      final saved = await widget.api.saveSelfAppraisal(widget.data.cycle!.id, scores, submit: submit);
      if (mounted) {
        setState(() {
          _mine = saved;
          _notice = submit ? l.appraisalSubmitted : l.appraisalSaved;
        });
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = l.errorText(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final locked = _mine?.locked ?? false;
    final cycle = widget.data.cycle!;
    return ListView(
      padding: const EdgeInsets.all(Kx.s16),
      children: [
        Text('${l.appraisalCycle}: ${cycle.period} (${cycle.opensOn} – ${cycle.closesOn})', style: context.text.titleSmall),
        if (locked) Padding(padding: const EdgeInsets.only(top: Kx.s8), child: Text(l.appraisalLocked, key: const Key('appraisalLocked'))),
        if (_mine != null) Padding(padding: const EdgeInsets.only(top: Kx.s4), child: Text('${l.appraisalSelfPercent}: ${numText(_mine!.selfPercent)}%', key: const Key('selfPercent'))),
        for (final c in widget.data.categories) ...[
          const SizedBox(height: Kx.s16),
          Text('${c.label} (${l.appraisalMax} ${numText(c.max)})', style: context.text.titleSmall),
          Row(
            children: [
              SizedBox(
                width: 110,
                child: TextField(
                  key: Key('score-${c.key}'),
                  controller: _score[c.key],
                  enabled: !locked,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  decoration: InputDecoration(labelText: l.appraisalScore),
                ),
              ),
              const SizedBox(width: Kx.s12),
              Expanded(
                child: TextField(key: Key('evidence-${c.key}'), controller: _evidence[c.key], enabled: !locked, maxLength: 500, decoration: InputDecoration(labelText: l.appraisalEvidence)),
              ),
            ],
          ),
        ],
        if (_error != null) Padding(padding: const EdgeInsets.only(top: Kx.s12), child: ErrorBanner(_error!)),
        if (_notice != null) Padding(padding: const EdgeInsets.only(top: Kx.s12), child: Text(_notice!, key: const Key('appraisalNotice'))),
        if (!locked) ...[
          const SizedBox(height: Kx.s16),
          OutlinedButton(key: const Key('saveAppraisal'), onPressed: _busy ? null : () => _send(submit: false), child: Text(l.appraisalSaveDraft)),
          const SizedBox(height: Kx.s8),
          FilledButton(key: const Key('submitAppraisal'), onPressed: _busy ? null : () => _send(submit: true), child: Text(l.appraisalSubmit)),
        ],
      ],
    );
  }
}

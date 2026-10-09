import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/pathways.dart';
import '../../l10n/l10n.dart';
import '../../widgets/common.dart';
import '../../widgets/load_view.dart';
import 'aptitude.dart';
import 'mock_interview.dart';

/// Career preparation: resume, aptitude tests, mock interviews and communication practice,
/// career recommendations with skill gaps, and the AI career assistant.
class CareerPrepScreen extends StatelessWidget {
  const CareerPrepScreen({super.key, required this.api});

  final StudentApi api;

  static Future<void> open(BuildContext context, StudentApi api) => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => CareerPrepScreen(api: api)));

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    void go(Widget screen) => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => screen));
    Widget tile(String key, IconData icon, String title, String sub, Widget Function() screen) => ListTile(
      key: Key(key),
      minTileHeight: 64,
      leading: Icon(icon),
      title: Text(title),
      subtitle: Text(sub),
      trailing: const Icon(Icons.chevron_right),
      onTap: () => go(screen()),
    );
    return Scaffold(
      appBar: AppBar(title: Text(l.prepTitle)),
      body: ListView(
        children: [
          tile('prepResume', Icons.description_outlined, l.prepResume, l.prepResumeSub, () => ResumeScreen(api: api)),
          tile('prepTests', Icons.quiz_outlined, l.prepTests, l.prepTestsSub, () => AptitudeTestsScreen(api: api)),
          tile('prepHr', Icons.record_voice_over_outlined, l.prepMockHr, l.prepMockHrSub, () => MockInterviewScreen(api: api, kind: 'hr')),
          tile('prepTechnical', Icons.code, l.prepMockTechnical, l.prepMockTechnicalSub, () => MockInterviewScreen(api: api, kind: 'technical')),
          tile('prepCommunication', Icons.forum_outlined, l.prepCommunication, l.prepCommunicationSub, () => MockInterviewScreen(api: api, kind: 'communication')),
          tile('prepRecs', Icons.route_outlined, l.prepRecs, l.prepRecsSub, () => RecommendationsScreen(api: api)),
          tile('prepAssistant', Icons.auto_awesome_outlined, l.prepAssistant, l.prepAssistantSub, () => AssistantScreen(api: api)),
        ],
      ),
    );
  }
}

// ── Resume ──────────────────────────────────────────────────────────────────────────────────────

typedef _Field = ({String key, String label, bool required, bool multiline});

class ResumeScreen extends StatefulWidget {
  const ResumeScreen({super.key, required this.api});

  final StudentApi api;

  @override
  State<ResumeScreen> createState() => _ResumeScreenState();
}

class _ResumeScreenState extends State<ResumeScreen> {
  Resume? _resume;
  Object? _error;
  bool _saving = false;
  final _headline = TextEditingController();
  final _summary = TextEditingController();
  final _skills = TextEditingController();
  final _interests = TextEditingController();

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    for (final c in [_headline, _summary, _skills, _interests]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final r = await widget.api.resume();
      if (!mounted) return;
      setState(() {
        _resume = r;
        _error = null;
        _headline.text = r.headline;
        _summary.text = r.summary;
        _skills.text = r.skills.join(', ');
        _interests.text = r.interests.join(', ');
      });
    } catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  Future<void> _save() async {
    final r = _resume!;
    r
      ..headline = _headline.text
      ..summary = _summary.text
      ..skills.replaceRange(0, r.skills.length, Resume.words(_skills.text))
      ..interests.replaceRange(0, r.interests.length, Resume.words(_interests.text));
    setState(() => _saving = true);
    await attempt(context, () => widget.api.saveResume(r), done: context.l10n.rsSaved);
    if (mounted) setState(() => _saving = false);
  }

  /// A section of entries (education, experience, projects or links) with add and remove.
  List<Widget> _section(String title, List<Map<String, String>> entries, List<_Field> fields, String Function(Map<String, String>) line, String keyName) {
    final l = context.l10n;
    return [
      Row(children: [Expanded(child: Heading(title)), TextButton.icon(key: Key('add-$keyName'), onPressed: () => _addEntry(title, entries, fields), icon: const Icon(Icons.add), label: Text(l.rsAdd))]),
      for (var i = 0; i < entries.length; i++)
        ListTile(
          key: Key('$keyName-$i'),
          contentPadding: EdgeInsets.zero,
          title: Text(line(entries[i])),
          trailing: IconButton(tooltip: l.pjDelete, icon: const Icon(Icons.delete_outline), onPressed: () => setState(() => entries.removeAt(i))),
        ),
    ];
  }

  Future<void> _addEntry(String title, List<Map<String, String>> entries, List<_Field> fields) async {
    final l = context.l10n;
    final values = await askFields(
      context,
      title: title,
      fields: [for (final f in fields) FieldSpec('field-${f.key}', f.label, multiline: f.multiline)],
      confirmLabel: l.save,
      confirmKey: 'saveEntry',
    );
    if (values == null || !mounted) return;
    final entry = {for (final f in fields) f.key: values['field-${f.key}']!};
    final missing = fields.any((f) => f.required && entry[f.key]!.isEmpty);
    final badUrl = fields.any((f) => f.key == 'url' && entry['url']!.isNotEmpty && !(Uri.tryParse(entry['url']!)?.hasScheme ?? false));
    if (missing || badUrl) return say(context, l.rsEntryIncomplete);
    setState(() => entries.add(entry));
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final r = _resume;
    final fieldsEdu = <_Field>[
      (key: 'institution', label: l.rsInstitution, required: true, multiline: false),
      (key: 'degree', label: l.rsDegree, required: true, multiline: false),
      (key: 'years', label: l.rsYears, required: false, multiline: false),
      (key: 'score', label: l.rsScore, required: false, multiline: false),
    ];
    final fieldsExp = <_Field>[
      (key: 'org', label: l.rsOrg, required: true, multiline: false),
      (key: 'role', label: l.rsRole, required: true, multiline: false),
      (key: 'years', label: l.rsYears, required: false, multiline: false),
      (key: 'detail', label: l.rsDetail, required: false, multiline: true),
    ];
    final fieldsPrj = <_Field>[
      (key: 'title', label: l.pjFieldTitle, required: true, multiline: false),
      (key: 'detail', label: l.rsDetail, required: false, multiline: true),
      (key: 'url', label: l.pjFieldLink, required: false, multiline: false),
    ];
    final fieldsLink = <_Field>[
      (key: 'label', label: l.rsLabel, required: true, multiline: false),
      (key: 'url', label: l.pjFieldLink, required: true, multiline: false),
    ];
    return Scaffold(
      appBar: AppBar(title: Text(l.prepResume), actions: [if (r != null) TextButton(key: const Key('saveResume'), onPressed: _saving ? null : _save, child: Text(l.save))]),
      body: r == null
          ? (_error == null ? const KxLoading() : Padding(padding: const EdgeInsets.all(Kx.s16), child: ErrorBanner(_error!, onRetry: _load)))
          : ListView(
              padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s8, Kx.s16, Kx.s32),
              children: [
                TextField(key: const Key('rsHeadline'), controller: _headline, maxLength: 160, decoration: InputDecoration(labelText: l.rsHeadline)),
                TextField(key: const Key('rsSummary'), controller: _summary, minLines: 2, maxLines: 5, maxLength: 1500, decoration: InputDecoration(labelText: l.rsSummary)),
                TextField(key: const Key('rsSkills'), controller: _skills, decoration: InputDecoration(labelText: l.rsSkills, helperText: l.rsCommaHelp)),
                const SizedBox(height: Kx.s12),
                TextField(key: const Key('rsInterests'), controller: _interests, decoration: InputDecoration(labelText: l.rsInterests, helperText: l.rsCommaHelp)),
                ..._section(l.rsEducation, r.education, fieldsEdu, (e) => [e['degree'] ?? '', e['institution'] ?? '', e['years'] ?? ''].where((s) => s.isNotEmpty).join(' · '), 'edu'),
                ..._section(l.rsExperience, r.experience, fieldsExp, (e) => [e['role'] ?? '', e['org'] ?? '', e['years'] ?? ''].where((s) => s.isNotEmpty).join(' · '), 'exp'),
                ..._section(l.rsProjects, r.projects, fieldsPrj, (e) => e['title'] ?? '', 'prj'),
                ..._section(l.rsLinks, r.links, fieldsLink, (e) => '${e['label'] ?? ''}: ${e['url'] ?? ''}', 'link'),
                const SizedBox(height: Kx.s8),
                SwitchListTile(
                  key: const Key('rsVisible'),
                  contentPadding: EdgeInsets.zero,
                  title: Text(l.rsVisible),
                  subtitle: Text(l.rsVisibleHelp),
                  value: r.visibleToRecruiters,
                  onChanged: (v) => setState(() => r.visibleToRecruiters = v),
                ),
              ],
            ),
    );
  }
}

// ── Recommendations ─────────────────────────────────────────────────────────────────────────────

class RecommendationsScreen extends StatelessWidget {
  const RecommendationsScreen({super.key, required this.api});

  final StudentApi api;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return LoadScreen<CareerRecommendations>(
      title: l.prepRecs,
      load: api.careerRecommendations,
      builder: (context, r, reload) {
        final c = context.colors;
        return [
          if (r.skills.isNotEmpty) Text(l.recSkills(r.skills.join(', ')), style: context.text.bodyMedium),
          if (r.interests.isNotEmpty) Text(l.recInterests(r.interests.join(', ')), style: context.text.bodyMedium),
          if (r.paths.isEmpty) EmptyNote(l.recNone),
          for (final p in r.paths)
            KxCard(
              key: Key('path-${p.pathId}'),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(child: Text(p.title, style: context.text.titleSmall)),
                      Pill(l.recFit(p.fit.round()), background: kxTone(context, p.fit >= 50 ? KxTone.success : KxTone.neutral).bg, foreground: kxTone(context, p.fit >= 50 ? KxTone.success : KxTone.neutral).fg),
                    ],
                  ),
                  if (p.family.isNotEmpty) Text(p.family, style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant)),
                  Padding(padding: const EdgeInsets.symmetric(vertical: Kx.s8), child: LinearProgressIndicator(value: (p.fit / 100).clamp(0, 1))),
                  if (p.matched.isNotEmpty) Text(l.recMatched(p.matched.join(', ')), key: Key('matched-${p.pathId}')),
                  if (p.gaps.isNotEmpty) Padding(padding: const EdgeInsets.only(top: Kx.s4), child: Text(l.recGaps(p.gaps.join(', ')), key: Key('gaps-${p.pathId}'), style: TextStyle(color: c.error))),
                  if (r.pathOf(p.pathId) case final path?) ...[
                    if (path.description.isNotEmpty) Padding(padding: const EdgeInsets.only(top: Kx.s8), child: Text(path.description)),
                    if (path.roles.isNotEmpty) Padding(padding: const EdgeInsets.only(top: Kx.s4), child: Text(l.recRoles(path.roles.join(', ')))),
                    for (var i = 0; i < path.steps.length; i++)
                      Padding(padding: const EdgeInsets.only(top: Kx.s4), child: Text('${i + 1}. ${path.steps[i].title}${path.steps[i].detail.isEmpty ? '' : ': ${path.steps[i].detail}'}', style: context.text.bodyMedium)),
                  ],
                ],
              ),
            ),
        ];
      },
    );
  }
}

// ── Career assistant ────────────────────────────────────────────────────────────────────────────

class AssistantScreen extends StatefulWidget {
  const AssistantScreen({super.key, required this.api});

  final StudentApi api;

  @override
  State<AssistantScreen> createState() => _AssistantScreenState();
}

class _AssistantScreenState extends State<AssistantScreen> {
  List<AssistantMessage>? _messages;
  Object? _error;
  bool _asking = false;
  final _input = TextEditingController();

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _input.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final m = await widget.api.careerAssistantHistory();
      if (mounted) {
        setState(() {
          _messages = m;
          _error = null;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  Future<void> _ask([String? preset]) async {
    final q = (preset ?? _input.text).trim();
    if (q.length < 3 || _asking) return;
    final lang = context.l10n.localeName;
    setState(() {
      _asking = true;
      _messages = [...?_messages, AssistantMessage(role: 'user', body: q)];
      _input.clear();
    });
    try {
      final r = await widget.api.askCareerAssistant(q, lang);
      if (mounted) setState(() => _messages = [...?_messages, AssistantMessage(role: 'assistant', body: r.answer, aiUsed: r.aiUsed, suggestions: r.suggestions)]);
    } on ApiException catch (e) {
      if (mounted) say(context, context.errorText(e));
    } finally {
      if (mounted) setState(() => _asking = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final m = _messages;
    final c = context.colors;
    return Scaffold(
      appBar: AppBar(title: Text(l.prepAssistant)),
      body: m == null
          ? (_error == null ? const KxLoading() : Padding(padding: const EdgeInsets.all(Kx.s16), child: ErrorBanner(_error!, onRetry: _load)))
          : Column(
              children: [
                Expanded(
                  child: ListView(
                    reverse: true,
                    padding: const EdgeInsets.all(Kx.s16),
                    children: [
                      for (final x in m.reversed)
                        Align(
                          alignment: x.mine ? Alignment.centerRight : Alignment.centerLeft,
                          child: Container(
                            key: Key(x.mine ? 'ask-bubble' : 'answer-bubble'),
                            margin: const EdgeInsets.only(bottom: Kx.s8),
                            padding: const EdgeInsets.all(Kx.s12),
                            constraints: BoxConstraints(maxWidth: MediaQuery.sizeOf(context).width * 0.85),
                            decoration: BoxDecoration(color: x.mine ? c.primaryContainer : c.surfaceContainerHighest, borderRadius: Kx.radiusMd),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(x.body),
                                for (final s in x.suggestions) Padding(padding: const EdgeInsets.only(top: Kx.s4), child: Text('• $s', style: context.text.bodyMedium)),
                                if (!x.mine && x.aiUsed == false) Padding(padding: const EdgeInsets.only(top: Kx.s4), child: Text(l.assistantOffline, key: const Key('offlineGuidance'), style: context.text.labelSmall?.copyWith(color: c.onSurfaceVariant))),
                              ],
                            ),
                          ),
                        ),
                      if (m.isEmpty) Wrap(spacing: Kx.s8, children: [for (final q in [l.assistantTry1, l.assistantTry2]) ActionChip(label: Text(q), onPressed: () => _ask(q))]),
                      if (m.isEmpty) EmptyNote(l.assistantIntro),
                    ],
                  ),
                ),
                if (_asking) const LinearProgressIndicator(),
                SafeArea(
                  top: false,
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s4, Kx.s8, Kx.s8),
                    child: Row(
                      children: [
                        Expanded(child: TextField(key: const Key('assistantInput'), controller: _input, minLines: 1, maxLines: 3, maxLength: 600, onSubmitted: (_) => _ask(), decoration: InputDecoration(hintText: l.assistantHint, counterText: ''))),
                        IconButton.filled(key: const Key('assistantSend'), onPressed: _asking ? null : _ask, icon: const Icon(Icons.send), tooltip: l.send),
                      ],
                    ),
                  ),
                ),
              ],
            ),
    );
  }
}

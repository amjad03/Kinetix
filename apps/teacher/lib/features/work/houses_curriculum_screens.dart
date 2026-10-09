import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/growth_models.dart';
import '../../core/l10n.dart';
import '../../widgets/async_body.dart';
import '../../widgets/common.dart';

const _houseCategories = ['general', 'academics', 'sports', 'arts', 'discipline', 'service'];

String _categoryLabel(AppLocalizations l, String c) => switch (c) {
  'academics' => l.houseCatAcademics,
  'sports' => l.houseCatSports,
  'arts' => l.houseCatArts,
  'discipline' => l.houseCatDiscipline,
  'service' => l.houseCatService,
  _ => l.houseCatGeneral,
};

/// The houses ranked by points; tap one to award or deduct points.
class HousesScreen extends StatefulWidget {
  const HousesScreen({super.key, required this.api});

  final TeacherApi api;

  @override
  State<HousesScreen> createState() => _HousesScreenState();
}

class _HousesScreenState extends State<HousesScreen> {
  int _round = 0;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return Scaffold(
      appBar: AppBar(title: Text(l.housesTitle)),
      body: AsyncBody<List<HouseRow>>(
        key: ValueKey(_round),
        load: widget.api.houses,
        isEmpty: (rows) => rows.isEmpty,
        empty: l.housesEmpty,
        builder: (context, rows, reload) => ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          children: [
            for (final h in rows)
              ListTile(
                key: Key('house-${h.id}'),
                leading: CircleAvatar(child: Text('${h.rank}')),
                title: Text(h.name),
                subtitle: Text('${h.members} ${l.housesMembers}${h.motto.isEmpty ? '' : ' · ${h.motto}'}'),
                trailing: Text('${h.points}', style: context.text.titleMedium),
                onTap: () async {
                  await Navigator.of(context).push<void>(MaterialPageRoute(builder: (_) => AwardPointsScreen(api: widget.api, house: h)));
                  if (mounted) setState(() => _round++);
                },
              ),
          ],
        ),
      ),
    );
  }
}

/// Awards points to a whole house or to one of its students, with a reason and a category.
class AwardPointsScreen extends StatefulWidget {
  const AwardPointsScreen({super.key, required this.api, required this.house});

  final TeacherApi api;
  final HouseRow house;

  @override
  State<AwardPointsScreen> createState() => _AwardPointsScreenState();
}

class _AwardPointsScreenState extends State<AwardPointsScreen> {
  final _points = TextEditingController();
  final _reason = TextEditingController();
  String _category = 'general';
  String? _student;
  bool _busy = false;
  String? _error;
  String? _notice;
  late final Future<List<HouseMember>> _members = widget.api.houseMembers(widget.house.id);

  @override
  void dispose() {
    _points.dispose();
    _reason.dispose();
    super.dispose();
  }

  Future<void> _award() async {
    final l = context.l10n;
    final n = int.tryParse(_points.text.trim());
    if (n == null || n == 0 || n < -100 || n > 100) {
      setState(() => _error = l.housePointsRange);
      return;
    }
    if (_reason.text.trim().length < 3) {
      setState(() => _error = l.houseReasonNeeded);
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
      _notice = null;
    });
    try {
      await widget.api.awardHousePoints(widget.house.id, points: n, reason: _reason.text.trim(), category: _category, studentId: _student);
      if (mounted) {
        setState(() => _notice = l.housePointsSaved);
        _points.clear();
        _reason.clear();
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
    return Scaffold(
      appBar: AppBar(title: Text(widget.house.name)),
      body: ListView(
        padding: const EdgeInsets.all(Kx.s16),
        children: [
          FutureBuilder<List<HouseMember>>(
            future: _members,
            builder: (context, snap) => DropdownButtonFormField<String?>(
              key: const Key('houseStudent'),
              initialValue: _student,
              decoration: InputDecoration(labelText: l.houseStudent),
              items: [
                DropdownMenuItem<String?>(value: null, child: Text(l.houseWholeHouse)),
                for (final m in snap.data ?? const <HouseMember>[]) DropdownMenuItem<String?>(value: m.studentId, child: Text(m.name)),
              ],
              onChanged: (v) => setState(() => _student = v),
            ),
          ),
          const SizedBox(height: Kx.s12),
          TextField(key: const Key('housePoints'), controller: _points, keyboardType: const TextInputType.numberWithOptions(signed: true), decoration: InputDecoration(labelText: l.housePoints)),
          const SizedBox(height: Kx.s12),
          DropdownButtonFormField<String>(
            key: const Key('houseCategory'),
            initialValue: _category,
            decoration: InputDecoration(labelText: l.houseCategory),
            items: [for (final c in _houseCategories) DropdownMenuItem(value: c, child: Text(_categoryLabel(l, c)))],
            onChanged: (v) => setState(() => _category = v ?? 'general'),
          ),
          const SizedBox(height: Kx.s12),
          TextField(key: const Key('houseReason'), controller: _reason, maxLength: 200, decoration: InputDecoration(labelText: l.houseReason)),
          if (_error != null) Padding(padding: const EdgeInsets.only(top: Kx.s12), child: ErrorBanner(_error!)),
          if (_notice != null) Padding(padding: const EdgeInsets.only(top: Kx.s12), child: Text(_notice!, key: const Key('houseNotice'))),
          const SizedBox(height: Kx.s16),
          FilledButton(key: const Key('awardPoints'), onPressed: _busy ? null : _award, child: Text(l.houseAward)),
        ],
      ),
    );
  }
}

/// The active curriculum versions; open one to read its subjects, units and course outcomes.
class CurriculumScreen extends StatelessWidget {
  const CurriculumScreen({super.key, required this.api});

  final TeacherApi api;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return Scaffold(
      appBar: AppBar(title: Text(l.curriculumTitle)),
      body: AsyncBody<List<CurriculumVersionRow>>(
        load: () async => [for (final v in await api.curriculumVersions()) if (v.status == 'active') v],
        isEmpty: (rows) => rows.isEmpty,
        empty: l.curriculumEmpty,
        builder: (context, rows, reload) => ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          children: [
            for (final v in rows)
              ListTile(
                key: Key('curriculum-${v.id}'),
                leading: const Icon(Icons.menu_book_outlined),
                title: Text(v.label),
                subtitle: Text('${v.programName} · ${v.regulationYear}'),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => Navigator.of(context).push<void>(MaterialPageRoute(builder: (_) => CurriculumDetailScreen(api: api, version: v))),
              ),
          ],
        ),
      ),
    );
  }
}

class CurriculumDetailScreen extends StatelessWidget {
  const CurriculumDetailScreen({super.key, required this.api, required this.version});

  final TeacherApi api;
  final CurriculumVersionRow version;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return Scaffold(
      appBar: AppBar(title: Text(version.label)),
      body: AsyncBody<CurriculumDetail>(
        load: () => api.curriculumVersion(version.id),
        isEmpty: (d) => d.subjects.isEmpty,
        empty: l.curriculumNoSubjects,
        builder: (context, d, reload) => ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          children: [
            for (final s in d.subjects)
              ExpansionTile(
                key: Key('subject-${s.code}'),
                title: Text('${s.code} · ${s.name}'),
                subtitle: s.term.isEmpty ? null : Text(s.term),
                childrenPadding: const EdgeInsets.symmetric(horizontal: Kx.s16),
                expandedCrossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (s.units.isNotEmpty) Text(l.curriculumUnits, style: context.text.titleSmall),
                  for (final (i, u) in s.units.indexed) Padding(padding: const EdgeInsets.only(top: Kx.s4), child: Text('${i + 1}. ${u.title}${u.topics.isEmpty ? '' : ' — ${u.topics.join(', ')}'}')),
                  if (s.cos.isNotEmpty) Padding(padding: const EdgeInsets.only(top: Kx.s12), child: Text(l.curriculumOutcomes, style: context.text.titleSmall)),
                  for (final c in s.cos) Padding(padding: const EdgeInsets.only(top: Kx.s4), child: Text('${c.code}: ${c.statement}')),
                  const SizedBox(height: Kx.s12),
                ],
              ),
          ],
        ),
      ),
    );
  }
}

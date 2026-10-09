import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/academics_models.dart';
import '../../core/api.dart';
import '../../core/course_file_models.dart';
import '../../core/l10n.dart';
import '../../core/work_models.dart' show numText;
import '../../widgets/async_body.dart';
import '../../widgets/common.dart';

String coSetStatusText(AppLocalizations l, String status) => switch (status) {
  'active' => l.obeStatusActive,
  'retired' => l.obeStatusRetired,
  _ => l.obeStatusDraft,
};

/// The subjects I teach (one row each, whatever the class); open one for its course outcomes, the CO-PO matrix and attainment.
class OutcomesScreen extends StatelessWidget {
  const OutcomesScreen({super.key, required this.api, required this.roles});

  final TeacherApi api;

  /// The signed-in user's roles: attainment is shown only to those the API allows.
  final List<String> roles;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return Scaffold(
      appBar: AppBar(title: Text(l.obeTitle)),
      body: AsyncBody<List<CourseFileOption>>(
        load: () async {
          final seen = <String>{};
          return [for (final o in await api.courseFileOptions()) if (seen.add(o.subjectId)) o];
        },
        isEmpty: (rows) => rows.isEmpty,
        empty: l.obeSubjectsEmpty,
        builder: (context, rows, reload) => ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          children: [
            for (final o in rows)
              ListTile(
                key: Key('obeSubject-${o.subjectId}'),
                leading: const Icon(Icons.track_changes_outlined),
                title: Text(o.subject),
                subtitle: o.code.isEmpty ? null : Text(o.code),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => Navigator.of(context).push<void>(
                  MaterialPageRoute(builder: (_) => SubjectOutcomesScreen(api: api, subjectId: o.subjectId, title: o.subject, canSeeAttainment: hasAnyRole(roles, attainmentRoles))),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _OutcomeData {
  const _OutcomeData({this.set, this.matrix, this.attainment, this.hasYear = true});

  final CoSet? set;
  final CoMatrix? matrix;

  /// Null when it could not be read (no permission, not calculated).
  final List<CoAttainment>? attainment;
  final bool hasYear;
}

/// One subject: its course outcomes, the CO-PO matrix above the attainment per CO.
class SubjectOutcomesScreen extends StatelessWidget {
  const SubjectOutcomesScreen({super.key, required this.api, required this.subjectId, required this.title, required this.canSeeAttainment});

  final TeacherApi api;
  final String subjectId, title;
  final bool canSeeAttainment;

  Future<_OutcomeData> _load() async {
    final set = CoSet.current(await api.coSets(subjectId));
    if (set == null) return const _OutcomeData();
    final matrix = await api.coMatrix(set.id);
    List<CoAttainment>? attainment;
    var hasYear = true;
    final programId = matrix.programId;
    if (canSeeAttainment && programId != null) {
      final year = await api.currentAcademicYearId();
      if (year == null) {
        hasYear = false;
      } else {
        try {
          final ids = {for (final co in set.outcomes) co.id};
          attainment = [for (final a in await api.coAttainment(programId: programId, academicYearId: year)) if (ids.contains(a.targetId)) a];
        } on ApiException catch (e) {
          // Not allowed here after all, or no figures yet: the rest of the page still reads.
          if (e.status != 403 && e.status != 404) rethrow;
        }
      }
    }
    return _OutcomeData(set: set, matrix: matrix, attainment: attainment, hasYear: hasYear);
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: AsyncBody<_OutcomeData>(
        load: _load,
        isEmpty: (d) => d.set == null,
        empty: l.obeNoOutcomes,
        builder: (context, d, reload) {
          final set = d.set!;
          final matrix = d.matrix!;
          return ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.only(bottom: Kx.s32),
            children: [
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: Kx.s16),
                child: Text('${l.obeVersion('${set.version}')} · ${coSetStatusText(l, set.status)}', key: const Key('coSetHeader'), style: context.text.titleSmall),
              ),
              KxSectionHeader(l.curriculumOutcomes),
              for (final co in set.outcomes)
                ListTile(
                  key: Key('co-${co.code}'),
                  dense: true,
                  leading: CircleAvatar(radius: 18, child: Text(co.code.replaceFirst(RegExp('^CO', caseSensitive: false), ''), style: context.text.labelMedium)),
                  title: Text(co.statement),
                  subtitle: (co.bloomLevel ?? '').isEmpty ? null : Text(co.bloomLevel!),
                ),
              KxSectionHeader(l.obeMatrixHeader),
              _Matrix(l: l, matrix: matrix),
              KxSectionHeader(l.obeAttainmentHeader),
              if (!canSeeAttainment)
                _Note(l.obeAttainmentRestricted, const Key('attainmentRestricted'))
              else if (d.attainment == null || d.attainment!.isEmpty || !d.hasYear)
                _Note(l.obeAttainmentNone, const Key('attainmentNone'))
              else
                for (final a in d.attainment!) _AttainmentTile(l: l, row: a),
            ],
          );
        },
      ),
    );
  }
}

class _Note extends StatelessWidget {
  const _Note(this.text, this.noteKey);

  final String text;
  final Key noteKey;

  @override
  Widget build(BuildContext context) => Padding(padding: const EdgeInsets.symmetric(horizontal: Kx.s16), child: Text(text, key: noteKey));
}

/// The CO x PO/PSO grid: strength 1 (low) to 3 (high), shaded so a glance shows where a course contributes.
class _Matrix extends StatelessWidget {
  const _Matrix({required this.l, required this.matrix});

  final AppLocalizations l;
  final CoMatrix matrix;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    if (matrix.outcomes.isEmpty) return _Note(l.obeMatrixNoPos, const Key('matrixEmpty'));
    Widget cell(String text, {Color? fill, Key? key, bool bold = false, Color? color}) => Container(
      key: key,
      width: 52,
      height: 40,
      alignment: Alignment.center,
      decoration: BoxDecoration(color: fill, border: Border.all(color: c.outlineVariant, width: 0.5)),
      child: Text(text, style: context.text.labelLarge?.copyWith(fontWeight: bold ? FontWeight.w600 : null, color: color)),
    );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SingleChildScrollView(
          key: const Key('matrixScroll'),
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: Kx.s16),
          child: Column(
            children: [
              Row(children: [cell('', fill: c.surfaceContainerHighest), for (final po in matrix.outcomes) cell(po.code, key: Key('head-${po.code}'), fill: c.surfaceContainerHighest, bold: true)]),
              for (final co in matrix.cos)
                Row(
                  children: [
                    cell(co.code, key: Key('row-${co.code}'), fill: c.surfaceContainerHighest, bold: true),
                    for (final po in matrix.outcomes)
                      () {
                        final n = matrix.strength(co.id, po.id);
                        return cell(
                          n == 0 ? '–' : '$n',
                          key: Key('cell-${co.code}-${po.code}'),
                          fill: n == 0 ? null : c.primary.withValues(alpha: 0.12 + 0.2 * n),
                          bold: n > 0,
                          color: n == 0 ? c.onSurfaceVariant : c.onSurface,
                        );
                      }(),
                  ],
                ),
            ],
          ),
        ),
        Padding(padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s8, Kx.s16, 0), child: Text(l.obeMatrixLegend, style: context.text.bodySmall)),
      ],
    );
  }
}

class _AttainmentTile extends StatelessWidget {
  const _AttainmentTile({required this.l, required this.row});

  final AppLocalizations l;
  final CoAttainment row;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final value = row.combined;
    final (bg, fg) = row.met ? goodColors(context) : (c.errorContainer, c.onErrorContainer);
    return Padding(
      key: Key('attainment-${row.code}'),
      padding: const EdgeInsets.symmetric(horizontal: Kx.s16, vertical: Kx.s8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(row.code, style: context.text.titleSmall),
              const SizedBox(width: Kx.s8),
              Icon(switch (row.trend) { 'up' => Icons.trending_up, 'down' => Icons.trending_down, 'flat' => Icons.trending_flat, _ => Icons.fiber_new_outlined }, size: 18),
              const Spacer(),
              Pill(row.met ? l.obeMet : l.obeNotMet, background: bg, foreground: fg),
            ],
          ),
          const SizedBox(height: Kx.s4),
          LinearProgressIndicator(value: value == null || row.maxLevel <= 0 ? 0 : (value / row.maxLevel).clamp(0, 1).toDouble()),
          const SizedBox(height: Kx.s4),
          Text(
            [
              value == null ? '–' : numText(value),
              l.obeAttainmentTarget(numText(row.target)),
              if (row.direct != null) l.obeAttainmentDirect(numText(row.direct!)),
              if (row.indirect != null) l.obeAttainmentIndirect(numText(row.indirect!)),
            ].join(' · '),
            style: context.text.bodySmall,
          ),
        ],
      ),
    );
  }
}

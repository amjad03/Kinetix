import 'package:flutter/material.dart';
import 'package:kinetix_3d/kinetix_3d.dart' show ModelCatalogue;
import 'package:kinetix_labs/kinetix_labs.dart' show LabCatalogue, LabLang;
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../l10n/l10n.dart';
import '../board/chrome.dart' show BoardChromeTheme;
import '../board/context/class_context.dart';
import '../board/context/context_switcher.dart';
import '../board/kit/subjects.dart';
import '../board/phone_chrome.dart';
import '../sims/sims.dart' show SimKind, simName;
import 'curriculum_labels.dart';
import 'curriculum_registry.dart';

/// Whether a demo board opens on the class and subject picker. Tests turn it off
/// (test/flutter_test_config.dart); test/curriculum_picker_test.dart turns it on.
bool curriculumPickerAtDemoStart = true;

/// What the teacher did in the picker.
typedef CurriculumPickResult = ({String kind, String? id});

/// The big two-step class and subject picker over the board (the top bar's class chip, the demo
/// switcher, a demo board's start): pick a class or programme, then a subject. The choice goes
/// to [pick] and [onPicked] (null: back to the timetable); a demo class goes to [onDemoClass].
Future<void> showCurriculumPicker(
  BuildContext context, {
  required ClassContext Function() ctx,
  required ContextOverride pick,
  CurriculumChoice? timetable,
  List<(String, String)> demoClasses = const [],
  ValueChanged<String>? onDemoClass,
  ValueChanged<String?>? onPicked,
}) async {
  final r = await showDialog<CurriculumPickResult>(
    context: context,
    builder: (dialog) => BoardChromeTheme(
      child: CurriculumPicker(
        initial: ctx().curriculum,
        timetable: timetable,
        canReset: pick.active,
        demoClasses: demoClasses,
        onDone: (r) => Navigator.pop(dialog, r),
      ),
    ),
  );
  if (r == null || !context.mounted) return;
  switch (r.kind) {
    case 'pick':
      pick.setCurriculum(r.id!);
      onPicked?.call(r.id);
    case 'reset':
      pick.clear();
      onPicked?.call(null);
    case 'demo':
      onDemoClass?.call(r.id!);
    case 'other':
      await showDialog<void>(context: context, builder: (_) => ContextPicker(ctx: ctx, pick: pick));
  }
}

/// The picker itself: levels by stage (school, college, postgraduate), then the level's subjects
/// (by semester in college). Opens on [initial]'s subjects when there is one.
class CurriculumPicker extends StatefulWidget {
  const CurriculumPicker({super.key, required this.onDone, this.initial, this.timetable, this.canReset = false, this.demoClasses = const []});

  final ValueChanged<CurriculumPickResult> onDone;
  final CurriculumChoice? initial;

  /// The class the timetable has now, offered in one tap.
  final CurriculumChoice? timetable;

  /// Whether the teacher's pick can be cleared (the timetable then decides).
  final bool canReset;

  /// The demo day's classes (id, label), on a demo board.
  final List<(String, String)> demoClasses;

  @override
  State<CurriculumPicker> createState() => _CurriculumPickerState();
}

class _CurriculumPickerState extends State<CurriculumPicker> {
  late CurriculumStage _stage = widget.initial?.level.stage ?? CurriculumStage.school;
  late CurriculumLevel? _level = widget.initial?.level;

  void _done(String kind, [String? id]) => widget.onDone((kind: kind, id: id));

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final size = MediaQuery.sizeOf(context);
    final phone = isPhoneSize(size);
    // Wide panels (65–86") get bigger tiles and type; a phone gets the whole screen.
    final big = size.width >= 1600;
    final level = _level;
    final body = Column(
      key: const Key('curriculum-picker'),
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s8, Kx.s8, 0),
          child: Row(
            children: [
              if (level != null)
                IconButton(key: const Key('cur-back'), tooltip: l.curBack, icon: const Icon(Icons.arrow_back), onPressed: () => setState(() => _level = null))
              else
                const Padding(padding: EdgeInsets.all(Kx.s8), child: Icon(Icons.school_outlined)),
              const SizedBox(width: Kx.s8),
              Expanded(
                child: Text(
                  level == null ? l.curTitle : levelName(l, level),
                  style: (big ? context.text.headlineMedium : context.text.titleLarge)?.copyWith(fontWeight: FontWeight.w700),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              IconButton(key: const Key('cur-close'), tooltip: l.close, icon: const Icon(Icons.close), onPressed: () => Navigator.pop(context)),
            ],
          ),
        ),
        Flexible(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s8, Kx.s16, Kx.s16),
            child: level == null ? _levels(context, big) : _subjects(context, level, big),
          ),
        ),
      ],
    );
    if (phone) return Dialog.fullscreen(child: SafeArea(child: body));
    return Dialog(
      insetPadding: const EdgeInsets.all(Kx.s24),
      child: ConstrainedBox(constraints: BoxConstraints(maxWidth: big ? 1200 : 900, maxHeight: size.height * 0.9), child: body),
    );
  }

  /// Tiles in rows that fill the width, at least [minWidth] wide.
  Widget _grid(double minWidth, List<Widget> tiles) => LayoutBuilder(
    builder: (context, box) {
      final cols = (box.maxWidth / minWidth).floor().clamp(1, 6);
      final w = (box.maxWidth - Kx.s8 * (cols - 1)) / cols;
      return Wrap(spacing: Kx.s8, runSpacing: Kx.s8, children: [for (final t in tiles) SizedBox(width: w, child: t)]);
    },
  );

  Widget _levels(BuildContext context, bool big) {
    final l = context.l10n;
    final c = context.colors;
    final timetable = widget.timetable;
    final stageName = {CurriculumStage.school: l.curSchool, CurriculumStage.college: l.curCollege, CurriculumStage.postgrad: l.curPostgrad};
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (timetable != null)
          Padding(
            padding: const EdgeInsets.only(bottom: Kx.s12),
            child: FilledButton.tonalIcon(
              key: const Key('cur-timetable'),
              style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(56), alignment: Alignment.centerLeft),
              onPressed: () => widget.canReset ? _done('reset') : Navigator.pop(context),
              icon: const Icon(Icons.event_note_outlined),
              label: Text(l.curFromTimetable(curriculumLabel(l, timetable)), maxLines: 2, overflow: TextOverflow.ellipsis),
            ),
          )
        else if (widget.canReset)
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton.icon(key: const Key('cur-reset'), onPressed: () => _done('reset'), icon: const Icon(Icons.event_note_outlined), label: Text(l.curUseTimetable)),
          ),
        SegmentedButton<CurriculumStage>(
          key: const Key('cur-stages'),
          showSelectedIcon: false,
          segments: [
            for (final s in CurriculumStage.values) ButtonSegment(value: s, label: Text(stageName[s]!, key: Key('cur-stage-${s.name}'))),
          ],
          selected: {_stage},
          onSelectionChanged: (s) => setState(() => _stage = s.first),
          style: SegmentedButton.styleFrom(minimumSize: const Size(0, 56), textStyle: big ? context.text.titleLarge : context.text.titleMedium),
        ),
        const SizedBox(height: Kx.s16),
        _grid(
          _stage == CurriculumStage.school ? (big ? 200 : 132) : (big ? 360 : 260),
          [
            for (final lv in CurriculumRegistry.of(_stage))
              _Tile(
                key: Key('cur-level-${lv.id}'),
                title: levelName(context.l10n, lv),
                icon: _stage == CurriculumStage.school ? null : Icons.school_outlined,
                accent: lv.accent ?? c.primary,
                selected: widget.initial?.level.id == lv.id,
                big: big,
                onTap: () => setState(() => _level = lv),
              ),
          ],
        ),
        if (widget.demoClasses.isNotEmpty) ...[
          const SizedBox(height: Kx.s16),
          Text(l.curDemoDay, style: context.text.titleSmall?.copyWith(color: c.onSurfaceVariant)),
          const SizedBox(height: Kx.s8),
          Wrap(
            spacing: Kx.s8,
            runSpacing: Kx.s8,
            children: [
              for (final (id, label) in widget.demoClasses)
                ActionChip(key: Key('cur-demo-$id'), avatar: const Icon(Icons.swap_horiz, size: 18), label: Text(label), onPressed: () => _done('demo', id)),
            ],
          ),
        ],
        const SizedBox(height: Kx.s8),
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton.icon(key: const Key('cur-other'), onPressed: () => _done('other'), icon: const Icon(Icons.tune), label: Text(l.curOtherSubject)),
        ),
      ],
    );
  }

  Widget _subjects(BuildContext context, CurriculumLevel level, bool big) {
    final l = context.l10n;
    final c = context.colors;
    Widget tile(CurriculumSubject s) {
      final choice = CurriculumChoice(level, s);
      final style = choice.baseStyle;
      return _Tile(
        key: Key('cur-subject-${s.id}'),
        title: subjectTitle(l, s),
        icon: style.icon,
        accent: choice.style.accentFor(c),
        selected: widget.initial?.id == choice.id,
        big: big,
        features: [for (final f in choice.features.take(4)) f.icon],
        onTap: () => _done('pick', choice.id),
      );
    }

    final bySem = <int?, List<CurriculumSubject>>{};
    for (final s in level.subjects) {
      (bySem[s.semester] ??= []).add(s);
    }
    final minW = big ? 340.0 : 240.0;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(l.curPickSubject, style: context.text.bodyLarge?.copyWith(color: c.onSurfaceVariant)),
        const SizedBox(height: Kx.s12),
        for (final MapEntry(key: sem, value: subjects) in (bySem.entries.toList()..sort((a, b) => (a.key ?? 0).compareTo(b.key ?? 0)))) ...[
          if (sem != null) Padding(padding: const EdgeInsets.only(top: Kx.s8, bottom: Kx.s8), child: Text(l.curSemN(sem), style: context.text.titleSmall?.copyWith(color: c.onSurfaceVariant))),
          _grid(minW, [for (final s in subjects) tile(s)]),
        ],
      ],
    );
  }
}

/// A big tile of the picker (at least 64 px high, 80 on a wide panel).
class _Tile extends StatelessWidget {
  const _Tile({super.key, required this.title, required this.accent, required this.onTap, this.icon, this.selected = false, this.big = false, this.features = const []});

  final String title;
  final IconData? icon;
  final Color accent;
  final bool selected, big;
  final List<IconData> features;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Material(
      color: selected ? Color.alphaBlend(accent.withValues(alpha: 0.16), c.surfaceContainerHigh) : c.surfaceContainerLow,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Kx.s12), side: BorderSide(color: selected ? accent : c.outlineVariant, width: selected ? 2 : 1)),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: ConstrainedBox(
          constraints: BoxConstraints(minHeight: big ? 80 : 64),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: Kx.s12, vertical: Kx.s8),
            child: Row(
              children: [
                if (icon != null) ...[Icon(icon, color: accent, size: big ? 32 : 26), const SizedBox(width: Kx.s12)],
                Expanded(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: icon == null ? CrossAxisAlignment.center : CrossAxisAlignment.start,
                    children: [
                      Text(title, textAlign: icon == null ? TextAlign.center : TextAlign.start, style: (big ? context.text.titleLarge : context.text.titleMedium)?.copyWith(fontWeight: FontWeight.w600), maxLines: 2, overflow: TextOverflow.ellipsis),
                      if (features.isNotEmpty) ...[
                        const SizedBox(height: Kx.s4),
                        Row(children: [for (final f in features) Padding(padding: const EdgeInsets.only(right: Kx.s4), child: Icon(f, size: 16, color: c.onSurfaceVariant))]),
                      ],
                    ],
                  ),
                ),
                if (selected) Icon(Icons.check_circle, color: accent),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// "This subject's kits": every tool, kit, lab, sim and 3D model the picked class and subject
/// brings, one tap each; kits not built yet are marked for a later update.
class CurriculumKitsPanel extends StatelessWidget {
  const CurriculumKitsPanel({super.key, required this.choice, required this.onOpen, this.toolLabel, this.onChange});

  final CurriculumChoice choice;
  final ValueChanged<CurriculumFeature> onOpen;

  /// A Tools drawer tile's name.
  final String? Function(String id)? toolLabel;
  final VoidCallback? onChange;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final c = context.colors;
    final accent = choice.style.accentFor(c);
    String label(CurriculumFeature f) => switch (f.kind) {
      FeatureKind.tool => toolLabel?.call(f.ref) ?? _pretty(f.ref),
      FeatureKind.kit => f.kitTab == null ? _pretty(f.ref) : l.kitTabName(f.kitTab!),
      FeatureKind.lab => LabCatalogue.byId(f.ref)?.titleIn(LabLang.of(context)) ?? _pretty(f.ref),
      FeatureKind.model => ModelCatalogue.byId(f.ref)?.titleIn(Localizations.localeOf(context).languageCode) ?? _pretty(f.ref),
      FeatureKind.sim => SimKind.values.asNameMap()[f.ref] == null ? _pretty(f.ref) : simName(l, SimKind.values.asNameMap()[f.ref]!),
      FeatureKind.phet => _pretty(f.ref),
      FeatureKind.upcoming => upcomingTitle(l, f.ref),
    };
    Widget section(String title, Iterable<CurriculumFeature> fs) {
      final list = fs.toList();
      if (list.isEmpty) return const SizedBox.shrink();
      return Padding(
        padding: const EdgeInsets.only(top: Kx.s16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: context.text.titleSmall?.copyWith(color: c.onSurfaceVariant)),
            const SizedBox(height: Kx.s8),
            Wrap(
              spacing: Kx.s8,
              runSpacing: Kx.s8,
              children: [
                for (final f in list)
                  f.available
                      ? ActionChip(key: Key('cur-kit-${f.id.replaceAll(':', '-')}'), avatar: Icon(f.icon, size: 18, color: accent), label: Text(label(f)), onPressed: () => onOpen(f))
                      : Chip(
                          key: Key('cur-kit-${f.id.replaceAll(':', '-')}'),
                          avatar: Icon(f.icon, size: 18, color: c.onSurfaceVariant),
                          label: Text('${label(f)} · ${l.curInUpdate}', style: TextStyle(color: c.onSurfaceVariant)),
                          side: BorderSide(color: c.outlineVariant),
                          backgroundColor: c.surfaceContainerLow,
                        ),
              ],
            ),
          ],
        ),
      );
    }

    final fs = choice.features;
    return SingleChildScrollView(
      key: const Key('curriculum-kits'),
      padding: const EdgeInsets.fromLTRB(Kx.s24, Kx.s8, Kx.s24, Kx.s24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(curriculumLabel(l, choice), style: context.text.headlineSmall?.copyWith(fontWeight: FontWeight.w700)),
          if (onChange != null)
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton.icon(key: const Key('cur-kits-change'), onPressed: onChange, icon: const Icon(Icons.swap_horiz), label: Text(l.curChange)),
            ),
          section(l.curToolsKits, fs.where((f) => f.kind == FeatureKind.tool || f.kind == FeatureKind.kit || f.kind == FeatureKind.upcoming)),
          section(l.curLabsSims, fs.where((f) => f.kind == FeatureKind.lab || f.kind == FeatureKind.sim || f.kind == FeatureKind.phet)),
          section(l.curModels, fs.where((f) => f.kind == FeatureKind.model)),
        ],
      ),
    );
  }
}

String _pretty(String id) {
  final t = id.replaceAll(RegExp(r'[-_.]'), ' ').trim();
  return t.isEmpty ? id : t[0].toUpperCase() + t.substring(1);
}

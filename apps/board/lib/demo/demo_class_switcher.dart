import 'package:flutter/material.dart';
import 'package:kinetix_3d/kinetix_3d.dart' show ModelCatalogue;
import 'package:kinetix_animations/kinetix_animations.dart' show animationById, AnimLang;
import 'package:kinetix_labs/kinetix_labs.dart' show LabCatalogue, LabLang;
import 'package:kinetix_ui/kinetix_ui.dart';

import '../core/board_controller.dart';
import '../features/board/chrome.dart';
import '../features/board/side_panel.dart' show SplitContent;
import '../features/board/panel/panel_host.dart';
import '../features/extras/extras_hooks.dart';
import '../l10n/l10n.dart';
import 'demo_classes.dart';
import 'demo_server.dart';
import 'demo_strings.dart';

/// Switching the demo board between the classes of the demo day (lib/demo/demo_classes.dart):
/// UKG to a BSc, each with its roster, plan, topic, videos and resources.
abstract final class DemoClassSwitcher {
  static BoardController? _board;
  static void Function(DemoClass c)? _onSwitched;

  /// The board screen lends its board, and what to do once a class opens (a clean page and
  /// the class's panel).
  static void attach(BoardController board, void Function(DemoClass c) onSwitched) {
    _board = board;
    _onSwitched = onSwitched;
  }

  static void detach(BoardController board) {
    if (_board != board) return;
    _board = null;
    _onSwitched = null;
  }

  /// The class open on the demo board, if the demo server is running.
  static DemoClass? get current => DemoBoardServer.active?.current;

  /// Opens [id]'s class on [board] as if its teacher had signed in for the period.
  static void switchTo(BoardController board, String id) {
    final server = DemoBoardServer.active;
    if (server == null) return;
    server.switchTo(id);
    board.openSession(DemoBoardServer.sessionToken, server.session());
    _onSwitched?.call(server.current);
  }

  /// The timetable as a dialog over the board (the DEMO chip, the tools drawer).
  static Future<void> open(BuildContext context, [BoardController? board]) async {
    final b = board ?? _board;
    if (b == null) return;
    final id = await showPanelDialog<String>(
      context: context,
      builder: (dialog) => BoardChromeTheme(
        child: AlertDialog(
          key: const Key('demo-class-switcher'),
          icon: const Icon(Icons.swap_horiz),
          title: Text(demoStrings(dialog)['switcher']),
          content: SizedBox(width: 560, child: DemoTimetable(onPick: (id) => Navigator.pop(dialog, id))),
          actions: [TextButton(onPressed: () => Navigator.pop(dialog), child: Text(dialog.l10n.close))],
        ),
      ),
    );
    if (id == null) return;
    switchTo(b, id);
    if (context.mounted) {
      final c = DemoClasses.byId(id);
      showBoardMessage(context, demoStrings(context).n('opened', '${c.section} · ${c.subject}'));
    }
  }
}

/// The demo day's classes in time order; the open one is marked.
class DemoTimetable extends StatelessWidget {
  const DemoTimetable({super.key, required this.onPick});

  final ValueChanged<String> onPick;

  @override
  Widget build(BuildContext context) {
    final s = demoStrings(context);
    final c = context.colors;
    final now = DemoClassSwitcher.current?.id;
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(s['switcherHint'], style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant)),
        const SizedBox(height: Kx.s8),
        Flexible(
          child: ListView(
            shrinkWrap: true,
            children: [
              for (final k in DemoClasses.all)
                Card(
                  elevation: 0,
                  color: k.id == now ? c.primaryContainer : c.surfaceContainerLow,
                  child: ListTile(
                    key: Key('demo-class-${k.id}'),
                    minTileHeight: 64,
                    leading: SizedBox(
                      width: 56,
                      child: Text(k.startsAt, style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
                    ),
                    title: Text('${k.section} · ${k.subject}'),
                    subtitle: Text('${k.teacher} · ${k.room}\n${k.institution}', maxLines: 2, overflow: TextOverflow.ellipsis),
                    isThreeLine: true,
                    trailing: k.id == now ? Chip(label: Text(s['now'])) : const Icon(Icons.chevron_right),
                    onTap: () => onPick(k.id),
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }
}

/// "This class": the open demo class's topic, plan and the resources picked for it, one tap
/// each (the labs, 3D models, sims and animations that fit the lesson).
class DemoClassPanel extends StatelessWidget {
  const DemoClassPanel({super.key, required this.hooks, required this.demoClass, this.onPrimary, this.onSwitch});

  final ExtrasHooks hooks;
  final DemoClass demoClass;

  /// Opens the primary activity the lesson starts with (UKG).
  final VoidCallback? onPrimary;
  final VoidCallback? onSwitch;

  @override
  Widget build(BuildContext context) {
    final s = demoStrings(context);
    final k = demoClass;
    final c = context.colors;
    final lang = LabLang.of(context);
    final animLang = AnimLang.values.firstWhere((l) => l.name == lang.name, orElse: () => AnimLang.en);
    Widget section(String title, List<Widget> chips) => chips.isEmpty
        ? const SizedBox.shrink()
        : Padding(
            padding: const EdgeInsets.only(top: Kx.s16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: context.text.titleSmall?.copyWith(color: c.onSurfaceVariant)),
                const SizedBox(height: Kx.s8),
                Wrap(spacing: Kx.s8, runSpacing: Kx.s8, children: chips),
              ],
            ),
          );
    ActionChip chip(String key, IconData icon, String label, VoidCallback onTap) =>
        ActionChip(key: Key(key), avatar: Icon(icon, size: 18), label: Text(label), onPressed: onTap);
    String pretty(String id) {
      final t = id.replaceAll(RegExp(r'[-_.]'), ' ').trim();
      return t.isEmpty ? id : t[0].toUpperCase() + t.substring(1);
    }

    return SingleChildScrollView(
      key: const Key('demo-class-panel'),
      padding: const EdgeInsets.fromLTRB(Kx.s24, Kx.s8, Kx.s24, Kx.s24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
        Text('${k.section} · ${k.subject}', style: context.text.headlineSmall?.copyWith(fontWeight: FontWeight.w700)),
        const SizedBox(height: Kx.s4),
        Text('${k.period} · ${k.teacher} · ${k.room}', style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant)),
        Text(k.institution, style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant)),
        if (onSwitch != null)
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton.icon(key: const Key('demo-class-switch'), onPressed: onSwitch, icon: const Icon(Icons.swap_horiz), label: Text(s['switch'])),
          ),
        const SizedBox(height: Kx.s8),
        Card(
          elevation: 0,
          color: c.secondaryContainer,
          child: Padding(
            padding: const EdgeInsets.all(Kx.s16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('${s['syllabus']}: ${k.syllabus}', style: context.text.labelLarge),
                const SizedBox(height: Kx.s4),
                Text('${k.chapter} › ${k.topic}', key: const Key('demo-class-topic'), style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
                const SizedBox(height: Kx.s4),
                Text(k.summary),
              ],
            ),
          ),
        ),
        if (onPrimary != null && k.primaryActivity != null)
          Padding(
            padding: const EdgeInsets.only(top: Kx.s12),
            child: FilledButton.icon(
              key: const Key('demo-class-primary'),
              style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(64)),
              onPressed: onPrimary,
              icon: const Icon(Icons.gesture, size: 28),
              label: Text(s['primary']),
            ),
          ),
        const SizedBox(height: Kx.s16),
        Row(
          children: [
            Expanded(child: Text(s['plan'], style: context.text.titleSmall?.copyWith(color: c.onSurfaceVariant))),
            TextButton(key: const Key('demo-class-open-plan'), onPressed: hooks.openPlan, child: Text(s['openPlan'])),
          ],
        ),
        for (final st in k.steps)
          ListTile(
            dense: true,
            contentPadding: EdgeInsets.zero,
            leading: CircleAvatar(radius: 22, child: Text(s.n('min', st.minutes), style: context.text.labelSmall)),
            title: Text(st.activity),
          ),
        section(s['videos'], [
          chip('demo-res-videos', Icons.smart_display_outlined, '${s['videos']} (${k.videos.length})', hooks.openVideos),
          chip('demo-res-kit', Icons.backpack_outlined, s['kit'], () => hooks.openKit(k.kitTab)),
        ]),
        section(s['labs'], [
          for (final id in k.labs)
            if (LabCatalogue.byId(id) case final e?) chip('demo-res-lab-$id', Icons.science_outlined, e.titleIn(lang), () => hooks.openSplit(SplitContent.lab, id)),
        ]),
        section(s['models'], [
          for (final id in k.models)
            if (ModelCatalogue.byId(id) case final m?) chip('demo-res-model-$id', Icons.view_in_ar_outlined, m.title, () => hooks.openSplit(SplitContent.model3d, id)),
        ]),
        section(s['sims'], [for (final id in k.phet) chip('demo-res-phet-$id', Icons.science, pretty(id), () => hooks.openPhet(id))]),
        section(s['animations'], [
          for (final id in k.animations)
            if (animationById(id) case final a?) chip('demo-res-anim-$id', Icons.animation, a.title.of(animLang), () => hooks.openAnimations(a.title.en)),
        ]),
        section('${s['roster']} (${k.roster.length})', [for (final n in k.roster) Chip(label: Text(n), visualDensity: VisualDensity.compact)]),
        ],
      ),
    );
  }
}

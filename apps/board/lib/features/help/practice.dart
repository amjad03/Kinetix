import 'package:flutter/material.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../l10n/l10n.dart';
import '../board/chrome.dart';
import '../toolkit/toolkit_controller.dart';

/// The practice board's tasks, in order: what a teacher does in every class.
enum PracticeTask { write, erase, shape, page, picture, timer }

(String, IconData, Key) practiceText(AppLocalizations l, PracticeTask t) => switch (t) {
  PracticeTask.write => (l.practiceWrite, Icons.edit_outlined, const Key('tool-write')),
  PracticeTask.erase => (l.practiceErase, Icons.undo, const Key('tool-erase')),
  PracticeTask.shape => (l.practiceShape, Icons.interests_outlined, const Key('tool-shapes')),
  PracticeTask.page => (l.practicePage, Icons.auto_stories_outlined, const Key('next-page')),
  PracticeTask.picture => (l.practicePicture, Icons.add_photo_alternate_outlined, const Key('tool-insert')),
  PracticeTask.timer => (l.practiceTimer, Icons.timer_outlined, const Key('tool-tools')),
};

/// The practice page: a heading and a sum to try things on.
List<BoardElement> practicePage(AppLocalizations l, {required bool dark}) {
  final ink = dark ? WhiteboardController.chalkWhite : WhiteboardController.inkBlack;
  TextElement text(String s, double y, double size, {Color? color, bool bold = false}) =>
      TextElement(id: newElementId(), position: Offset(80, y), text: s, color: color ?? ink, fontSize: size, bold: bold, size: measureBoardText(s, size, bold: bold));
  return [
    text(l.practiceTitle, 70, 44, color: const Color(0xFF188038), bold: true),
    text(l.practiceNotSaved, 140, 24),
    text('2x + 5 = 15', 240, 40),
  ];
}

/// Ticks each task off as the teacher does it on the board.
class PracticeTracker extends ChangeNotifier {
  PracticeTracker({required this.wb, required this.kit}) {
    _initial = {for (var i = 0; i < wb.pageCount; i++) ...wb.elementsOf(i).map((e) => e.id)};
    _pages = wb.pageCount;
    _page = wb.pageIndex;
    wb.addListener(_check);
    kit.addListener(_check);
  }

  final WhiteboardController wb;
  final ToolkitController kit;
  final Set<PracticeTask> done = {};
  late final Set<String> _initial;
  late final int _pages, _page;
  final _strokes = <String>{};

  bool get finished => done.length == PracticeTask.values.length;

  /// The next task to do (null when all are done).
  PracticeTask? get next => PracticeTask.values.where((t) => !done.contains(t)).firstOrNull;

  void _check() {
    final before = done.length;
    final now = <String>{};
    for (var i = 0; i < wb.pageCount; i++) {
      for (final e in wb.elementsOf(i)) {
        now.add(e.id);
        if (_initial.contains(e.id)) continue;
        switch (e) {
          case Stroke(shape: null):
            _strokes.add(e.id);
            done.add(PracticeTask.write);
          case Stroke() || PolygonElement():
            done.add(PracticeTask.shape);
          case ImageElement():
            done.add(PracticeTask.picture);
          default:
            break;
        }
      }
    }
    if (_strokes.any((id) => !now.contains(id))) done.add(PracticeTask.erase);
    if (wb.pageCount > _pages || wb.pageIndex != _page) done.add(PracticeTask.page);
    if (kit.isOpen(ToolkitItem.timer)) done.add(PracticeTask.timer);
    if (done.length != before) notifyListeners();
  }

  @override
  void dispose() {
    wb.removeListener(_check);
    kit.removeListener(_check);
    super.dispose();
  }
}

/// The practice checklist over the board.
class PracticePanel extends StatefulWidget {
  const PracticePanel({super.key, required this.tracker, required this.onShowMe, required this.onFinish});

  final PracticeTracker tracker;
  final void Function(PracticeTask task) onShowMe;
  final VoidCallback onFinish;

  @override
  State<PracticePanel> createState() => _PracticePanelState();
}

class _PracticePanelState extends State<PracticePanel> {
  bool _small = false;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final c = context.colors;
    return ListenableBuilder(
      listenable: widget.tracker,
      builder: (context, _) {
        final t = widget.tracker;
        final n = t.done.length, all = PracticeTask.values.length;
        return ChromeSurface(
          key: const Key('practice-panel'),
          radius: Kx.rXl,
          padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s8, Kx.s8, Kx.s12),
          child: SizedBox(
            width: 360,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    Icon(t.finished ? Icons.emoji_events_outlined : Icons.school_outlined, color: c.primary),
                    const SizedBox(width: Kx.s12),
                    Expanded(
                      child: Text(t.finished ? l.practiceReady : l.practiceCount(n, all), key: const Key('practice-count'), style: context.text.titleMedium),
                    ),
                    IconButton(
                      key: const Key('practice-fold'),
                      tooltip: _small ? l.practiceShowList : l.practiceHideList,
                      onPressed: () => setState(() => _small = !_small),
                      icon: Icon(_small ? Icons.expand_more : Icons.expand_less),
                    ),
                  ],
                ),
                Padding(
                  padding: const EdgeInsets.only(right: Kx.s8, top: Kx.s4, bottom: Kx.s8),
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(4),
                    child: LinearProgressIndicator(value: n / all, minHeight: 6, backgroundColor: c.surfaceContainerHighest),
                  ),
                ),
                if (t.finished)
                  Padding(
                    padding: const EdgeInsets.only(right: Kx.s8, bottom: Kx.s8),
                    child: Text(l.practiceDoneBody, style: TextStyle(color: c.onSurfaceVariant)),
                  )
                else if (!_small)
                  for (final task in PracticeTask.values) _row(context, task, t.done.contains(task), task == t.next),
                Align(
                  alignment: Alignment.centerRight,
                  child: Padding(
                    padding: const EdgeInsets.only(right: Kx.s8, top: Kx.s4),
                    child: t.finished
                        ? FilledButton.icon(key: const Key('practice-finish'), onPressed: widget.onFinish, icon: const Icon(Icons.check), label: Text(l.practiceFinish))
                        : TextButton(key: const Key('practice-end'), onPressed: widget.onFinish, child: Text(l.practiceEnd)),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _row(BuildContext context, PracticeTask task, bool done, bool current) {
    final l = context.l10n;
    final c = context.colors;
    final (text, icon, _) = practiceText(l, task);
    return AnimatedContainer(
      duration: Kx.fast,
      margin: const EdgeInsets.only(right: Kx.s8, top: 2),
      padding: const EdgeInsets.fromLTRB(Kx.s8, Kx.s4, Kx.s4, Kx.s4),
      decoration: BoxDecoration(color: current ? c.secondaryContainer : null, borderRadius: BorderRadius.circular(Kx.rMd)),
      child: Row(
        children: [
          Icon(done ? Icons.check_circle : icon, color: done ? c.primary : c.onSurfaceVariant, size: 22),
          const SizedBox(width: Kx.s12),
          Expanded(
            child: Text(
              text,
              key: Key('practice-${task.name}'),
              style: TextStyle(color: done ? c.onSurfaceVariant : c.onSurface, decoration: done ? TextDecoration.lineThrough : null),
            ),
          ),
          if (current) TextButton(key: Key('practice-show-${task.name}'), onPressed: () => widget.onShowMe(task), child: Text(l.helpShowMe)),
        ],
      ),
    );
  }
}

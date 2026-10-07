import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../core/board_controller.dart';
import '../toolkit/toolkit_controller.dart' show demoClassNames;
import 'classroom_strings.dart';

/// The class's students as (id, name): the roster, or the sample class on a board with no class.
List<(String, String)> classStudents(BoardController board) =>
    board.roster.isNotEmpty ? [for (final r in board.roster) (r.id, r.fullName)] : [for (final n in demoClassNames) (n, n)];

String _classKey(BoardController board) => board.session?.sectionName ?? 'guest';

// --- Groups ------------------------------------------------------------------------------------

/// [names] shuffled into [n] groups whose sizes differ by at most one.
List<List<String>> makeGroups(List<String> names, int n, [math.Random? random]) {
  final int count = n.clamp(1, math.max(1, names.length));
  final shuffled = List.of(names)..shuffle(random ?? math.Random());
  final groups = List.generate(count, (_) => <String>[]);
  for (final (i, name) in shuffled.indexed) {
    groups[i % count].add(name);
  }
  return groups;
}

/// The random group maker: n groups from the class, shown big, and on the board in one tap.
class GroupMakerPanel extends StatefulWidget {
  const GroupMakerPanel({super.key, required this.board, required this.wb, this.random});

  final BoardController board;
  final WhiteboardController wb;
  final math.Random? random;

  @override
  State<GroupMakerPanel> createState() => _GroupMakerPanelState();
}

class _GroupMakerPanelState extends State<GroupMakerPanel> {
  int _n = 4;
  List<List<String>> _groups = [];

  static const _colors = [Color(0xFFAECBFA), Color(0xFFFDD663), Color(0xFFA8DAB5), Color(0xFFF6AEA9), Color(0xFFD7AEFB), Color(0xFFFCC934), Color(0xFF78D9EC), Color(0xFFFF8BCB)];

  void _make() => setState(() => _groups = makeGroups([for (final s in classStudents(widget.board)) s.$2], _n, widget.random));

  void _toBoard() {
    final s = classroomStrings(context);
    final els = <BoardElement>[];
    for (final (i, g) in _groups.indexed) {
      final text = '${s.n('group', i + 1)}\n${g.join('\n')}';
      final h = 64.0 + g.length * 30;
      els.add(NoteElement(id: newElementId(), rect: Rect.fromLTWH((i % 4) * 260.0, (i ~/ 4) * (h + 20), 240, h), text: text, color: _colors[i % _colors.length], kind: NoteKind.note));
    }
    widget.wb.insert(els);
  }

  @override
  Widget build(BuildContext context) {
    final s = classroomStrings(context);
    return ListView(
      key: const Key('groups-panel'),
      padding: const EdgeInsets.all(Kx.s16),
      children: [
        if (widget.board.roster.isEmpty) Text(s['noRoster'], style: context.text.bodySmall),
        Row(
          children: [
            Text(s.n('groupCount', _n), style: context.text.titleMedium),
            Expanded(child: Slider(key: const Key('groups-n'), value: _n.toDouble(), min: 2, max: 8, divisions: 6, label: '$_n', onChanged: (v) => setState(() => _n = v.round()))),
          ],
        ),
        Wrap(
          spacing: Kx.s8,
          children: [
            FilledButton.icon(key: const Key('groups-make'), onPressed: _make, icon: const Icon(Icons.shuffle), label: Text(s['make'])),
            if (_groups.isNotEmpty) OutlinedButton.icon(key: const Key('groups-board'), onPressed: _toBoard, icon: const Icon(Icons.open_in_new), label: Text(s['toBoard'])),
          ],
        ),
        const SizedBox(height: Kx.s16),
        Wrap(
          spacing: Kx.s12,
          runSpacing: Kx.s12,
          children: [
            for (final (i, g) in _groups.indexed)
              Container(
                key: Key('group-$i'),
                width: 220,
                padding: const EdgeInsets.all(Kx.s12),
                decoration: BoxDecoration(color: _colors[i % _colors.length], borderRadius: Kx.radiusLg),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(s.n('group', i + 1), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 18, color: Color(0xFF1B1F24))),
                    for (final n in g) Text(n, style: const TextStyle(fontSize: 16, color: Color(0xFF1B1F24))),
                  ],
                ),
              ),
          ],
        ),
      ],
    );
  }
}

// --- Seating chart ------------------------------------------------------------------------------

/// The seats of a class, front row first; each holds a student id or nothing.
class SeatingPlan {
  SeatingPlan(this.rows, this.cols, this.seats);

  /// The roster in order, filling the rows from the front.
  factory SeatingPlan.fill(List<String> ids, {int? cols}) {
    final c = cols ?? math.max(2, math.min(6, (math.sqrt(ids.length) * 1.3).ceil()));
    final r = math.max(1, (ids.length / c).ceil());
    return SeatingPlan(r, c, [for (var i = 0; i < r * c; i++) i < ids.length ? ids[i] : null]);
  }

  int rows, cols;
  List<String?> seats;

  /// Swaps the occupants of seats [a] and [b].
  void swap(int a, int b) {
    final t = seats[a];
    seats[a] = seats[b];
    seats[b] = t;
  }

  /// Changes the grid, keeping everyone (new seats are empty; students past the end move up).
  void resize(int r, int c) {
    final people = seats.whereType<String>().toList();
    rows = math.max(r, (people.length / c).ceil());
    cols = c;
    seats = [for (var i = 0; i < rows * cols; i++) i < people.length ? people[i] : null];
  }

  String encode() => '$rows|$cols|${seats.map((s) => s ?? '').join(',')}';

  static SeatingPlan? decode(String? s, Set<String> known) {
    final p = s?.split('|');
    if (p == null || p.length != 3) return null;
    final r = int.tryParse(p[0]), c = int.tryParse(p[1]);
    if (r == null || c == null) return null;
    final seats = [for (final id in p[2].split(',')) id.isEmpty || !known.contains(id) ? null : id];
    if (seats.length != r * c) return null;
    // Students who joined since: the first empty seats.
    final missing = known.difference(seats.whereType<String>().toSet()).toList();
    for (var i = 0; i < seats.length && missing.isNotEmpty; i++) {
      if (seats[i] == null) seats[i] = missing.removeAt(0);
    }
    final plan = SeatingPlan(r, c, seats);
    if (missing.isNotEmpty) plan.resize(r + (missing.length / c).ceil(), c);
    return plan;
  }
}

/// The seating chart from the roster: the board at the front, students in desks; drag a
/// student onto another desk to swap them. Kept on the board for each class.
class SeatingChartPanel extends StatefulWidget {
  const SeatingChartPanel({super.key, required this.board, this.random});

  final BoardController board;
  final math.Random? random;

  @override
  State<SeatingChartPanel> createState() => SeatingChartPanelState();
}

class SeatingChartPanelState extends State<SeatingChartPanel> {
  late SeatingPlan plan;
  late Map<String, String> _names;

  String get _key => 'kinetix.seating.${_classKey(widget.board)}';

  @override
  void initState() {
    super.initState();
    final students = classStudents(widget.board);
    _names = {for (final s in students) s.$1: s.$2};
    plan = SeatingPlan.fill([for (final s in students) s.$1]);
    SharedPreferences.getInstance().then((p) {
      final saved = SeatingPlan.decode(p.getString(_key), _names.keys.toSet());
      if (saved != null && mounted) setState(() => plan = saved);
    }).catchError((_) {});
  }

  void _save() {
    final key = _key, value = plan.encode();
    unawaited(SharedPreferences.getInstance().then((p) => p.setString(key, value)).catchError((_) => false));
  }

  void swap(int a, int b) {
    setState(() => plan.swap(a, b));
    _save();
  }

  @override
  Widget build(BuildContext context) {
    final s = classroomStrings(context);
    final c = context.colors;
    return Column(
      key: const Key('seating-panel'),
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s8, Kx.s16, 0),
          child: Text(s['seatingHint'], style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant)),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: Kx.s16, vertical: Kx.s8),
          child: Wrap(
            spacing: Kx.s8,
            runSpacing: Kx.s8,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              Text('${s['cols']}: ${plan.cols}'),
              IconButton.outlined(key: const Key('seating-cols-minus'), onPressed: plan.cols <= 2 ? null : () => setState(() => plan.resize(plan.rows, plan.cols - 1)), icon: const Icon(Icons.remove)),
              IconButton.outlined(key: const Key('seating-cols-plus'), onPressed: plan.cols >= 10 ? null : () => setState(() => plan.resize(plan.rows, plan.cols + 1)), icon: const Icon(Icons.add)),
              OutlinedButton.icon(
                key: const Key('seating-shuffle'),
                onPressed: () {
                  setState(() => plan.seats.shuffle(widget.random ?? math.Random()));
                  _save();
                },
                icon: const Icon(Icons.shuffle),
                label: Text(s['shuffle']),
              ),
              OutlinedButton.icon(
                key: const Key('seating-az'),
                onPressed: () {
                  final ids = plan.seats.whereType<String>().toList()..sort((a, b) => (_names[a] ?? a).compareTo(_names[b] ?? b));
                  setState(() => plan = SeatingPlan.fill(ids, cols: plan.cols));
                  _save();
                },
                icon: const Icon(Icons.sort_by_alpha),
                label: Text(s['alphabetical']),
              ),
            ],
          ),
        ),
        Container(
          margin: const EdgeInsets.symmetric(horizontal: Kx.s16),
          padding: const EdgeInsets.all(Kx.s8),
          decoration: BoxDecoration(color: c.inverseSurface, borderRadius: Kx.radiusSm),
          alignment: Alignment.center,
          child: Text(s['front'], style: TextStyle(color: c.onInverseSurface, fontWeight: FontWeight.w700)),
        ),
        Expanded(
          child: LayoutBuilder(
            builder: (context, box) {
              final w = math.max(84.0, (box.maxWidth - Kx.s32) / plan.cols - Kx.s8);
              return SingleChildScrollView(
                padding: const EdgeInsets.all(Kx.s16),
                child: Wrap(
                  spacing: Kx.s8,
                  runSpacing: Kx.s8,
                  children: [
                    for (var i = 0; i < plan.seats.length; i++)
                      SizedBox(
                        width: w,
                        height: 64,
                        child: DragTarget<int>(
                          onWillAcceptWithDetails: (d) => d.data != i,
                          onAcceptWithDetails: (d) => swap(d.data, i),
                          builder: (context, hover, _) {
                            final id = plan.seats[i];
                            final desk = _Desk(name: id == null ? null : _names[id] ?? id, empty: s['empty'], highlight: hover.isNotEmpty);
                            if (id == null) return KeyedSubtree(key: Key('seat-$i'), child: desk);
                            return LongPressDraggable<int>(
                              key: Key('seat-$i'),
                              data: i,
                              delay: const Duration(milliseconds: 150),
                              feedback: SizedBox(width: w, height: 64, child: Material(color: Colors.transparent, child: _Desk(name: _names[id] ?? id, empty: '', highlight: true))),
                              childWhenDragging: Opacity(opacity: 0.35, child: desk),
                              child: desk,
                            );
                          },
                        ),
                      ),
                  ],
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}

class _Desk extends StatelessWidget {
  const _Desk({required this.name, required this.empty, required this.highlight});
  final String? name;
  final String empty;
  final bool highlight;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Container(
      alignment: Alignment.center,
      padding: const EdgeInsets.symmetric(horizontal: 6),
      decoration: BoxDecoration(
        color: highlight ? c.primaryContainer : (name == null ? c.surfaceContainerLow : c.secondaryContainer),
        borderRadius: Kx.radiusMd,
        border: Border.all(color: highlight ? c.primary : c.outlineVariant, width: highlight ? 2 : 1),
      ),
      child: Text(name ?? empty, maxLines: 2, overflow: TextOverflow.ellipsis, textAlign: TextAlign.center, style: TextStyle(color: name == null ? c.onSurfaceVariant : c.onSecondaryContainer, fontWeight: FontWeight.w600)),
    );
  }
}

// --- Magnifier ---------------------------------------------------------------------------------

/// A lens over the board (and anything on it) that the teacher drags; × closes it.
abstract final class BoardMagnifier {
  static OverlayEntry? _entry;
  static bool get showing => _entry != null;

  static void toggle(BuildContext context) {
    if (_entry?.mounted ?? false) {
      hide();
      return;
    }
    _entry = OverlayEntry(builder: (_) => const _MagnifierLens());
    Overlay.of(context, rootOverlay: true).insert(_entry!);
  }

  static void hide() {
    if (_entry?.mounted ?? false) _entry!.remove();
    _entry = null;
  }
}

class _MagnifierLens extends StatefulWidget {
  const _MagnifierLens();

  @override
  State<_MagnifierLens> createState() => _MagnifierLensState();
}

class _MagnifierLensState extends State<_MagnifierLens> {
  Offset _at = const Offset(120, 160);
  double _scale = 2;
  static const _size = 240.0;

  @override
  Widget build(BuildContext context) {
    final s = classroomStrings(context);
    // The lens and its buttons inside one box, so the buttons take taps.
    const pad = 20.0;
    final screen = MediaQuery.sizeOf(context);
    final at = Offset(_at.dx.clamp(0, math.max(0, screen.width - _size - 2 * pad)), _at.dy.clamp(0, math.max(0, screen.height - _size - 2 * pad)));
    return Positioned(
      left: at.dx,
      top: at.dy,
      child: GestureDetector(
        key: const Key('magnifier'),
        behavior: HitTestBehavior.opaque,
        onPanUpdate: (d) => setState(() => _at = at + d.delta),
        child: SizedBox(
          width: _size + 2 * pad,
          height: _size + 2 * pad,
          child: Stack(
            children: [
              Positioned(
                left: pad,
                top: pad,
                child: RawMagnifier(
                  size: const Size(_size, _size),
                  magnificationScale: _scale,
                  decoration: const MagnifierDecoration(
                    shape: CircleBorder(side: BorderSide(color: Color(0xFF1A73E8), width: 5)),
                    shadows: [BoxShadow(blurRadius: 16, color: Color(0x55000000))],
                  ),
                ),
              ),
              Positioned(
                right: 0,
                top: 0,
                child: Material(
                  shape: const CircleBorder(),
                  color: Colors.white,
                  elevation: 3,
                  child: IconButton(key: const Key('magnifier-close'), tooltip: s['close'], onPressed: BoardMagnifier.hide, icon: const Icon(Icons.close)),
                ),
              ),
              Positioned(
                right: 0,
                bottom: 0,
                child: Material(
                  shape: const StadiumBorder(),
                  color: Colors.white,
                  elevation: 3,
                  child: TextButton(
                    key: const Key('magnifier-zoom'),
                    onPressed: () => setState(() => _scale = _scale >= 4 ? 1.5 : _scale + 0.5),
                    child: Text('${_scale.toStringAsFixed(1)}×'),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// --- Teacher's notes ---------------------------------------------------------------------------

/// Private notes for the class open on the board: only on this panel (the projector, the live
/// view and recordings carry the board's page, never the panel), kept on the board per class.
class TeacherNotesPanel extends StatefulWidget {
  const TeacherNotesPanel({super.key, required this.board});
  final BoardController board;

  @override
  State<TeacherNotesPanel> createState() => _TeacherNotesPanelState();
}

class _TeacherNotesPanelState extends State<TeacherNotesPanel> {
  final _text = TextEditingController();
  Timer? _debounce;
  bool _saved = false;

  String get _key => 'kinetix.teacherNotes.${widget.board.session?.teacherId ?? 'guest'}.${_classKey(widget.board)}';

  @override
  void initState() {
    super.initState();
    SharedPreferences.getInstance().then((p) {
      if (mounted) _text.text = p.getString(_key) ?? '';
    }).catchError((_) {});
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _persist();
    _text.dispose();
    super.dispose();
  }

  void _persist() {
    final key = _key, value = _text.text;
    unawaited(SharedPreferences.getInstance().then((p) => p.setString(key, value)).catchError((_) => false));
  }

  @override
  Widget build(BuildContext context) {
    final s = classroomStrings(context);
    final c = context.colors;
    return Padding(
      key: const Key('teacher-notes'),
      padding: const EdgeInsets.all(Kx.s16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            padding: const EdgeInsets.all(Kx.s12),
            decoration: BoxDecoration(color: c.tertiaryContainer, borderRadius: Kx.radiusMd),
            child: Row(
              children: [
                Icon(Icons.visibility_off_outlined, color: c.onTertiaryContainer),
                const SizedBox(width: Kx.s8),
                Expanded(child: Text(s['notesPrivate'], key: const Key('teacher-notes-private'), style: TextStyle(color: c.onTertiaryContainer))),
              ],
            ),
          ),
          const SizedBox(height: Kx.s12),
          Expanded(
            child: TextField(
              key: const Key('teacher-notes-text'),
              controller: _text,
              expands: true,
              maxLines: null,
              textAlignVertical: TextAlignVertical.top,
              style: context.text.titleMedium,
              decoration: InputDecoration(hintText: s['notesHint'], border: const OutlineInputBorder()),
              onChanged: (_) {
                _debounce?.cancel();
                _debounce = Timer(const Duration(milliseconds: 600), () {
                  _persist();
                  if (mounted) setState(() => _saved = true);
                });
              },
            ),
          ),
          if (_saved) Padding(padding: const EdgeInsets.only(top: Kx.s4), child: Text(s['saved'], style: context.text.bodySmall)),
        ],
      ),
    );
  }
}

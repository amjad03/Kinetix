import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';
import 'package:share_plus/share_plus.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../core/board_controller.dart';
import '../../l10n/feature_strings.dart';
import '../board/chrome.dart' show showBoardMessage;
import 'classroom_strings.dart';
import 'classroom_tools.dart' show classKey, classStudents;

/// How the desks are laid out.
enum SeatLayout { rows, pairs, groups, ushape, custom }

/// How "Auto-arrange" seats the class.
enum SeatArrange { random, genderMix, heightFront, alphabetical }

/// What the teacher knows about a student, for arranging seats (kept on this board).
class SeatInfo {
  const SeatInfo({this.gender, this.heightCm});

  /// 'm', 'f' or null.
  final String? gender;
  final int? heightCm;

  Map<String, dynamic> toJson() => {if (gender != null) 'g': gender, if (heightCm != null) 'h': heightCm};
  factory SeatInfo.fromJson(Map<String, dynamic> j) => SeatInfo(gender: j['g'] as String?, heightCm: (j['h'] as num?)?.toInt());
}

/// The place of each of [n] seats in desk units (column, row) for [layout]; [cols] is the
/// grid width for rows and pairs. Custom starts as rows (the teacher moves the desks).
List<Offset> seatSlots(SeatLayout layout, int n, int cols) {
  switch (layout) {
    case SeatLayout.rows:
    case SeatLayout.custom:
      return [for (var i = 0; i < n; i++) Offset((i % cols).toDouble(), (i ~/ cols).toDouble())];
    case SeatLayout.pairs:
      return [for (var i = 0; i < n; i++) Offset((i % cols) + ((i % cols) ~/ 2) * 0.7, (i ~/ cols).toDouble())];
    case SeatLayout.groups:
      final perRow = math.max(1, (cols / 2).ceil());
      return [for (var i = 0; i < n; i++) Offset(((i ~/ 4) % perRow) * 2.8 + (i % 4) % 2, ((i ~/ 4) ~/ perRow) * 2.8 + (i % 4) ~/ 2)];
    case SeatLayout.ushape:
      final left = math.max(1, (n / 3).ceil());
      final right = math.min(left, math.max(0, n - left));
      final bottom = math.max(0, n - left - right);
      final out = <Offset>[];
      for (var i = 0; i < left && out.length < n; i++) {
        out.add(Offset(0, i.toDouble()));
      }
      for (var j = 0; j < bottom && out.length < n; j++) {
        out.add(Offset(1.0 + j, left - 1.0));
      }
      for (var k = 0; k < right && out.length < n; k++) {
        out.add(Offset(bottom + 1.0, left - 1.0 - k));
      }
      return out;
  }
}

/// The seats of a class, front row first; each holds a student id or nothing.
class SeatingPlan {
  SeatingPlan(this.rows, this.cols, this.seats, {this.layout = SeatLayout.rows, Map<int, Offset>? custom}) : custom = custom ?? {};

  /// The roster in order, filling the rows from the front.
  factory SeatingPlan.fill(List<String> ids, {int? cols, SeatLayout layout = SeatLayout.rows}) {
    final c = cols ?? math.max(2, math.min(6, (math.sqrt(ids.length) * 1.3).ceil()));
    final r = math.max(1, (ids.length / c).ceil());
    return SeatingPlan(r, c, [for (var i = 0; i < r * c; i++) i < ids.length ? ids[i] : null], layout: layout);
  }

  int rows, cols;
  List<String?> seats;
  SeatLayout layout;

  /// Desk places the teacher moved in the custom layout (seat index → desk units).
  final Map<int, Offset> custom;

  /// Where seat [i] is, in desk units.
  List<Offset> get slots {
    final base = seatSlots(layout, seats.length, cols);
    if (layout != SeatLayout.custom) return base;
    return [for (var i = 0; i < base.length; i++) custom[i] ?? base[i]];
  }

  /// Seats from the front of the room to the back, left to right.
  List<int> get frontToBack {
    final s = slots;
    final order = List.generate(seats.length, (i) => i)..sort((a, b) => s[a].dy != s[b].dy ? s[a].dy.compareTo(s[b].dy) : s[a].dx.compareTo(s[b].dx));
    return order;
  }

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
    custom.clear();
  }

  /// Seats [ids] in order, front seat first.
  void seatInOrder(List<String> ids) {
    final order = frontToBack;
    final next = List<String?>.filled(seats.length, null);
    for (var i = 0; i < order.length && i < ids.length; i++) {
      next[order[i]] = ids[i];
    }
    seats = next;
  }

  /// Re-seats everyone by [mode]. [info] has genders and heights, [names] the names.
  void arrange(SeatArrange mode, Map<String, SeatInfo> info, Map<String, String> names, [math.Random? random]) {
    final ids = seats.whereType<String>().toList();
    switch (mode) {
      case SeatArrange.random:
        ids.shuffle(random ?? math.Random());
      case SeatArrange.alphabetical:
        ids.sort((a, b) => (names[a] ?? a).compareTo(names[b] ?? b));
      case SeatArrange.heightFront:
        // The shortest at the front; those without a height at the back.
        ids.sort((a, b) {
          final ha = info[a]?.heightCm, hb = info[b]?.heightCm;
          if (ha == null && hb == null) return 0;
          if (ha == null) return 1;
          if (hb == null) return -1;
          return ha.compareTo(hb);
        });
      case SeatArrange.genderMix:
        final boys = [
              for (final i in ids)
                if (info[i]?.gender == 'm') i,
            ],
            girls = [
              for (final i in ids)
                if (info[i]?.gender == 'f') i,
            ];
        final rest = [
          for (final i in ids)
            if (info[i]?.gender != 'm' && info[i]?.gender != 'f') i,
        ];
        ids.clear();
        while (boys.isNotEmpty || girls.isNotEmpty) {
          if (boys.isNotEmpty) ids.add(boys.removeAt(0));
          if (girls.isNotEmpty) ids.add(girls.removeAt(0));
        }
        ids.addAll(rest);
    }
    seatInOrder(ids);
  }

  /// `rows|cols|seats|layout|custom` ("i:x:y;...").
  String encode() =>
      '$rows|$cols|${seats.map((s) => s ?? '').join(',')}|${layout.name}|${custom.entries.map((e) => '${e.key}:${e.value.dx.toStringAsFixed(2)}:${e.value.dy.toStringAsFixed(2)}').join(';')}';

  static SeatingPlan? decode(String? s, Set<String> known) {
    final p = s?.split('|');
    if (p == null || p.length < 3) return null;
    final r = int.tryParse(p[0]), c = int.tryParse(p[1]);
    if (r == null || c == null) return null;
    final seats = [for (final id in p[2].split(',')) id.isEmpty || !known.contains(id) ? null : id];
    if (seats.length != r * c) return null;
    // Students who joined since: the first empty seats.
    final missing = known.difference(seats.whereType<String>().toSet()).toList();
    for (var i = 0; i < seats.length && missing.isNotEmpty; i++) {
      if (seats[i] == null) seats[i] = missing.removeAt(0);
    }
    final layout = p.length > 3 ? SeatLayout.values.where((l) => l.name == p[3]).firstOrNull ?? SeatLayout.rows : SeatLayout.rows;
    final custom = <int, Offset>{};
    if (p.length > 4 && p[4].isNotEmpty) {
      for (final e in p[4].split(';')) {
        final f = e.split(':');
        final i = int.tryParse(f[0]), x = f.length > 2 ? double.tryParse(f[1]) : null, y = f.length > 2 ? double.tryParse(f[2]) : null;
        if (i != null && x != null && y != null && i < seats.length) custom[i] = Offset(x, y);
      }
    }
    final plan = SeatingPlan(r, c, seats, layout: layout, custom: custom);
    if (missing.isNotEmpty) plan.resize(r + (missing.length / c).ceil(), c);
    return plan;
  }
}

FeatureStrings seatingStrings(BuildContext context) => FeatureStrings(boardLang(context), seatingStringTable);

const seatingStringTable = <String, Map<String, String>>{
  'en': {
    'layout': 'Layout',
    'rows': 'Rows',
    'pairs': 'Pairs',
    'groups': 'Groups of 4',
    'ushape': 'U shape',
    'custom': 'Custom',
    'rowsN': 'Rows: {n}',
    'colsN': 'Columns: {n}',
    'auto': 'Auto-arrange',
    'random': 'Random',
    'genderMix': 'Boys and girls mixed',
    'heightFront': 'Shortest at the front',
    'alphabetical': 'A to Z',
    'moveDesks': 'Move desks',
    'save': 'Save / print',
    'seatsFor': 'Seating plan: {n}',
    'groupN': 'Group {n}',
    'student': 'Student',
    'boy': 'Boy',
    'girl': 'Girl',
    'unknown': 'Not set',
    'height': 'Height (cm)',
    'done': 'Done',
    'hint': 'Drag a student to another seat to swap. Tap a student to set gender and height for auto-arrange.',
  },
  'hi': {
    'layout': 'नक्शा',
    'rows': 'पंक्तियाँ',
    'pairs': 'जोड़ियाँ',
    'groups': '4 के समूह',
    'ushape': 'U आकार',
    'custom': 'अपनी मर्ज़ी',
    'rowsN': 'पंक्तियाँ: {n}',
    'colsN': 'स्तंभ: {n}',
    'auto': 'अपने-आप बैठाएँ',
    'random': 'यादृच्छिक',
    'genderMix': 'लड़के-लड़कियाँ मिलाकर',
    'heightFront': 'छोटे कद वाले आगे',
    'alphabetical': 'अ से ज्ञ',
    'moveDesks': 'डेस्क हिलाएँ',
    'save': 'सहेजें / प्रिंट',
    'seatsFor': 'बैठक योजना: {n}',
    'groupN': 'समूह {n}',
    'student': 'विद्यार्थी',
    'boy': 'लड़का',
    'girl': 'लड़की',
    'unknown': 'तय नहीं',
    'height': 'कद (सेमी)',
    'done': 'हो गया',
    'hint': 'अदला-बदली के लिए विद्यार्थी को दूसरी सीट पर खींचें। लिंग और कद तय करने के लिए विद्यार्थी पर टैप करें।',
  },
  'kn': {
    'layout': 'ವಿನ್ಯಾಸ',
    'rows': 'ಸಾಲುಗಳು',
    'pairs': 'ಜೋಡಿಗಳು',
    'groups': '4ರ ಗುಂಪುಗಳು',
    'ushape': 'U ಆಕಾರ',
    'custom': 'ನನ್ನ ಇಷ್ಟ',
    'rowsN': 'ಸಾಲುಗಳು: {n}',
    'colsN': 'ಕಾಲಮ್‌ಗಳು: {n}',
    'auto': 'ತಾನಾಗಿ ಕೂರಿಸಿ',
    'random': 'ಯಾದೃಚ್ಛಿಕ',
    'genderMix': 'ಹುಡುಗ-ಹುಡುಗಿಯರು ಬೆರೆಸಿ',
    'heightFront': 'ಕಡಿಮೆ ಎತ್ತರ ಮುಂದೆ',
    'alphabetical': 'ಅ ದಿಂದ ಳ',
    'moveDesks': 'ಡೆಸ್ಕ್ ಸರಿಸಿ',
    'save': 'ಉಳಿಸಿ / ಮುದ್ರಿಸಿ',
    'seatsFor': 'ಆಸನ ಯೋಜನೆ: {n}',
    'groupN': 'ಗುಂಪು {n}',
    'student': 'ವಿದ್ಯಾರ್ಥಿ',
    'boy': 'ಹುಡುಗ',
    'girl': 'ಹುಡುಗಿ',
    'unknown': 'ಹೊಂದಿಸಿಲ್ಲ',
    'height': 'ಎತ್ತರ (ಸೆಂ.ಮೀ)',
    'done': 'ಆಯಿತು',
    'hint': 'ಅದಲು-ಬದಲಿಗೆ ವಿದ್ಯಾರ್ಥಿಯನ್ನು ಬೇರೆ ಆಸನಕ್ಕೆ ಎಳೆಯಿರಿ. ಲಿಂಗ ಮತ್ತು ಎತ್ತರ ಹೊಂದಿಸಲು ವಿದ್ಯಾರ್ಥಿಯ ಮೇಲೆ ಟ್ಯಾಪ್ ಮಾಡಿ.',
  },
};

/// Saves or prints the seating plan picture and list (tests replace it).
abstract final class SeatingShare {
  static Future<void> Function(String name, Uint8List bytes, String mime) share = (name, bytes, mime) => SharePlus.instance.share(
    ShareParams(
      files: [XFile.fromData(bytes, name: name, mimeType: mime)],
      fileNameOverrides: [name],
    ),
  );
}

/// The seating chart from the class roster: the board at the front, desks in rows, pairs,
/// groups of four, a U or wherever the teacher drags them; drag a student onto another desk
/// to swap, tap one to set gender and height, and auto-arrange by random, boys and girls
/// mixed, height or name. Kept on the board for each class; put on the board, saved or
/// printed (share sheet) as a picture and a list.
class SeatingChartPanel extends StatefulWidget {
  const SeatingChartPanel({super.key, required this.board, this.random, this.wb});

  final BoardController board;
  final math.Random? random;

  /// To put the plan on the board's page.
  final WhiteboardController? wb;

  @override
  State<SeatingChartPanel> createState() => SeatingChartPanelState();
}

class SeatingChartPanelState extends State<SeatingChartPanel> {
  late SeatingPlan plan;
  late Map<String, String> _names;
  Map<String, SeatInfo> info = {};
  bool _moving = false;
  final _shot = GlobalKey();

  String get _key => 'kinetix.seating.${classKey(widget.board)}';
  String get _infoKey => 'kinetix.seatinfo.${classKey(widget.board)}';

  @override
  void initState() {
    super.initState();
    final students = classStudents(widget.board);
    _names = {for (final s in students) s.$1: s.$2};
    plan = SeatingPlan.fill([for (final s in students) s.$1]);
    SharedPreferences.getInstance()
        .then((p) {
          final saved = SeatingPlan.decode(p.getString(_key), _names.keys.toSet());
          Map<String, SeatInfo> loaded = {};
          try {
            final raw = p.getString(_infoKey);
            if (raw != null) loaded = {for (final e in (jsonDecode(raw) as Map<String, dynamic>).entries) e.key: SeatInfo.fromJson(e.value as Map<String, dynamic>)};
          } catch (_) {}
          if (mounted) {
            setState(() {
              if (saved != null) plan = saved;
              info = loaded;
            });
          }
        })
        .catchError((_) {});
  }

  void _save() {
    final key = _key, value = plan.encode();
    final ik = _infoKey, iv = jsonEncode({for (final e in info.entries) e.key: e.value.toJson()});
    unawaited(
      SharedPreferences.getInstance()
          .then((p) async {
            await p.setString(key, value);
            await p.setString(ik, iv);
          })
          .catchError((_) {}),
    );
  }

  void swap(int a, int b) {
    setState(() => plan.swap(a, b));
    _save();
  }

  void setLayout(SeatLayout l) {
    setState(() {
      plan.layout = l;
      _moving = false;
      if (l == SeatLayout.groups && plan.cols < 4) plan.resize(plan.rows, 4);
    });
    _save();
  }

  void arrange(SeatArrange mode) {
    setState(() => plan.arrange(mode, info, _names, widget.random));
    _save();
  }

  Future<void> _edit(String id) async {
    final s = seatingStrings(context);
    final cur = info[id];
    final h = TextEditingController(text: cur?.heightCm?.toString() ?? '');
    String? gender = cur?.gender;
    await showDialog<void>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, set) => AlertDialog(
          key: const Key('seat-info-dialog'),
          title: Text(_names[id] ?? id),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Wrap(
                spacing: 8,
                children: [
                  for (final (g, label) in [('m', s['boy']), ('f', s['girl']), (null, s['unknown'])])
                    ChoiceChip(key: Key('seat-gender-${g ?? 'none'}'), label: Text(label), selected: gender == g, onSelected: (_) => set(() => gender = g)),
                ],
              ),
              const SizedBox(height: 12),
              TextField(
                key: const Key('seat-height'),
                controller: h,
                keyboardType: TextInputType.number,
                decoration: InputDecoration(labelText: s['height'], border: const OutlineInputBorder()),
              ),
            ],
          ),
          actions: [TextButton(key: const Key('seat-info-done'), onPressed: () => Navigator.pop(ctx), child: Text(s['done']))],
        ),
      ),
    );
    // The dialog is still fading out, so its text box may build once more: the field is not disposed.
    final cm = int.tryParse(h.text.trim());
    setState(() => info = {...info, id: SeatInfo(gender: gender, heightCm: cm != null && cm > 30 && cm < 250 ? cm : null)});
    _save();
  }

  /// The plan as a list: "Row 1: Asha, Ravi…" for saving.
  String listing() {
    final b = StringBuffer();
    final order = plan.frontToBack;
    var row = -1.0;
    final slots = plan.slots;
    for (final i in order) {
      if (slots[i].dy != row) {
        row = slots[i].dy;
        b.write(b.isEmpty ? '' : '\n');
        b.write('${row.toInt() + 1}: ');
      } else {
        b.write(', ');
      }
      b.write(plan.seats[i] == null ? '-' : _names[plan.seats[i]] ?? plan.seats[i]);
    }
    return b.toString();
  }

  Future<void> saveOrPrint() async {
    final boundary = _shot.currentContext?.findRenderObject() as RenderRepaintBoundary?;
    if (boundary == null) return;
    final image = await boundary.toImage(pixelRatio: 2);
    final data = await image.toByteData(format: ui.ImageByteFormat.png);
    if (data == null) return;
    await SeatingShare.share('KINETIX seating plan.png', data.buffer.asUint8List(), 'image/png');
  }

  void toBoard() {
    final wb = widget.wb;
    if (wb == null) return;
    final s = classroomStrings(context);
    final slots = plan.slots;
    const w = 150.0, h = 56.0;
    final els = <BoardElement>[NoteElement(id: newElementId(), rect: Rect.fromLTWH(0, 0, 400, 44), text: s['front'], color: const Color(0xFFAECBFA), kind: NoteKind.note)];
    for (var i = 0; i < plan.seats.length; i++) {
      final id = plan.seats[i];
      if (id == null) continue;
      els.add(
        NoteElement(id: newElementId(), rect: Rect.fromLTWH(slots[i].dx * (w + 14), 64 + slots[i].dy * (h + 14), w, h), text: _names[id] ?? id, color: const Color(0xFFFDD663), kind: NoteKind.note),
      );
    }
    wb.insert(els);
    showBoardMessage(context, s['onBoard']);
  }

  @override
  Widget build(BuildContext context) {
    final s = classroomStrings(context);
    final t = seatingStrings(context);
    final c = context.colors;
    String layoutName(SeatLayout l) => t[l.name];
    return Column(
      key: const Key('seating-panel'),
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // The hint and controls scroll away when the panel is short (a phone), so nothing overflows.
        Flexible(
          flex: 2,
          child: SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s8, Kx.s16, 0),
                  child: Text(t['hint'], style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant)),
                ),
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: Kx.s16, vertical: Kx.s8),
                  child: Row(
                    children: [
                      for (final l in SeatLayout.values)
                        Padding(
                          padding: const EdgeInsets.only(right: 6),
                          child: ChoiceChip(
                            key: Key('seating-layout-${l.name}'),
                            label: Text(layoutName(l)),
                            selected: plan.layout == l,
                            onSelected: (_) => setLayout(l),
                            visualDensity: VisualDensity.compact,
                          ),
                        ),
                    ],
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: Kx.s16),
                  child: Wrap(
                    spacing: Kx.s8,
                    runSpacing: Kx.s8,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: [
                      Text(t.n('colsN', plan.cols)),
                      IconButton.outlined(
                        key: const Key('seating-cols-minus'),
                        onPressed: plan.cols <= 2 ? null : () => setState(() => plan.resize(plan.rows, plan.cols - 1)),
                        icon: const Icon(Icons.remove),
                      ),
                      IconButton.outlined(
                        key: const Key('seating-cols-plus'),
                        onPressed: plan.cols >= 10 ? null : () => setState(() => plan.resize(plan.rows, plan.cols + 1)),
                        icon: const Icon(Icons.add),
                      ),
                      Text(t.n('rowsN', plan.rows)),
                      IconButton.outlined(
                        key: const Key('seating-rows-minus'),
                        onPressed: plan.rows <= 1 || plan.seats.length - plan.cols < plan.seats.whereType<String>().length ? null : () => setState(() => plan.resize(plan.rows - 1, plan.cols)),
                        icon: const Icon(Icons.remove),
                      ),
                      IconButton.outlined(
                        key: const Key('seating-rows-plus'),
                        onPressed: plan.rows >= 12 ? null : () => setState(() => plan.resize(plan.rows + 1, plan.cols)),
                        icon: const Icon(Icons.add),
                      ),
                      PopupMenuButton<SeatArrange>(
                        key: const Key('seating-auto'),
                        onSelected: arrange,
                        itemBuilder: (_) => [for (final m in SeatArrange.values) PopupMenuItem(key: Key('seating-auto-${m.name}'), value: m, child: Text(t[m.name]))],
                        child: IgnorePointer(
                          child: OutlinedButton.icon(onPressed: () {}, icon: const Icon(Icons.auto_fix_high), label: Text(t['auto'])),
                        ),
                      ),
                      OutlinedButton.icon(key: const Key('seating-shuffle'), onPressed: () => arrange(SeatArrange.random), icon: const Icon(Icons.shuffle), label: Text(s['shuffle'])),
                      OutlinedButton.icon(key: const Key('seating-az'), onPressed: () => arrange(SeatArrange.alphabetical), icon: const Icon(Icons.sort_by_alpha), label: Text(s['alphabetical'])),
                      if (plan.layout == SeatLayout.custom) FilterChip(key: const Key('seating-move'), label: Text(t['moveDesks']), selected: _moving, onSelected: (v) => setState(() => _moving = v)),
                      OutlinedButton.icon(key: const Key('seating-save'), onPressed: () => unawaited(saveOrPrint()), icon: const Icon(Icons.print_outlined), label: Text(t['save'])),
                      if (widget.wb != null) FilledButton.tonalIcon(key: const Key('seating-to-board'), onPressed: toBoard, icon: const Icon(Icons.open_in_new), label: Text(s['toBoard'])),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
        Expanded(
          flex: 3,
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(Kx.s16),
            child: RepaintBoundary(
              key: _shot,
              child: Container(
                color: c.surface,
                padding: const EdgeInsets.all(Kx.s8),
                child: Column(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(Kx.s8),
                      decoration: BoxDecoration(color: c.inverseSurface, borderRadius: Kx.radiusSm),
                      alignment: Alignment.center,
                      child: Text(
                        s['front'],
                        style: TextStyle(color: c.onInverseSurface, fontWeight: FontWeight.w700),
                      ),
                    ),
                    const SizedBox(height: Kx.s8),
                    _canvas(context, s, t),
                  ],
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _canvas(BuildContext context, FeatureStrings s, FeatureStrings t) {
    final slots = plan.slots;
    var maxX = 0.0, maxY = 0.0;
    for (final o in slots) {
      maxX = math.max(maxX, o.dx);
      maxY = math.max(maxY, o.dy);
    }
    return LayoutBuilder(
      builder: (context, box) {
        final avail = box.maxWidth.isFinite ? box.maxWidth : 600.0;
        final unit = (avail / (maxX + 1.2)).clamp(70.0, 150.0);
        final deskW = unit - 8, deskH = 60.0, rowStep = deskH + 10;
        final width = (maxX + 1) * unit + 8, height = (maxY) * rowStep + deskH + 8;
        final inner = <Widget>[];
        if (plan.layout == SeatLayout.groups) {
          for (var g = 0; g < (plan.seats.length / 4).ceil(); g++) {
            final first = slots[g * 4];
            inner.add(
              Positioned(
                left: first.dx * unit - 6,
                top: first.dy * rowStep - 4,
                width: 2 * unit + 4,
                height: 2 * rowStep + 8,
                child: IgnorePointer(
                  child: Container(
                    alignment: Alignment.center,
                    decoration: BoxDecoration(color: context.colors.tertiaryContainer.withValues(alpha: 0.35), borderRadius: Kx.radiusMd),
                    child: Text(t.n('groupN', g + 1), style: TextStyle(color: context.colors.onSurfaceVariant, fontSize: 11)),
                  ),
                ),
              ),
            );
          }
        }
        for (var i = 0; i < plan.seats.length; i++) {
          final id = plan.seats[i];
          final pos = Offset(slots[i].dx * unit, slots[i].dy * rowStep);
          inner.add(Positioned(left: pos.dx, top: pos.dy, width: deskW, height: deskH, child: _seat(context, s, i, id, deskW, deskH, unit, rowStep)));
        }
        return SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: SizedBox(
            width: math.max(width, avail),
            height: height,
            child: Stack(clipBehavior: Clip.none, children: inner),
          ),
        );
      },
    );
  }

  Widget _seat(BuildContext context, FeatureStrings s, int i, String? id, double w, double h, double unit, double rowStep) {
    final moveMode = plan.layout == SeatLayout.custom && _moving;
    Widget desk(bool highlight) {
      final name = id == null ? null : _names[id] ?? id;
      final gender = id == null ? null : info[id]?.gender;
      return Stack(
        children: [
          Positioned.fill(
            child: _Desk(name: name, empty: s['empty'], highlight: highlight, accent: gender == 'm' ? const Color(0xFF8AB4F8) : (gender == 'f' ? const Color(0xFFF6AEC7) : null)),
          ),
        ],
      );
    }

    if (moveMode) {
      return GestureDetector(
        key: Key('seat-$i'),
        onPanUpdate: (d) => setState(() {
          final cur = plan.slots[i];
          plan.custom[i] = Offset(math.max(0, cur.dx + d.delta.dx / unit), math.max(0, cur.dy + d.delta.dy / rowStep));
        }),
        onPanEnd: (_) => _save(),
        child: desk(false),
      );
    }
    return DragTarget<int>(
      onWillAcceptWithDetails: (d) => d.data != i,
      onAcceptWithDetails: (d) => swap(d.data, i),
      builder: (context, hover, _) {
        final d = desk(hover.isNotEmpty);
        if (id == null) return KeyedSubtree(key: Key('seat-$i'), child: d);
        return LongPressDraggable<int>(
          key: Key('seat-$i'),
          data: i,
          delay: const Duration(milliseconds: 150),
          feedback: SizedBox(
            width: w,
            height: h,
            child: Material(
              color: Colors.transparent,
              child: _Desk(name: _names[id] ?? id, empty: '', highlight: true),
            ),
          ),
          childWhenDragging: Opacity(opacity: 0.35, child: d),
          child: GestureDetector(key: Key('seat-tap-$i'), onTap: () => unawaited(_edit(id)), child: d),
        );
      },
    );
  }
}

class _Desk extends StatelessWidget {
  const _Desk({required this.name, required this.empty, required this.highlight, this.accent});
  final String? name;
  final String empty;
  final bool highlight;

  /// A colour for the desk's edge by gender (blue, pink), when known.
  final Color? accent;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Container(
      alignment: Alignment.center,
      padding: const EdgeInsets.symmetric(horizontal: 6),
      decoration: BoxDecoration(
        color: highlight ? c.primaryContainer : (name == null ? c.surfaceContainerLow : c.secondaryContainer),
        borderRadius: Kx.radiusMd,
        border: Border.all(color: highlight ? c.primary : (accent ?? c.outlineVariant), width: highlight || accent != null ? 2 : 1),
      ),
      child: Text(
        name ?? empty,
        maxLines: 2,
        overflow: TextOverflow.ellipsis,
        textAlign: TextAlign.center,
        style: TextStyle(color: name == null ? c.onSurfaceVariant : c.onSecondaryContainer, fontWeight: FontWeight.w600),
      ),
    );
  }
}

// Drives the real ZYNETIX Board under flutter_test like a teacher with a stylus, and streams
// every frame (30 fps of app time) plus the stylus position to the compositor.
//
// Copied into apps/board/test/ only while capturing (see ../README in SCRIPT.md), deleted after.
// Output: OUT (a FIFO) gets, per frame, a 512-byte JSON header then 1920x1080 RGBA; a header with
// "nb":0 carries an event without a frame (a chapter card). PREVIEW=dir writes small PNGs instead.
import 'dart:convert';
import 'dart:io';
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:zynetix_ink/zynetix_ink.dart';

const fps = 30;
const frameDt = Duration(microseconds: 33333);
const headerBytes = 512;

class Director {
  Director(this.t, this.rk, {required this.vo, this.words = const {}, this.voText = const {}, this.outPath, this.previewDir}) {
    if (outPath != null) _out = File(outPath!).openSync(mode: FileMode.writeOnly);
  }

  final WidgetTester t;
  final GlobalKey rk;
  final Map<String, double> vo;

  /// Word timings of each VO clip ([word, start, end] in seconds, from tools/words.py) and the
  /// VO text (for a proportional estimate when a word is not found).
  final Map<String, List<dynamic>> words;
  final Map<String, String> voText;
  double _cueAt = 0;
  final String? outPath, previewDir;
  RandomAccessFile? _out;
  final log = StringBuffer();
  final _rng = math.Random(5);

  int frame = 0;
  Offset pen = const Offset(1500, 760);
  double h = 1.0; // stylus height: 0 = touching the glass, 1 = lifted well away
  bool visible = true;
  TestGesture? _g;
  bool _down = false;
  final _events = <Map<String, Object?>>[];

  String? _seg;
  int _segStart = 0;
  bool _afterCard = false;

  // ---------------------------------------------------------------- frames

  Future<void> emit([int n = 1]) async {
    for (var i = 0; i < n; i++) {
      await t.pump(frameDt);
      frame++;
      final head = <String, Object?>{'f': frame, 'x': pen.dx.round(), 'y': pen.dy.round(), 'h': double.parse(h.toStringAsFixed(3)), 'v': visible ? 1 : 0, 'seg': _seg};
      if (_events.isNotEmpty) {
        head['ev'] = List.of(_events);
        _events.clear();
      }
      if (_out != null) {
        final bytes = await t.runAsync(() async {
          final ro = rk.currentContext!.findRenderObject()! as dynamic;
          final ui.Image img = await ro.toImage(pixelRatio: 1.0);
          final d = await img.toByteData(format: ui.ImageByteFormat.rawRgba);
          img.dispose();
          return d!.buffer.asUint8List();
        });
        _writeHeader(head, bytes!.length);
        _out!.writeFromSync(bytes);
      } else if (previewDir != null && (frame % 45 == 0 || head['ev'] != null && (head['ev'] as List).any((e) => (e as Map).containsKey('seg')))) {
        final png = await t.runAsync(() async {
          final ro = rk.currentContext!.findRenderObject()! as dynamic;
          final ui.Image img = await ro.toImage(pixelRatio: 0.3);
          final d = await img.toByteData(format: ui.ImageByteFormat.png);
          img.dispose();
          return d!.buffer.asUint8List();
        });
        try { File('$previewDir/${frame.toString().padLeft(5, '0')}_${_seg ?? 'x'}_${pen.dx.round()}_${pen.dy.round()}_${(h * 100).round()}.png').writeAsBytesSync(png!); } catch (_) {}
      }
    }
  }

  void _writeHeader(Map<String, Object?> head, int nb) {
    head['nb'] = nb;
    final s = utf8.encode(jsonEncode(head));
    if (s.length > headerBytes) throw StateError('header too long: ${s.length}');
    final buf = List<int>.filled(headerBytes, 32)..setRange(0, s.length, s);
    _out?.writeFromSync(buf);
  }

  /// App time passes but no frames are recorded (a cut over a wait).
  Future<void> skip(double seconds) async {
    final n = (seconds * fps).round();
    for (var i = 0; i < n; i++) {
      await t.pump(frameDt);
    }
  }

  /// App time passes [factor]x faster than the video (a speed ramp over a wait).
  Future<void> ramp(double seconds, double factor) async {
    final n = (seconds * fps / factor).round();
    for (var i = 0; i < n; i++) {
      for (var k = 1; k < factor.round(); k++) {
        await t.pump(frameDt);
      }
      await emit();
    }
  }

  void ev(Map<String, Object?> e) => _events.add(e);

  // ---------------------------------------------------------------- v3 beats
  // The capture runs at a natural pace; each beat marks its acts (the frame where the board
  // visibly changes) and the editor time-warps the clip so every act lands on its anchor word.

  String? beatId;
  Map<String, Object?>? _pendingAct;
  int _actN = 0;

  Future<void> beatStart(String id) async {
    beatId = id;
    _actN = 0;
    ev({'beat': id});
    log.writeln('beat $id at $frame');
  }

  Map<String, Object?> _act(String kind, Rect? r, String? label) => {
        'act': _actN++,
        'kind': kind,
        'beatOf': beatId,
        if (r != null) 'rect': [r.left.round(), r.top.round(), r.width.round(), r.height.round()],
        if (label != null) 'label': label,
      };

  /// The next stylus contact (tap, stroke, drag) is this beat's next act.
  void actOnPress({Rect? rect, String? label, String kind = 'act'}) => _pendingAct = _act(kind, rect, label);

  /// The next frame is this beat's next act (a change not caused by a press: an answer arriving).
  void actNow({Rect? rect, String? label, String kind = 'act'}) => ev(_act(kind, rect, label)..['now'] = true);

  /// A spotlight act on [rect] (the editor times the overlay to its word).
  void hlAct(Rect? rect, {String? label}) => ev(_act('hl', rect, label));

  /// A montage tile: [rect] is the area the tile shows; the next press is its act.
  void tileOnPress(Rect rect, {String? label}) => _pendingAct = _act('tile', rect, label);
  void tileNow(Rect rect, {String? label}) => ev(_act('tile', rect, label)..['now'] = true);

  Future<void> beatEnd({double settle = 1.4, Offset? rest}) async {
    if (_pendingAct != null) {
      ev(_pendingAct!);
      _pendingAct = null;
      log.writeln('act without press in $beatId');
    }
    await idle(settle, rest: rest);
    ev({'beatEnd': beatId});
    log.writeln('beatEnd $beatId at $frame acts $_actN');
  }

  /// A still for the hook/recap (the editor keeps this frame).
  void snap(String name) => ev({'snap': name});

  // ---------------------------------------------------------------- script structure

  /// Between chapters (hidden by the title card): closes leftover dialogs, popovers, panels
  /// and instruments so each chapter starts from a clean board.
  Future<void> chapter(int n, String title) async {
    if (_seg != null) await endSeg();
    final navs = find.byType(Navigator);
    if (navs.evaluate().isNotEmpty) t.state<NavigatorState>(navs.first).popUntil((r) => r.isFirst);
    await t.pump(frameDt);
    final c = find.byType(WhiteboardCanvas);
    if (c.evaluate().isNotEmpty) {
      final wb = t.widget<WhiteboardCanvas>(c.first).controller;
      wb.geoTools.value = const [];
      if (wb.protractor.value.visible) wb.toggleProtractor();
      wb.clearSelection();
    }
    for (final k in ['panel-close', 'zones-end', 'spotlight-end', 'magnifier-close', 'captions-stop']) {
      final f = find.byKey(Key(k)).hitTestable();
      if (f.evaluate().isNotEmpty) {
        await t.tap(f.first, warnIfMissed: false);
        await t.pump(frameDt);
      }
    }
    await skip(0.4);
    card(n, title);
  }

  /// A chapter title card (rendered by the compositor, 1.2 s).
  void card(int n, String title) {
    if (_out != null) _writeHeader({'card': title, 'num': n, 'frames': 33}, 0);
    log.writeln('card $n $title at $frame');
    _afterCard = true;
  }

  /// The closing card with the last line of voice-over (rendered by the compositor).
  void endCard(double voSeconds) {
    if (_out != null) _writeHeader({'endcard': 'ZYNETIX Board', 'seg': 's112', 'frames': ((voSeconds + 2.2) * fps).round()}, 0);
    log.writeln('endcard at $frame');
  }

  Future<void> seg(String id) async {
    if (_seg != null) await endSeg();
    _seg = id;
    _segStart = frame;
    _cueAt = 0;
    ev({'seg': id, 'afterCard': _afterCard, 'voOff': voStart - frame});
    log.writeln('seg $id at $frame');
  }

  /// Frame at which this segment's voice-over starts (it leads the action by 0.2 s; after a
  /// chapter card it starts during the card).
  int get voStart => _segStart + ((_afterCard ? -0.5 : preroll) * fps).round();
  double preroll = 0.5;

  /// Seconds into the current segment's voice-over where [word] (the [nth] match after the last
  /// cue) is spoken.
  double wordTime(String word, {int nth = 0}) {
    final id = _seg!;
    final key = word.toLowerCase();
    final list = words[id] ?? const [];
    var n = nth;
    for (final w in list) {
      final text = ((w as List)[0] as String).toLowerCase().replaceAll(RegExp(r"[^a-z0-9'-]"), '');
      final st = (w[1] as num).toDouble();
      if (st + 0.01 < _cueAt) continue;
      final k4 = key.length >= 5 ? key.substring(0, 4) : key;
      if (text.startsWith(key) || key.startsWith(text) && text.length >= 3 || key.length >= 5 && text.startsWith(k4)) {
        if (n-- == 0) return st;
      }
    }
    final vt = (voText[id] ?? '').toLowerCase();
    final i = vt.indexOf(key);
    log.writeln('word "$word" not timed in $id, estimating');
    return i < 0 ? _cueAt : (vo[id] ?? 1) * i / vt.length;
  }

  /// Waits (stylus resting) until [lead] seconds before [word] is spoken, so the action it starts
  /// lands on the word. [title] shows a kinetic feature title on the word.
  Future<void> at(String word, {double lead = 0.45, int nth = 0, String? title}) async {
    final w = wordTime(word, nth: nth);
    _cueAt = w;
    final target = voStart + ((w - lead) * fps).round();
    if (frame < target) {
      await idle((target - frame) / fps);
    } else if (frame - target > 12) {
      log.writeln('LATE "$word" in $_seg by ${((frame - target) / fps).toStringAsFixed(1)}s');
    }
    if (title != null) ev({'title': title, 'in': math.max(0, voStart + (w * fps).round() - frame)});
  }

  /// Spotlight + camera on [r] (board coordinates) for [seconds], with an optional label.
  void hl(Rect r, {String? label, double seconds = 2.2, bool zoom = true}) =>
      ev({'hl': [r.left.round(), r.top.round(), r.width.round(), r.height.round()], 'dur': (seconds * fps).round(), if (label != null) 'label': label, 'zoom': zoom});

  /// Spotlights the widget found by [f] (if present).
  void hlFinder(Finder f, {String? label, double seconds = 2.2, bool zoom = true, double pad = 8}) {
    if (f.evaluate().isEmpty) {
      log.writeln('no widget to highlight ($label) in ${_seg ?? '-'}');
      return;
    }
    hl(t.getRect(f.first).inflate(pad), label: label, seconds: seconds, zoom: zoom);
  }

  void hlKey(String key, {String? label, double seconds = 2.2, bool zoom = true}) => hlFinder(find.byKey(Key(key)), label: label, seconds: seconds, zoom: zoom);

  /// Camera framing (no spotlight) on [r] for [seconds]; the camera eases back to the full board after.
  void focus(Rect r, {double seconds = 3}) => ev({'focus': [r.left.round(), r.top.round(), r.width.round(), r.height.round()], 'dur': (seconds * fps).round()});

  /// A pill in the side stack (a quick list), on the word.
  void chip(String text) => ev({'chip': text});

  /// Holds (stylus resting) until the segment is as long as its voice-over.
  Future<void> endSeg({Offset? rest}) async {
    final id = _seg;
    if (id == null) return;
    final need = voStart - _segStart + (((vo[id] ?? 2) + 0.2) * fps).round();
    final have = frame - _segStart;
    if (have < need) {
      await idle((need - have) / fps, rest: rest);
    } else if (have > need + 30) {
      log.writeln('LONG $id by ${((have - need) / fps).toStringAsFixed(1)}s');
    }
    _afterCard = false;
    _seg = null;
  }

  Future<void> finish() async {
    await endSeg();
    if (_out != null) {
      _writeHeader({'end': true}, 0);
      _out!.closeSync();
    }
  }

  // ---------------------------------------------------------------- stylus

  Future<TestGesture> _gesture() async {
    _g ??= await t.createGesture(kind: PointerDeviceKind.stylus, pointer: 7);
    return _g!;
  }

  double _ease(double s) => s < 0.5 ? 4 * s * s * s : 1 - math.pow(-2 * s + 2, 3) / 2;

  /// Moves the stylus through the air to [to].
  Future<void> air(Offset to, {double? ms, double hEnd = 0.18, double arc = 0.45}) async {
    final from = pen;
    final h0 = h;
    final dist = (to - from).distance;
    final dur = ms ?? (170 + dist * 0.22).clamp(170, 560).toDouble();
    final n = math.max(1, (dur / 1000 * fps).round());
    final perp = dist < 1 ? Offset.zero : Offset(-(to - from).dy, (to - from).dx) / dist * (dist * 0.08 * (_rng.nextBool() ? 1 : -1));
    for (var i = 1; i <= n; i++) {
      final s = _ease(i / n);
      final p = Offset.lerp(from, to, s)! + perp * math.sin(math.pi * s);
      pen = p;
      h = h0 + (hEnd - h0) * s + arc * math.min(1.0, dist / 700) * math.sin(math.pi * s);
      await _hover(p);
      await emit();
    }
  }

  Future<void> _hover(Offset p) async {
    // Hover events reach the canvas (its pen cursor) like a real stylus in range.
    final g = await _gesture();
    if (!_down) await g.moveTo(p);
  }

  Future<void> _press(Offset p) async {
    final g = await _gesture();
    if (_pendingAct != null) {
      ev(_pendingAct!);
      _pendingAct = null;
    }
    await g.down(p);
    _down = true;
    pen = p;
    h = 0;
  }

  Future<void> _lift() async {
    await _g!.up();
    _down = false;
  }

  /// Taps at [p] with the stylus tip (approach, contact, ripple, lift).
  Future<void> tapAt(Offset p, {bool hold = false}) async {
    await air(p, hEnd: 0.05);
    await _press(p);
    ev({'tap': [p.dx.round(), p.dy.round()]});
    await emit(hold ? 18 : 2);
    await _lift();
    for (final hh in [0.08, 0.16]) {
      h = hh;
      await emit();
    }
  }

  Finder? find1(String key) {
    final f = find.byKey(Key(key));
    if (f.evaluate().isEmpty) {
      log.writeln('MISSING $key in ${_seg ?? '-'}');
      return null;
    }
    return f.first;
  }

  Future<bool> tapKey(String key, {Offset offset = Offset.zero, bool hold = false, bool visibleFirst = true}) async {
    final f = find1(key);
    if (f == null) return false;
    return tapFinder(f, offset: offset, hold: hold, visibleFirst: visibleFirst);
  }

  Future<bool> tapText(String text, {int index = 0}) async {
    final f = find.text(text).hitTestable();
    if (f.evaluate().length <= index) {
      log.writeln('MISSING text "$text" in ${_seg ?? '-'}');
      return false;
    }
    return tapFinder(f.at(index));
  }

  Future<bool> tapFinder(Finder f, {Offset offset = Offset.zero, bool hold = false, bool visibleFirst = true}) async {
    if (visibleFirst) {
      try {
        await t.ensureVisible(f);
        await t.pump();
      } catch (_) {}
    }
    final c = t.getCenter(f) + offset;
    await tapAt(c, hold: hold);
    return true;
  }

  Offset? centerOf(String key) {
    final f = find1(key);
    return f == null ? null : t.getCenter(f);
  }

  Rect? rectOf(String key) {
    final f = find1(key);
    return f == null ? null : t.getRect(f);
  }

  /// Rests the stylus: a hovering hand, drifting a little, optionally gliding to [rest].
  Future<void> idle(double seconds, {Offset? rest}) async {
    var n = (seconds * fps).round();
    if (rest != null && n > 10) {
      final k = math.min(n ~/ 2, 18);
      await air(rest, ms: k * 1000 / fps, hEnd: 0.32, arc: 0.2);
      n -= k;
    }
    final base = pen;
    final h0 = h;
    final ph = _rng.nextDouble() * 6;
    for (var i = 0; i < n; i++) {
      final s = i / fps;
      pen = base + Offset(5 * math.sin(s * 0.9 + ph) + 2 * math.sin(s * 2.3), 4 * math.sin(s * 0.7 + ph * 2) + 1.5 * math.cos(s * 1.9));
      h = h0 + (0.3 - h0) * math.min(1.0, i / 12);
      await _hover(pen);
      await emit();
    }
  }

  /// Points at something while the voice explains it.
  Future<void> point(Offset p, {double seconds = 0}) async {
    await air(p, hEnd: 0.22, arc: 0.3);
    if (seconds > 0) await idle(seconds);
  }

  /// One stroke in contact with the glass: [pts] with their times in ms from the stroke start.
  Future<void> stroke(List<(Offset, double)> pts) async {
    await air(pts.first.$1, hEnd: 0.04, arc: 0.12);
    await _press(pts.first.$1);
    var tNext = 1000 / fps;
    var i = 1;
    while (i < pts.length) {
      while (i < pts.length && pts[i].$2 <= tNext) {
        pen = pts[i].$1;
        await _g!.moveTo(pen);
        i++;
      }
      await emit();
      tNext += 1000 / fps;
    }
    await _lift();
    h = 0.05;
  }

  /// A straight or curved contact drag through [path] taking [ms].
  Future<void> drag(List<Offset> path, double ms, {double holdMs = 0}) async {
    final pts = <(Offset, double)>[];
    var total = 0.0;
    final segs = <double>[];
    for (var i = 1; i < path.length; i++) {
      final d = (path[i] - path[i - 1]).distance;
      segs.add(d);
      total += d;
    }
    pts.add((path.first, 0));
    if (holdMs > 0) pts.add((path.first, holdMs));
    final steps = math.max(2, (ms / 8).round());
    for (var k = 1; k <= steps; k++) {
      final s = _ease(k / steps) * total;
      var acc = 0.0, j = 0;
      while (j < segs.length - 1 && acc + segs[j] < s) {
        acc += segs[j];
        j++;
      }
      final u = segs[j] == 0 ? 0.0 : ((s - acc) / segs[j]).clamp(0.0, 1.0);
      pts.add((Offset.lerp(path[j], path[j + 1], u)!, holdMs + k / steps * ms));
    }
    await stroke(pts);
  }

  /// Writes a phrase from data/hand.json at [origin] (top-left of the font box) with font
  /// height [size] px.
  Future<void> write(Map<String, dynamic> hand, String id, Offset origin, double size, {double speed = 1}) async {
    final p = hand[id] as Map<String, dynamic>;
    final strokes = p['strokes'] as List;
    double? t0;
    for (final s in strokes) {
      final pts = <(Offset, double)>[];
      for (final q in s as List) {
        final x = (q[0] as num).toDouble(), y = (q[1] as num).toDouble(), ms = (q[2] as num).toDouble();
        t0 ??= ms;
        pts.add((origin + Offset(x * size, (y + 1) * size), ms));
      }
      final start = pts.first.$2;
      final rel = [for (final e in pts) (e.$1, (e.$2 - start) / speed)];
      // The pen-up gap before this stroke is replaced by an air move of similar length.
      await stroke(rel);
    }
  }

  /// Types into a field the way the on-screen keyboard would, a few characters per frame.
  Future<void> type(Finder field, String text, {int charsPerFrame = 2}) async {
    for (var i = charsPerFrame; i < text.length + charsPerFrame; i += charsPerFrame) {
      await t.enterText(field, text.substring(0, math.min(i, text.length)));
      await emit();
    }
  }

  // ---------------------------------------------------------------- compositor hints

  void callout(String text, Rect target, {double seconds = 2.5}) =>
      ev({'callout': text, 'rect': [target.left.round(), target.top.round(), target.width.round(), target.height.round()], 'dur': (seconds * fps).round()});

  void zoom(Rect r, {double seconds = 3}) => ev({'zoom': [r.left.round(), r.top.round(), r.width.round(), r.height.round()], 'dur': (seconds * fps).round()});
}

extension DirectorUi on Director {
  /// Closes a dialog with its close button (or a tap outside it).
  Future<void> closeDialog() async {
    final dlg = find.byType(Dialog);
    if (dlg.evaluate().isEmpty) {
      final c = find.text('Close').hitTestable();
      if (c.evaluate().isNotEmpty) {
        await tapFinder(c.first);
        await emit(6);
      }
      return;
    }
    final close = find.descendant(of: dlg.first, matching: find.byIcon(Icons.close));
    if (close.evaluate().isNotEmpty) {
      await tapFinder(close.first);
    } else {
      await t.sendKeyEvent(LogicalKeyboardKey.escape);
    }
    await emit(8);
  }

  /// Opens a tile of the tools drawer, scrolling the drawer with the stylus until it is built.
  /// Opens the tools drawer (once), optionally on a subject filter.
  Future<bool> openDrawer({String? filter}) async {
    final drawer = find.byKey(const Key('tools-drawer'));
    for (var i = 0; i < 2 && drawer.evaluate().isEmpty; i++) {
      await tapKey('tool-tools');
      await emit(4);
    }
    if (drawer.evaluate().isEmpty) {
      log.writeln('no drawer in ${_seg ?? '-'}');
      return false;
    }
    if (filter != null && find.byKey(Key('drawer-filter-$filter')).evaluate().isNotEmpty) {
      await tapKey('drawer-filter-$filter');
      await emit(3);
    }
    return true;
  }

  static const _search = {
    'read-aloud': 'immersive', 'toolkit-curtain': 'shade', 'toolkit-spotlight': 'spotlight', 'touch-lock': 'touch lock',
    'live-captions': 'captions', 'group-maker': 'group', 'ask-class': 'ask the', 'todays-plan': 'plan', 'voice-commands': 'voice',
    'toolkit-picker': 'random', 'toolkit-timer': 'timer', 'seating-chart': 'seating',
  };

  /// Opens a tile of the tools drawer: on screen already, or found with the drawer's search box
  /// (typed with the on-screen keyboard), which is how a teacher finds a tool fast.
  Future<bool> drawerTool(String id, {String? filter}) async {
    if (!await drawerFind(id, filter: filter)) return false;
    return tapKey('drawer-$id');
  }

  /// Opens the drawer and brings tile [id] into view (search box, then scrolling) without tapping it.
  Future<bool> drawerFind(String id, {String? filter}) async {
    if (!await openDrawer(filter: filter)) return false;
    final k = find.byKey(Key('drawer-$id'));
    if (k.hitTestable().evaluate().isEmpty) {
      final field = find.descendant(of: find.byKey(const Key('tools-search')), matching: find.byType(TextField));
      final f = field.evaluate().isNotEmpty ? field : find.byKey(const Key('tools-search'));
      if (f.evaluate().isNotEmpty) {
        await tapFinder(f.first);
        await type(f.first, _search[id] ?? id.split('-').last, charsPerFrame: 3);
        await emit(2);
      }
    }
    for (var i = 0; i < 4 && k.hitTestable().evaluate().isEmpty; i++) {
      final r = t.getRect(find.byKey(const Key('tools-drawer')));
      await drag([r.center + Offset(0, r.height * 0.3), r.center - Offset(0, r.height * 0.3)], 320);
      await emit(2);
    }
    return k.hitTestable().evaluate().isNotEmpty;
  }

  /// Shows tab [name] of the side panel (opening the panel if needed).
  Future<void> panelTab(String name) async {
    if (find.byKey(const Key('split-panel')).evaluate().isEmpty) {
      await tapKey('panel-ai');
      await emit(10);
    }
    final tab = find.byKey(Key('panel-tab-$name'));
    if (tab.evaluate().isEmpty) return;
    await t.ensureVisible(tab);
    await emit(3);
    await tapFinder(tab, visibleFirst: false);
    await emit(3);
  }

  /// Opens drawer tool [id] so that it appears as [word] is spoken: the drawer and its search are
  /// prepared beforehand, the tile is tapped on the word.
  Future<void> toolOnWord(String word, String id, {String? filter, String? title, double prep = 2.0}) async {
    await at(word, lead: prep);
    await drawerFind(id, filter: filter);
    await at(word, lead: 0.4, title: title);
    await tapKey('drawer-$id');
    await emit(2);
  }

  /// Shows the AI tab of the side panel (opening the panel if needed).
  Future<void> aiTab() async {
    if (find.byKey(const Key('split-panel')).evaluate().isEmpty) {
      await tapKey('panel-ai');
      await emit(10);
    }
    if (find.byKey(const Key('ai-ask')).hitTestable().evaluate().isEmpty) {
      final tab = find.byKey(const Key('panel-tab-ai'));
      if (tab.evaluate().isNotEmpty) {
        await t.ensureVisible(tab);
        await emit(3);
        await tapFinder(tab, visibleFirst: false);
        await emit(3);
      }
    }
    for (var i = 0; i < 3 && find.byKey(const Key('ai-tool-homework')).hitTestable().evaluate().isEmpty && find.byKey(const Key('panel-back')).hitTestable().evaluate().isNotEmpty; i++) {
      await tapKey('panel-back');
      await emit(2);
    }
  }

  /// A kinetic feature title on [word] without waiting for it.
  void titleAt(String word, String title, {int nth = 0}) {
    final w = wordTime(word, nth: nth);
    ev({'title': title, 'in': math.max(0, voStart + (w * fps).round() - frame)});
  }

  /// Taps outside an open popover (its barrier) to close it.
  Future<void> dismissPopover() async {
    final b = find.byKey(const Key('popover-barrier'));
    if (b.evaluate().isNotEmpty) {
      await tapAt(const Offset(1250, 860));
      await emit(5);
    }
    if (find.byKey(const Key('pen-popover')).evaluate().isNotEmpty) {
      await t.sendKeyEvent(LogicalKeyboardKey.escape);
      await emit(3);
    }
    if (find.byKey(const Key('pen-popover')).evaluate().isNotEmpty) log.writeln('pen popover stuck in ${_seg ?? '-'}');
  }

  /// Draws a shape from the Shapes menu by dragging the stylus.
  Future<void> shape(String kind, Offset a, Offset b) async {
    await tapKey('tool-shapes');
    await emit(3);
    if (find.byKey(Key('shape-$kind')).evaluate().isEmpty) await tapKey('tool-shapes');
    await emit(2);
    await tapKey('shape-$kind');
    await emit(3);
    await dismissPopover();
    await drag([a, b], 420);
    await emit(2);
    _clearSelection();
  }

  /// Another shape of the kind already chosen.
  Future<void> shapeAgain(Offset a, Offset b) async {
    await drag([a, b], 420);
    await emit(2);
    _clearSelection();
  }

  void clearSel() => _clearSelection();

  void _clearSelection() {
    final c = find.byType(WhiteboardCanvas);
    if (c.evaluate().isNotEmpty) t.widget<WhiteboardCanvas>(c.first).controller.clearSelection();
  }

  /// Closes a floating tool (protractor, ruler, timer…) with its close icon.
  Future<void> closeOverlayTool() async {
    final close = find.byIcon(Icons.close);
    if (close.evaluate().isEmpty) return;
    await tapFinder(close.last);
    await emit(6);
  }
}

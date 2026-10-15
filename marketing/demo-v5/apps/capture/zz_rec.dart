// Phone screen recorder for the Zynetix mobile apps under flutter_test.
//
// Copied into apps/<app>/test/ only while capturing (tools/capture_apps.sh), deleted after.
// The app runs on a 390x844 pt phone (3x, iPhone 14-like insets) and every frame (30 fps of app
// time) is rendered with RepaintBoundary.toImage and written as raw RGBA to OUT (a FIFO read by
// ffmpeg). Touches are real pointer events; an iOS "show touches"-style dot is drawn above the app.
//
// Env: OUT (raw RGBA sink; unset = dry run), META (clip json path), PR (pixel ratio, default 3),
//      PREVIEW (dir: small PNGs at marks and every 2 s, for checking without encoding).
import 'dart:convert';
import 'dart:io';
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

const fps = 30;
const frameDt = Duration(microseconds: 33333);
const phoneSize = Size(390, 844);
const padTop = 47.0, padBottom = 34.0;

final _env = Platform.environment;

/// Real bundled fonts (no test squares), Material icons, Roboto and Cupertino icons.
Future<void> loadAllFonts() async {
  final dir = Directory('../../packages/zynetix_ui/fonts');
  final families = <String, List<File>>{};
  for (final f in dir.listSync().whereType<File>().where((f) => f.path.endsWith('.ttf'))) {
    final name = f.uri.pathSegments.last;
    families.putIfAbsent(name.substring(0, name.indexOf('-')), () => []).add(f);
  }
  for (final e in families.entries) {
    final loader = FontLoader('packages/zynetix_ui/${e.key}');
    final plain = FontLoader(e.key);
    for (final f in e.value) {
      final bytes = ByteData.sublistView(f.readAsBytesSync());
      loader.addFont(Future.value(bytes));
      plain.addFont(Future.value(bytes));
    }
    await loader.load();
    await plain.load();
  }
  final root = _env['FLUTTER_ROOT'] ?? '/opt/flutter';
  final mf = '$root/bin/cache/artifacts/material_fonts';
  await (FontLoader('MaterialIcons')..addFont(Future.value(ByteData.sublistView(File('$mf/MaterialIcons-Regular.otf').readAsBytesSync())))).load();
  final roboto = FontLoader('Roboto');
  for (final w in ['Regular', 'Medium', 'Bold', 'Light', 'Black', 'Thin']) {
    roboto.addFont(Future.value(ByteData.sublistView(File('$mf/Roboto-$w.ttf').readAsBytesSync())));
  }
  await roboto.load();
  final home = _env['PUB_CACHE'] ?? '${_env['HOME']}/.pub-cache';
  final cup = Directory('$home/hosted/pub.dev').listSync().whereType<Directory>().where((d) => d.path.contains('cupertino_icons-')).toList();
  if (cup.isNotEmpty) {
    final f = File('${cup.last.path}/assets/CupertinoIcons.ttf');
    if (f.existsSync()) {
      await (FontLoader('packages/cupertino_icons/CupertinoIcons')..addFont(Future.value(ByteData.sublistView(f.readAsBytesSync())))).load();
    }
  }
}

/// iPhone 14 geometry: 390x844 pt at 3x with the notch and home-indicator insets.
void phoneView(WidgetTester t) {
  t.view.physicalSize = phoneSize * 3;
  t.view.devicePixelRatio = 3;
  t.view.padding = const FakeViewPadding(top: padTop * 3, bottom: padBottom * 3);
  t.view.viewPadding = const FakeViewPadding(top: padTop * 3, bottom: padBottom * 3);
  t.platformDispatcher.platformBrightnessTestValue = Brightness.light;
  addTearDown(t.view.reset);
  addTearDown(t.platformDispatcher.clearPlatformBrightnessTestValue);
}

class _Dot {
  _Dot(this.p);
  Offset p;
  double a = 0; // opacity 0..1
  double s = 0.8; // scale
}

class _Chrome extends CustomPainter {
  _Chrome(this.rec) : super(repaint: rec._tick);
  final Rec rec;

  @override
  void paint(Canvas canvas, Size size) {
    // Touches: a soft grey disc with a light rim, like iOS "show touches".
    for (final d in rec._dots) {
      if (d.a <= 0) continue;
      final r = 22.0 * d.s;
      canvas.drawCircle(d.p, r, Paint()..color = const Color(0xFF8E8E93).withValues(alpha: 0.45 * d.a));
      canvas.drawCircle(
        d.p,
        r,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 1.5
          ..color = Colors.white.withValues(alpha: 0.55 * d.a),
      );
    }
  }

  @override
  bool shouldRepaint(_Chrome old) => true;
}

/// The status bar (time, signal, Wi-Fi, battery) and the home indicator.
class _StatusBar extends StatelessWidget {
  const _StatusBar(this.rec);
  final Rec rec;

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<int>(
      valueListenable: rec._tick,
      builder: (context, _, _) {
        final now = DateTime.now();
        final h = now.hour % 12 == 0 ? 12 : now.hour % 12;
        final time = '$h:${now.minute.toString().padLeft(2, '0')}';
        final c = rec.statusDark ? Colors.white : Colors.black;
        return Stack(
          children: [
            Positioned(
              top: 0,
              left: 0,
              width: 150,
              height: padTop,
              child: Center(
                child: Padding(
                  padding: const EdgeInsets.only(top: 6, left: 6),
                  child: Text(
                    time,
                    style: TextStyle(fontFamily: 'Inter', fontSize: 16.5, fontWeight: FontWeight.w700, color: c, letterSpacing: -0.2, height: 1),
                  ),
                ),
              ),
            ),
            Positioned(
              top: 0,
              right: 0,
              width: 140,
              height: padTop,
              child: Padding(
                padding: const EdgeInsets.only(top: 6, right: 4),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Icons.signal_cellular_alt_rounded, size: 18, color: c),
                    const SizedBox(width: 4),
                    Icon(Icons.wifi_rounded, size: 18, color: c),
                    const SizedBox(width: 5),
                    _Battery(c),
                  ],
                ),
              ),
            ),
            Positioned(
              bottom: 8,
              left: (phoneSize.width - 134) / 2,
              width: 134,
              height: 5,
              child: DecoratedBox(decoration: BoxDecoration(color: c, borderRadius: BorderRadius.circular(3))),
            ),
          ],
        );
      },
    );
  }
}

class _Battery extends StatelessWidget {
  const _Battery(this.c);
  final Color c;
  @override
  Widget build(BuildContext context) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      Container(
        width: 25,
        height: 12,
        padding: const EdgeInsets.all(1.5),
        decoration: BoxDecoration(border: Border.all(color: c.withValues(alpha: 0.4), width: 1), borderRadius: BorderRadius.circular(3.5)),
        child: FractionallySizedBox(
          alignment: Alignment.centerLeft,
          widthFactor: 0.8,
          child: DecoratedBox(decoration: BoxDecoration(color: c, borderRadius: BorderRadius.circular(1.5))),
        ),
      ),
      const SizedBox(width: 1),
      Container(width: 1.5, height: 4, color: c.withValues(alpha: 0.4)),
    ],
  );
}

/// Records one clip.
class Rec {
  Rec(this.t, {required this.id, required this.title}) {
    final out = _env['OUT'];
    if (out != null && out.isNotEmpty) _out = File(out).openSync(mode: FileMode.writeOnly);
    preview = _env['PREVIEW'];
    if (preview != null) Directory(preview!).createSync(recursive: true);
  }

  final WidgetTester t;
  final String id, title;
  final rk = GlobalKey();
  final _tick = ValueNotifier<int>(0);
  final _dots = <_Dot>[];
  final marks = <Map<String, Object>>[];
  RandomAccessFile? _out;
  String? preview;
  final double ratio = double.tryParse(_env['PR'] ?? '') ?? 3;
  bool statusDark = false;
  bool recording = true;
  int frame = 0; // recorded frames
  Duration _clock = const Duration(seconds: 1); // pointer event time
  int _pointer = 20;
  final _sw = Stopwatch()..start();

  double get time => frame / fps;

  /// The app with the status bar, home indicator and touch dots above it, all captured.
  Widget wrap(Widget app) => RepaintBoundary(
    key: rk,
    child: Directionality(
      textDirection: TextDirection.ltr,
      child: Stack(
        fit: StackFit.expand,
        children: [
          app,
          IgnorePointer(child: _StatusBar(this)),
          IgnorePointer(child: CustomPaint(painter: _Chrome(this))),
        ],
      ),
    ),
  );

  void mark(String label) {
    marks.add({'t': double.parse(time.toStringAsFixed(2)), 'label': label});
    _log('mark ${time.toStringAsFixed(2)} $label');
    if (preview != null) _pendingSnap = label;
  }

  String? _pendingSnap;

  void _log(String s) => stderr.writeln('[rec $id ${_sw.elapsed.inSeconds}s f$frame] $s');

  // ------------------------------------------------------------------ frames

  /// One frame of app time, recorded.
  Future<void> emit([int n = 1]) async {
    for (var i = 0; i < n; i++) {
      _tick.value++;
      await t.pump(frameDt);
      _clock += frameDt;
      if (!recording) continue;
      frame++;
      if (_out != null) {
        final bytes = await _grab(ratio, ui.ImageByteFormat.rawRgba);
        _out!.writeFromSync(bytes);
      }
      if (preview != null && (_pendingSnap != null || frame % 60 == 0)) {
        final png = await _grab(0.5, ui.ImageByteFormat.png);
        final tag = (_pendingSnap ?? '').replaceAll(RegExp(r'[^A-Za-z0-9]+'), '_');
        File('$preview/${id}_${frame.toString().padLeft(4, '0')}_$tag.png').writeAsBytesSync(png);
        _pendingSnap = null;
      }
      if (frame % 150 == 0) _log('${time.toStringAsFixed(1)}s recorded');
    }
  }

  Future<Uint8List> _grab(double pr, ui.ImageByteFormat f) async {
    final b = await t.runAsync(() async {
      final ro = rk.currentContext!.findRenderObject()! as RenderRepaintBoundary;
      final img = await ro.toImage(pixelRatio: pr);
      final d = await img.toByteData(format: f);
      img.dispose();
      return d!.buffer.asUint8List();
    });
    return b!;
  }

  /// Hold the screen for [seconds].
  Future<void> hold(double seconds) => emit((seconds * fps).round());

  /// Let animations and loading finish (recorded), at least [min] s, at most [max] s.
  Future<void> settle({double min = 0.3, double max = 4}) async {
    await hold(min);
    var n = 0;
    while (t.binding.hasScheduledFrame && n < max * fps) {
      await emit();
      n++;
    }
  }

  /// App time passes without frames (a cut).
  Future<void> skip(double seconds) async {
    for (var i = 0; i < (seconds * fps).round(); i++) {
      _tick.value++;
      await t.pump(frameDt);
      _clock += frameDt;
    }
  }

  // ------------------------------------------------------------------ touches

  Offset centerOf(Finder f) {
    final el = f.hitTestable().evaluate();
    if (el.isEmpty) throw StateError('not on screen: $f');
    return t.getCenter(f.hitTestable().first);
  }

  Future<void> _fadeIn(_Dot d) async {
    for (var i = 1; i <= 4; i++) {
      d.a = i / 4;
      d.s = 0.8 + 0.2 * i / 4;
      await emit();
    }
  }

  Future<void> _fadeOut(_Dot d, {int frames = 9}) async {
    for (var i = frames - 1; i >= 0; i--) {
      d.a = i / frames;
      d.s = 1 + 0.15 * (1 - i / frames);
      await emit();
    }
    _dots.remove(d);
  }

  /// A finger tap on [f] (its centre, or [at] offset from its top-left).
  Future<void> tap(Finder f, {String? label, Offset? at, double after = 0}) async {
    Offset p;
    if (at != null) {
      p = t.getTopLeft(f.hitTestable().first) + at;
    } else {
      p = centerOf(f);
    }
    await tapAt(p, label: label, after: after);
  }

  Future<void> tapAt(Offset p, {String? label, double after = 0}) async {
    // A finger is never exactly in the middle.
    final rnd = math.Random(frame + 7);
    p = p + Offset(rnd.nextDouble() * 4 - 2, rnd.nextDouble() * 4 - 2);
    final d = _Dot(p);
    _dots.add(d);
    await _fadeIn(d); // ~0.13 s before contact
    if (label != null) mark(label);
    final g = await t.createGesture(kind: PointerDeviceKind.touch, pointer: _pointer++);
    await g.down(p, timeStamp: _clock);
    await emit(3);
    await g.up(timeStamp: _clock);
    await _fadeOut(d);
    if (after > 0) await hold(after);
  }

  /// A finger drag from [from] by [delta] over [seconds], eased. [fling] releases while moving.
  Future<void> drag(Offset from, Offset delta, {double seconds = 0.6, bool fling = false, String? label}) async {
    final d = _Dot(from);
    _dots.add(d);
    await _fadeIn(d);
    if (label != null) mark(label);
    final g = await t.createGesture(kind: PointerDeviceKind.touch, pointer: _pointer++);
    await g.down(from, timeStamp: _clock);
    await emit();
    final n = math.max(4, (seconds * fps).round());
    var last = from;
    for (var i = 1; i <= n; i++) {
      final x = i / n;
      // Ease in-out for a placed scroll; ease-in (still fast at the end) for a fling.
      final e = fling ? Curves.easeInQuad.transform(x) : Curves.easeInOutCubic.transform(x);
      final p = from + delta * e;
      // Small sub-steps so the gesture's velocity is measured like a real finger.
      for (var k = 1; k <= 2; k++) {
        await g.moveTo(Offset.lerp(last, p, k / 2)!, timeStamp: _clock + frameDt * (k / 2));
      }
      last = p;
      d.p = p;
      await emit();
    }
    if (!fling) {
      await emit(3); // the finger rests before lifting: no fling
      await g.moveTo(last, timeStamp: _clock);
    }
    await g.up(timeStamp: _clock);
    await _fadeOut(d, frames: 8);
  }

  /// Scroll the scrollable around [on] (default: screen centre) by [dy] pt (negative = content up).
  Future<void> scroll(double dy, {Finder? on, Offset? from, double seconds = 0.7, bool fling = false, String? label}) async {
    final start = from ?? (on != null ? centerOf(on) : Offset(phoneSize.width * 0.55, dy < 0 ? 600 : 320));
    await drag(start, Offset(0, dy), seconds: seconds, fling: fling, label: label);
  }

  /// Scroll (in eased steps) until [f] is visible inside [top]..[bottom] (logical y).
  Future<void> scrollTo(Finder f, {double top = 140, double bottom = 700, Offset? from, int maxSteps = 8}) async {
    for (var i = 0; i < maxSteps; i++) {
      final el = f.evaluate();
      if (el.isNotEmpty) {
        final r = t.getRect(f.first);
        if (r.top >= top && r.bottom <= bottom && f.hitTestable().evaluate().isNotEmpty) return;
        final target = (top + bottom) / 2;
        var dy = target - r.center.dy;
        dy = dy.clamp(-420.0, 420.0);
        if (dy.abs() < 8) return;
        await scroll(dy, from: from);
        await settle(min: 0.2, max: 1.5);
      } else {
        await scroll(-380, from: from);
        await settle(min: 0.2, max: 1.5);
      }
    }
  }

  /// Types [text] into [f] a few characters at a time, like thumbs on a keyboard.
  Future<void> type(Finder f, String text, {int perFrame = 1}) async {
    final rnd = math.Random(text.length);
    for (var i = 1; i <= text.length; i += perFrame) {
      await t.enterText(f, text.substring(0, math.min(text.length, i)));
      await emit(1 + rnd.nextInt(3));
    }
    await t.enterText(f, text);
    await emit(2);
  }

  /// A system back gesture (the app bar's back button is tapped instead where there is one).
  Future<void> back() async {
    final bb = find.byType(BackButton).hitTestable();
    if (bb.evaluate().isNotEmpty) {
      await tap(bb.first);
    } else {
      final close = find.byType(CloseButton).hitTestable();
      if (close.evaluate().isNotEmpty) {
        await tap(close.first);
      } else {
        await t.binding.handlePopRoute();
        await emit();
      }
    }
  }

  /// Finish: closes the sink and writes the clip's json.
  Future<void> finish() async {
    await emit(2);
    _out?.closeSync();
    final meta = {'id': id, 'title': title, 'duration': double.parse(time.toStringAsFixed(2)), 'marks': marks};
    final path = _env['META'];
    if (path != null && path.isNotEmpty) File(path).writeAsStringSync(const JsonEncoder.withIndent('  ').convert(meta));
    _log('done: ${time.toStringAsFixed(1)} s in ${_sw.elapsed.inSeconds} s');
  }
}

/// Text currently on screen (for exploring): every Text/RichText string, top to bottom.
List<String> screenTexts(WidgetTester t) {
  final out = <(double, double, String)>[];
  for (final e in find.byType(RichText).hitTestable().evaluate()) {
    final w = e.widget as RichText;
    final s = w.text.toPlainText().trim();
    if (s.isEmpty || s.length > 80) continue;
    final r = t.getRect(find.byWidget(w).first);
    out.add((r.top, r.left, s));
  }
  out.sort((a, b) => a.$1 != b.$1 ? a.$1.compareTo(b.$1) : a.$2.compareTo(b.$2));
  return [for (final o in out) '${o.$1.round()},${o.$2.round()}: ${o.$3}'];
}

/// Keys of hit-testable widgets on screen (for exploring).
List<String> screenKeys(WidgetTester t) {
  final out = <String>{};
  for (final e in find.byWidgetPredicate((w) => w.key is ValueKey<String>).hitTestable().evaluate()) {
    final k = (e.widget.key! as ValueKey<String>).value;
    final r = t.getRect(find.byWidget(e.widget).first);
    out.add('$k @${r.center.dx.round()},${r.center.dy.round()}');
  }
  return out.toList();
}

/// Exploring: a small PNG plus the texts and keys on screen, into PREVIEW (or /tmp/explore).
Future<void> dumpScreen(WidgetTester t, Rec r, String name) async {
  final dir = r.preview ?? '/tmp/explore';
  Directory(dir).createSync(recursive: true);
  r._tick.value++;
  await t.pump();
  final png = await r._grab(0.5, ui.ImageByteFormat.png);
  File('$dir/$name.png').writeAsBytesSync(png);
  File('$dir/$name.txt').writeAsStringSync('${screenTexts(t).join('\n')}\n--- keys\n${screenKeys(t).join('\n')}\n');
}

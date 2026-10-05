import 'dart:convert';
import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:archive/archive.dart';
import 'package:flutter/painting.dart';
import 'package:xml/xml.dart';

/// PowerPoint (.pptx) slides drawn on the board itself, one picture per slide, so a deck
/// becomes board pages to write over without the internet. Ported from the KINETIX
/// prototype's importer, which read the same XML into board elements.
///
/// What comes across: the slide, layout or master background (colour or picture), pictures,
/// rectangles, rounded rectangles, ellipses, triangles, diamonds, parallelograms, arrows,
/// lines and connectors, tables, and text with its size, weight, colour, alignment, bullets
/// and placeholder positions from the layout and master, in the deck's theme colours.
/// Charts, SmartArt, gradients, shadows and embedded fonts do not (the board's own font is
/// used); [PptxSlides.skipped] counts what was left out. Old .ppt files are not read.
class PptxSlides {
  const PptxSlides(this.title, this.size, this.slides, this.skipped);

  final String title;

  /// The slide size in points.
  final Size size;
  final List<PptxSlide> slides;
  final int skipped;
}

/// One slide, ready to draw.
class PptxSlide {
  PptxSlide(this.background, this.ops);
  final Color background;
  final List<PptxOp> ops;
}

const _emuPerPoint = 12700.0;

/// Reads a .pptx (at most [maxSlides] slides). Throws [FormatException] when it is not one.
PptxSlides parsePptx(Uint8List bytes, {int maxSlides = 60}) {
  final Archive zip;
  try {
    zip = ZipDecoder().decodeBytes(bytes);
  } catch (_) {
    throw const FormatException('not a .pptx file');
  }
  final deck = _Deck(zip);
  final pres = deck.xml('ppt/presentation.xml');
  if (pres == null) throw const FormatException('not a PowerPoint deck');
  final sz = pres.findAllElements('p:sldSz').firstOrNull;
  final cx = double.tryParse(sz?.getAttribute('cx') ?? '') ?? 12192000;
  final cy = double.tryParse(sz?.getAttribute('cy') ?? '') ?? 6858000;
  final rels = deck.rels('ppt/presentation.xml');
  final paths = [
    for (final s in pres.findAllElements('p:sldId'))
      ?rels[s.getAttribute('r:id')],
  ];
  deck.loadTheme(rels.values.where((t) => t.contains('theme')).firstOrNull);
  final slides = <PptxSlide>[];
  String? firstTitle;
  for (final path in paths.take(maxSlides)) {
    final s = _Slide(deck, path, 1 / _emuPerPoint, cx, cy);
    slides.add(s.build());
    firstTitle ??= s.title;
  }
  final core = deck.xml('docProps/core.xml');
  final docTitle = core?.findAllElements('dc:title').firstOrNull?.innerText.trim();
  return PptxSlides(
    (docTitle?.isNotEmpty ?? false) ? docTitle! : (firstTitle ?? ''),
    Size(cx / _emuPerPoint, cy / _emuPerPoint),
    slides,
    deck.skipped + math.max(0, paths.length - maxSlides),
  );
}

/// Draws [slide] [width] pixels wide and encodes it as PNG.
Future<Uint8List> renderPptxSlide(PptxSlide slide, Size slideSize, {double width = 1600}) async {
  final scale = width / slideSize.width;
  final out = Size(width.roundToDouble(), (slideSize.height * scale).roundToDouble());
  // Pictures first: drawing needs them decoded.
  final images = <Uint8List, ui.Image>{};
  for (final op in slide.ops) {
    if (op is _ImageOp && !images.containsKey(op.bytes)) {
      try {
        final codec = await ui.instantiateImageCodec(op.bytes);
        images[op.bytes] = (await codec.getNextFrame()).image;
      } catch (_) {
        // A picture the board cannot decode is left out.
      }
    }
  }
  final recorder = ui.PictureRecorder();
  final canvas = Canvas(recorder, Offset.zero & out)..scale(scale);
  canvas.drawRect(Offset.zero & slideSize, Paint()..color = slide.background);
  for (final op in slide.ops) {
    op.paint(canvas, images);
  }
  final image = await recorder.endRecording().toImage(out.width.toInt(), out.height.toInt());
  try {
    final data = await image.toByteData(format: ui.ImageByteFormat.png);
    return data!.buffer.asUint8List();
  } finally {
    image.dispose();
    for (final i in images.values) {
      i.dispose();
    }
  }
}

// --- Drawing ----------------------------------------------------------------------------------

/// One thing drawn on a slide.
sealed class PptxOp {
  void paint(Canvas canvas, Map<Uint8List, ui.Image> images);
}

void _turned(Canvas canvas, Rect box, double rotation, void Function() draw) {
  if (rotation == 0) return draw();
  canvas.save();
  canvas.translate(box.center.dx, box.center.dy);
  canvas.rotate(rotation);
  canvas.translate(-box.center.dx, -box.center.dy);
  draw();
  canvas.restore();
}

class _ImageOp extends PptxOp {
  _ImageOp(this.rect, this.bytes, [this.rotation = 0]);
  final Rect rect;
  final Uint8List bytes;
  final double rotation;

  @override
  void paint(Canvas canvas, Map<Uint8List, ui.Image> images) {
    final img = images[bytes];
    if (img == null) return;
    _turned(canvas, rect, rotation, () => paintImage(canvas: canvas, rect: rect, image: img, fit: BoxFit.fill, filterQuality: FilterQuality.medium));
  }
}

enum _Geom { rect, roundRect, ellipse, triangle, diamond, parallelogram, arrow }

class _ShapeOp extends PptxOp {
  _ShapeOp(this.geom, this.rect, {this.fill, this.line, this.lineWidth = 1, this.rotation = 0});
  final _Geom geom;
  final Rect rect;
  final Color? fill, line;
  final double lineWidth, rotation;

  Path get _path {
    final r = rect;
    return switch (geom) {
      _Geom.rect => Path()..addRect(r),
      _Geom.roundRect => Path()..addRRect(RRect.fromRectAndRadius(r, Radius.circular(r.shortestSide * 0.16))),
      _Geom.ellipse => Path()..addOval(r),
      _Geom.triangle => Path()..addPolygon([r.bottomLeft, r.topCenter, r.bottomRight], true),
      _Geom.diamond => Path()..addPolygon([r.topCenter, r.centerRight, r.bottomCenter, r.centerLeft], true),
      _Geom.parallelogram => Path()..addPolygon([Offset(r.left + r.width * 0.25, r.top), r.topRight, Offset(r.right - r.width * 0.25, r.bottom), r.bottomLeft], true),
      _Geom.arrow => Path()
        ..addPolygon([
          Offset(r.left, r.top + r.height * 0.25),
          Offset(r.right - r.height / 2, r.top + r.height * 0.25),
          Offset(r.right - r.height / 2, r.top),
          r.centerRight,
          Offset(r.right - r.height / 2, r.bottom),
          Offset(r.right - r.height / 2, r.bottom - r.height * 0.25),
          Offset(r.left, r.bottom - r.height * 0.25),
        ], true),
    };
  }

  @override
  void paint(Canvas canvas, Map<Uint8List, ui.Image> images) {
    _turned(canvas, rect, rotation, () {
      final p = _path;
      if (fill != null) canvas.drawPath(p, Paint()..color = fill!);
      if (line != null) {
        canvas.drawPath(
          p,
          Paint()
            ..color = line!
            ..style = PaintingStyle.stroke
            ..strokeWidth = lineWidth,
        );
      }
    });
  }
}

class _LineOp extends PptxOp {
  _LineOp(this.a, this.b, this.color, this.width, {this.arrow = false});
  final Offset a, b;
  final Color color;
  final double width;
  final bool arrow;

  @override
  void paint(Canvas canvas, Map<Uint8List, ui.Image> images) {
    final paint = Paint()
      ..color = color
      ..strokeWidth = width
      ..strokeCap = StrokeCap.round;
    canvas.drawLine(a, b, paint);
    if (arrow && (b - a).distance > 1) {
      final d = (b - a) / (b - a).distance;
      final n = Offset(-d.dy, d.dx);
      final h = math.max(8.0, width * 3);
      canvas.drawPath(Path()..addPolygon([b, b - d * h + n * h / 2, b - d * h - n * h / 2], true), Paint()..color = color);
    }
  }
}

class _TextOp extends PptxOp {
  _TextOp(this.at, this.text, this.color, this.size, this.bold, {this.rotateAbout, this.rotation = 0});
  final Offset at;
  final String text;
  final Color color;
  final double size;
  final bool bold;
  final Offset? rotateAbout;
  final double rotation;

  @override
  void paint(Canvas canvas, Map<Uint8List, ui.Image> images) {
    final tp = _layout(text, size, bold, color);
    if (rotation != 0 && rotateAbout != null) {
      canvas.save();
      canvas.translate(rotateAbout!.dx, rotateAbout!.dy);
      canvas.rotate(rotation);
      canvas.translate(-rotateAbout!.dx, -rotateAbout!.dy);
      tp.paint(canvas, at);
      canvas.restore();
    } else {
      tp.paint(canvas, at);
    }
    tp.dispose();
  }
}

TextPainter _layout(String text, double size, bool bold, [Color color = const Color(0xFF000000)]) => TextPainter(
  text: TextSpan(text: text, style: TextStyle(fontSize: size, height: 1.2, color: color, fontWeight: bold ? FontWeight.w700 : FontWeight.w400)),
  textDirection: TextDirection.ltr,
)..layout();

double _textWidth(String text, double size, bool bold) {
  final tp = _layout(text, size, bold);
  final w = tp.width;
  tp.dispose();
  return w;
}

// --- Reading ----------------------------------------------------------------------------------

class _Deck {
  _Deck(this.zip);
  final Archive zip;
  int skipped = 0;
  final _xml = <String, XmlDocument?>{};
  final theme = <String, Color>{};

  Uint8List? bytes(String path) => zip.findFile(path)?.content;

  XmlDocument? xml(String path) => _xml.putIfAbsent(path, () {
    final b = bytes(path);
    if (b == null) return null;
    try {
      return XmlDocument.parse(utf8.decode(b, allowMalformed: true));
    } catch (_) {
      return null;
    }
  });

  /// Relationship id → part path, for the part at [path].
  Map<String, String> rels(String path) {
    final dir = path.substring(0, path.lastIndexOf('/') + 1);
    final name = path.substring(path.lastIndexOf('/') + 1);
    final doc = xml('${dir}_rels/$name.rels');
    if (doc == null) return const {};
    return {
      for (final r in doc.findAllElements('Relationship'))
        if (r.getAttribute('Id') case final id?)
          if (r.getAttribute('TargetMode') != 'External') id: _resolve(dir, r.getAttribute('Target') ?? ''),
    };
  }

  static String _resolve(String dir, String target) {
    if (target.startsWith('/')) return target.substring(1);
    final parts = [...dir.split('/').where((p) => p.isNotEmpty)];
    for (final p in target.split('/')) {
      if (p == '..') {
        if (parts.isNotEmpty) parts.removeLast();
      } else if (p != '.' && p.isNotEmpty) {
        parts.add(p);
      }
    }
    return parts.join('/');
  }

  void loadTheme(String? path) {
    final scheme = xml(path ?? 'ppt/theme/theme1.xml')?.findAllElements('a:clrScheme').firstOrNull;
    if (scheme == null) return;
    for (final c in scheme.childElements) {
      final hex = c.findElements('a:srgbClr').firstOrNull?.getAttribute('val') ?? c.findElements('a:sysClr').firstOrNull?.getAttribute('lastClr');
      if (hex != null) theme[c.localName] = _hex(hex);
    }
  }

  /// A colour element's colour: RGB or a theme colour, lightened or darkened as it says.
  Color? color(XmlElement? fill) {
    final el = fill?.childElements.firstOrNull;
    if (el == null) return null;
    Color c;
    switch (el.localName) {
      case 'srgbClr':
        c = _hex(el.getAttribute('val') ?? '000000');
      case 'schemeClr':
        final v = el.getAttribute('val') ?? 'tx1';
        final name = switch (v) {
          'tx1' => 'dk1',
          'tx2' => 'dk2',
          'bg1' => 'lt1',
          'bg2' => 'lt2',
          _ => v,
        };
        c = theme[name] ?? (name.startsWith('lt') ? const Color(0xFFFFFFFF) : const Color(0xFF000000));
      case 'sysClr':
        c = _hex(el.getAttribute('lastClr') ?? '000000');
      case 'prstClr':
        c = switch (el.getAttribute('val')) {
          'white' => const Color(0xFFFFFFFF),
          'red' => const Color(0xFFFF0000),
          'blue' => const Color(0xFF0000FF),
          'green' => const Color(0xFF008000),
          _ => const Color(0xFF000000),
        };
      default:
        return null;
    }
    double? mod, off;
    for (final m in el.childElements) {
      final v = (double.tryParse(m.getAttribute('val') ?? '') ?? 100000) / 100000;
      if (m.localName == 'lumMod') mod = v;
      if (m.localName == 'lumOff') off = v;
    }
    if (mod != null || off != null) {
      final hsl = HSLColor.fromColor(c);
      c = hsl.withLightness((hsl.lightness * (mod ?? 1) + (off ?? 0)).clamp(0.0, 1.0)).toColor();
    }
    return c;
  }

  static Color _hex(String hex) => Color(0xFF000000 | (int.tryParse(hex, radix: 16) ?? 0));
}

/// Maps a slide's EMU to points, through any groups.
class _Space {
  const _Space(this.k, [this.shift = Offset.zero, this.sx = 1, this.sy = 1]);
  final double k;
  final Offset shift;
  final double sx, sy;

  Offset point(double x, double y) => Offset((shift.dx + x * sx) * k, (shift.dy + y * sy) * k);
  Rect rect(double x, double y, double w, double h) => Rect.fromPoints(point(x, y), point(x + w, y + h));
  double length(double emu) => emu * k * (sx + sy) / 2;
}

class _Slide {
  _Slide(this.deck, this.path, this.k, this.cx, this.cy);
  final _Deck deck;
  final String path;
  final double k, cx, cy;
  late final Map<String, String> rels = deck.rels(path);
  late final String? layoutPath = rels.values.where((t) => t.contains('slideLayout')).firstOrNull;
  late final String? masterPath = layoutPath == null ? null : deck.rels(layoutPath!).values.where((t) => t.contains('slideMaster')).firstOrNull;
  String? title;
  Color background = const Color(0xFFFFFFFF);
  final ops = <PptxOp>[];

  bool get dark => background.computeLuminance() < 0.25;

  PptxSlide build() {
    // The background: this slide's, else its layout's, else its master's.
    for (final p in [path, layoutPath, masterPath]) {
      if (p == null) continue;
      final bg = deck.xml(p)?.findAllElements('p:bg').firstOrNull;
      if (bg == null) continue;
      _background(bg, p);
      break;
    }
    // The master's and layout's own pictures and shapes (logos, bands), not their placeholders.
    for (final p in [masterPath, layoutPath]) {
      final tree = p == null ? null : deck.xml(p)?.findAllElements('p:spTree').firstOrNull;
      if (tree != null) _tree(tree, _Space(k), part: p!, decorationOnly: true);
    }
    final tree = deck.xml(path)?.findAllElements('p:spTree').firstOrNull;
    if (tree != null) _tree(tree, _Space(k), part: path);
    return PptxSlide(background, ops);
  }

  void _background(XmlElement bg, String part) {
    final pr = bg.findElements('p:bgPr').firstOrNull;
    final c = deck.color(pr?.findElements('a:solidFill').firstOrNull) ?? deck.color(bg.findElements('p:bgRef').firstOrNull);
    if (c != null) background = c;
    final blip = pr?.findAllElements('a:blip').firstOrNull;
    if (blip != null) {
      final img = _media(part, blip.getAttribute('r:embed'));
      if (img != null) ops.add(_ImageOp(Rect.fromLTWH(0, 0, cx * k, cy * k), img));
    }
  }

  Uint8List? _media(String part, String? id) {
    if (id == null) return null;
    final target = deck.rels(part)[id];
    if (target == null) return null;
    final ext = target.split('.').last.toLowerCase();
    if (!const {'png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'}.contains(ext)) {
      deck.skipped++;
      return null;
    }
    return deck.bytes(target);
  }

  void _tree(XmlElement tree, _Space space, {required String part, bool decorationOnly = false}) {
    for (final node in tree.childElements) {
      final isPlaceholder = node.findAllElements('p:ph').isNotEmpty;
      if (decorationOnly && isPlaceholder) continue;
      switch (node.localName) {
        case 'sp' || 'cxnSp':
          _shape(node, space, decorationOnly: decorationOnly);
        case 'pic':
          _picture(node, space, part);
        case 'grpSp':
          _group(node, space, part, decorationOnly);
        case 'graphicFrame':
          if (!decorationOnly) _frame(node, space);
      }
    }
  }

  void _group(XmlElement g, _Space space, String part, bool decorationOnly) {
    final x = g.findElements('p:grpSpPr').firstOrNull?.findElements('a:xfrm').firstOrNull;
    if (x == null) return _tree(g, space, part: part, decorationOnly: decorationOnly);
    final off = _pair(x, 'a:off', 'x', 'y'), ext = _pair(x, 'a:ext', 'cx', 'cy');
    final chOff = _pair(x, 'a:chOff', 'x', 'y'), chExt = _pair(x, 'a:chExt', 'cx', 'cy');
    final sx = chExt.$1 == 0 ? 1.0 : ext.$1 / chExt.$1, sy = chExt.$2 == 0 ? 1.0 : ext.$2 / chExt.$2;
    // child → group: off + (p − chOff)·s, then through the outer space.
    final inner = _Space(
      k,
      Offset(space.shift.dx + (off.$1 - chOff.$1 * sx) * space.sx, space.shift.dy + (off.$2 - chOff.$2 * sy) * space.sy),
      space.sx * sx,
      space.sy * sy,
    );
    _tree(g, inner, part: part, decorationOnly: decorationOnly);
  }

  (double, double) _pair(XmlElement x, String tag, String a, String b) {
    final e = x.findElements(tag).firstOrNull;
    return (double.tryParse(e?.getAttribute(a) ?? '') ?? 0, double.tryParse(e?.getAttribute(b) ?? '') ?? 0);
  }

  /// A shape's box and turn; a placeholder without its own box takes its layout's or master's.
  (Rect, double)? _box(XmlElement node, _Space space) {
    var x = node.findElements('p:spPr').firstOrNull?.findElements('a:xfrm').firstOrNull ?? node.findElements('p:xfrm').firstOrNull ?? node.findAllElements('a:xfrm').firstOrNull;
    final ph = node.findAllElements('p:ph').firstOrNull;
    if (x == null && ph != null) x = _inheritedXfrm(ph);
    if (x == null) return null;
    final off = _pair(x, 'a:off', 'x', 'y'), ext = _pair(x, 'a:ext', 'cx', 'cy');
    final rot = (double.tryParse(x.getAttribute('rot') ?? '') ?? 0) / 60000 * math.pi / 180;
    return (space.rect(off.$1, off.$2, ext.$1, ext.$2), rot);
  }

  XmlElement? _inheritedXfrm(XmlElement ph) {
    for (final sp in _placeholders(ph)) {
      final x = sp.findAllElements('a:xfrm').firstOrNull;
      if (x != null) return x;
    }
    return null;
  }

  /// The layout's and then the master's shapes for placeholder [ph].
  List<XmlElement> _placeholders(XmlElement ph) {
    final type = ph.getAttribute('type') ?? 'body';
    final idx = ph.getAttribute('idx');
    final out = <XmlElement>[];
    for (final part in [layoutPath, masterPath]) {
      final tree = part == null ? null : deck.xml(part)?.findAllElements('p:spTree').firstOrNull;
      if (tree == null) continue;
      XmlElement? match;
      for (final sp in tree.findAllElements('p:sp')) {
        final other = sp.findAllElements('p:ph').firstOrNull;
        if (other == null) continue;
        final oType = other.getAttribute('type') ?? 'body';
        final sameType = oType == type || (type == 'ctrTitle' && oType == 'title') || (type == 'subTitle' && oType == 'body');
        if (idx != null && other.getAttribute('idx') == idx && part == layoutPath) {
          match = sp;
          break;
        }
        if (sameType) match ??= sp;
      }
      if (match != null) out.add(match);
    }
    return out;
  }

  /// Paragraph styles, nearest first: the shape's own, its placeholders', then the master's
  /// title, body or other text style.
  List<XmlElement> _styleChain(XmlElement node, XmlElement? ph) {
    final chain = <XmlElement>[];
    void add(XmlElement? sp) {
      final ls = sp?.findAllElements('a:lstStyle').firstOrNull;
      if (ls != null) chain.add(ls);
    }

    add(node);
    if (ph != null) _placeholders(ph).forEach(add);
    final styles = masterPath == null ? null : deck.xml(masterPath!)?.findAllElements('p:txStyles').firstOrNull;
    final type = ph?.getAttribute('type');
    final which = ph == null ? 'p:otherStyle' : (type == 'title' || type == 'ctrTitle' ? 'p:titleStyle' : 'p:bodyStyle');
    final master = styles?.findElements(which).firstOrNull;
    if (master != null) chain.add(master);
    return chain;
  }

  String _anchor(XmlElement node, XmlElement? ph) {
    for (final sp in [node, if (ph != null) ..._placeholders(ph)]) {
      final a = sp.findAllElements('a:bodyPr').firstOrNull?.getAttribute('anchor');
      if (a != null) return a;
    }
    return 't';
  }

  void _picture(XmlElement node, _Space space, String part) {
    final box = _box(node, space);
    final blip = node.findAllElements('a:blip').firstOrNull;
    if (box == null || blip == null) return;
    final img = _media(part, blip.getAttribute('r:embed'));
    if (img != null) ops.add(_ImageOp(box.$1, img, box.$2));
  }

  void _frame(XmlElement node, _Space space) {
    final tbl = node.findAllElements('a:tbl').firstOrNull;
    if (tbl == null) {
      deck.skipped++; // a chart or SmartArt
      return;
    }
    final box = _box(node, space);
    if (box == null) return;
    final cols = [for (final g in tbl.findAllElements('a:gridCol')) space.length(double.tryParse(g.getAttribute('w') ?? '') ?? 0)];
    var y = box.$1.top;
    final ink = dark ? const Color(0xFFFFFFFF) : const Color(0xFF1B1F24);
    for (final tr in tbl.findElements('a:tr')) {
      final h = space.length(double.tryParse(tr.getAttribute('h') ?? '') ?? 370840);
      final cells = tr.findElements('a:tc').toList();
      double colW(int i) => i < cols.length ? cols[i] : box.$1.width / math.max(1, cells.length);
      // Lay the text out first, to know how tall the row grows.
      final textOps = <PptxOp>[];
      var rowH = h;
      var x = box.$1.left;
      for (final (i, tc) in cells.indexed) {
        final fill = deck.color(tc.findElements('a:tcPr').firstOrNull?.findElements('a:solidFill').firstOrNull);
        final used = _text(
          tc,
          Rect.fromLTWH(x, y, colW(i), h),
          space,
          out: textOps,
          defaultSize: 18,
          defaultColor: ink,
          chain: [?tc.findAllElements('a:lstStyle').firstOrNull],
          background: fill,
        );
        if (fill != null) ops.add(_ShapeOp(_Geom.rect, Rect.fromLTWH(x, y, colW(i), math.max(h, used)), fill: fill));
        rowH = math.max(rowH, used);
        x += colW(i);
      }
      x = box.$1.left;
      for (final (i, _) in cells.indexed) {
        ops.add(_ShapeOp(_Geom.rect, Rect.fromLTWH(x, y, colW(i), rowH), line: dark ? const Color(0xB3FFFFFF) : const Color(0xFF8A939C), lineWidth: 1));
        x += colW(i);
      }
      ops.addAll(textOps);
      y += rowH;
    }
  }

  void _shape(XmlElement node, _Space space, {bool decorationOnly = false}) {
    final ph = node.findAllElements('p:ph').firstOrNull;
    final phType = ph?.getAttribute('type');
    // Date, footer and slide number are noise on a board.
    if (const {'dt', 'ftr', 'sldNum'}.contains(phType)) return;
    final box = _box(node, space);
    if (box == null) return;
    final (rect, rot) = box;
    final spPr = node.findElements('p:spPr').firstOrNull;
    final geom = spPr?.findElements('a:prstGeom').firstOrNull?.getAttribute('prst');
    final noFill = spPr?.findElements('a:noFill').isNotEmpty ?? false;
    final style = node.findElements('p:style').firstOrNull;
    final fillColor = noFill ? null : (deck.color(spPr?.findElements('a:solidFill').firstOrNull) ?? (spPr?.findElements('a:gradFill').isEmpty ?? true ? deck.color(style?.findElements('a:fillRef').firstOrNull) : null));
    final line = spPr?.findElements('a:ln').firstOrNull;
    final noLine = line?.findElements('a:noFill').isNotEmpty ?? false;
    final lineColor = noLine ? null : (deck.color(line?.findElements('a:solidFill').firstOrNull) ?? deck.color(style?.findElements('a:lnRef').firstOrNull));
    final lineWidth = math.max(1.0, space.length(double.tryParse(line?.getAttribute('w') ?? '') ?? 12700));
    final isLine = node.localName == 'cxnSp' || geom == 'line' || geom == 'straightConnector1';
    if (isLine) {
      final head = line?.findElements('a:tailEnd').firstOrNull?.getAttribute('type');
      final x = node.findAllElements('a:xfrm').firstOrNull;
      final fh = x?.getAttribute('flipH') == '1', fv = x?.getAttribute('flipV') == '1';
      ops.add(
        _LineOp(
          Offset(fh ? rect.right : rect.left, fv ? rect.bottom : rect.top),
          Offset(fh ? rect.left : rect.right, fv ? rect.top : rect.bottom),
          lineColor ?? (dark ? const Color(0xFFFFFFFF) : const Color(0xFF000000)),
          lineWidth,
          arrow: head != null && head != 'none',
        ),
      );
      return;
    }
    final g = switch (geom) {
      'rect' => _Geom.rect,
      'roundRect' || 'snipRoundRect' || 'round2SameRect' => _Geom.roundRect,
      'ellipse' => _Geom.ellipse,
      'triangle' || 'rtTriangle' => _Geom.triangle,
      'diamond' => _Geom.diamond,
      'parallelogram' => _Geom.parallelogram,
      'rightArrow' => _Geom.arrow,
      _ => null,
    };
    final visible = ph == null && (fillColor != null || lineColor != null);
    if (visible && g != null) {
      ops.add(_ShapeOp(g, rect, fill: fillColor, line: lineColor, lineWidth: lineWidth, rotation: rot));
    } else if (visible) {
      deck.skipped++; // a shape with no match here: its text still comes
    }
    final isTitle = phType == 'title' || phType == 'ctrTitle';
    final size = isTitle ? (phType == 'ctrTitle' ? 44.0 : 36.0) : (ph != null ? 24.0 : 18.0);
    // Text on a solid shape is read against the shape, not the slide.
    final onFill = fillColor != null && g != null && ph == null;
    final fillDark = onFill && fillColor.computeLuminance() < 0.4;
    final styleFont = deck.color(style?.findElements('a:fontRef').firstOrNull);
    final ink = styleFont ?? (dark || fillDark ? const Color(0xFFFFFFFF) : const Color(0xFF1B1F24));
    _text(node, rect, space, out: ops, defaultSize: size, defaultColor: ink, chain: _styleChain(node, ph), anchor: _anchor(node, ph), background: onFill ? fillColor : null, rotation: rot);
    if (isTitle && title == null) {
      final t = node.findAllElements('a:t').map((e) => e.innerText).join(' ').trim();
      if (t.isNotEmpty) title = t;
    }
  }

  /// The text of a shape or table cell, laid out in [box] into [out]. Returns its height.
  double _text(
    XmlElement node,
    Rect box,
    _Space space, {
    required List<PptxOp> out,
    required double defaultSize,
    required Color defaultColor,
    List<XmlElement> chain = const [],
    String anchor = 't',
    Color? background,
    double rotation = 0,
  }) {
    final body = node.findElements('p:txBody').firstOrNull ?? node.findElements('a:txBody').firstOrNull;
    if (body == null) return 0;
    final bodyPr = body.findElements('a:bodyPr').firstOrNull;
    final scale = (double.tryParse(bodyPr?.findElements('a:normAutofit').firstOrNull?.getAttribute('fontScale') ?? '') ?? 100000) / 100000;
    final anchorAt = bodyPr?.getAttribute('anchor') ?? anchor;
    final inset = space.length(91440);
    final inner = Rect.fromLTRB(box.left + inset, box.top + inset / 2, math.max(box.left + inset + 40, box.right - inset), box.bottom - inset / 2);
    T? inherit<T>(int level, T? Function(XmlElement pPr) read) {
      for (final ls in chain) {
        final e = ls.findElements('a:lvl${level + 1}pPr').firstOrNull;
        if (e == null) continue;
        final v = read(e);
        if (v != null) return v;
      }
      return null;
    }

    final paras = <(List<String>, double, bool, Color, String, double)>[];
    for (final p in body.findElements('a:p')) {
      final pPr = p.findElements('a:pPr').firstOrNull;
      final level = int.tryParse(pPr?.getAttribute('lvl') ?? '') ?? 0;
      final runs = [...p.findElements('a:r'), ...p.findElements('a:fld')];
      final text = runs.map((r) => r.findElements('a:t').firstOrNull?.innerText ?? '').join().replaceAll('\u000b', '\n');
      final rPr = runs.firstOrNull?.findElements('a:rPr').firstOrNull ?? p.findElements('a:endParaRPr').firstOrNull;
      final inheritedSz = inherit(level, (e) => double.tryParse(e.findElements('a:defRPr').firstOrNull?.getAttribute('sz') ?? ''));
      // Hundredths of a point; the slide is drawn in points.
      final size = ((double.tryParse(rPr?.getAttribute('sz') ?? '') ?? inheritedSz ?? (defaultSize - level * 2) * 100) / 100 * scale).clamp(6.0, 160.0);
      if (text.trim().isEmpty) {
        paras.add((const [''], size * 0.6, false, defaultColor, 'l', 0));
        continue;
      }
      final bold = rPr?.getAttribute('b') == '1' || (rPr?.getAttribute('b') == null && inherit(level, (e) => e.findElements('a:defRPr').firstOrNull?.getAttribute('b')) == '1');
      final color =
          deck.color(rPr?.findElements('a:solidFill').firstOrNull) ??
          inherit(level, (e) => deck.color(e.findElements('a:defRPr').firstOrNull?.findElements('a:solidFill').firstOrNull)) ??
          defaultColor;
      final algn = pPr?.getAttribute('algn') ?? inherit(level, (e) => e.getAttribute('algn')) ?? 'l';
      bool? own(XmlElement? e) => e == null
          ? null
          : e.findElements('a:buNone').isNotEmpty
          ? false
          : (e.findElements('a:buChar').isNotEmpty || e.findElements('a:buAutoNum').isNotEmpty ? true : null);
      final bullet = own(pPr) ?? inherit(level, own) ?? false;
      final indent = level * size * 1.4;
      final lines = _wrap('${bullet ? '•  ' : ''}$text', size, bold, inner.width - indent);
      paras.add((lines, size, bold, _readable(color, background), algn, indent));
    }
    if (paras.every((p) => p.$1.every((l) => l.trim().isEmpty))) return 0;
    var height = 0.0;
    for (final (lines, size, _, _, _, _) in paras) {
      height += lines.length * size * 1.2 + size * 0.25;
    }
    var y = switch (anchorAt) {
      'ctr' => inner.top + math.max(0, (inner.height - height) / 2),
      'b' => inner.top + math.max(0, inner.height - height),
      _ => inner.top,
    };
    for (final (lines, size, bold, color, algn, indent) in paras) {
      for (final line in lines) {
        if (line.trim().isNotEmpty) {
          final w = _textWidth(line, size, bold);
          final x = switch (algn) {
            'ctr' => inner.center.dx - w / 2,
            'r' => inner.right - w,
            _ => inner.left + indent,
          };
          out.add(_TextOp(Offset(x, y), line, color, size, bold, rotateAbout: box.center, rotation: rotation));
        }
        y += size * 1.2;
      }
      y += size * 0.25;
    }
    return height + inset;
  }

  /// Light text on a light slide (or dark on a dark one) is turned so it can be read.
  Color _readable(Color c, [Color? on]) {
    final l = c.computeLuminance();
    final backDark = on != null ? on.computeLuminance() < 0.4 : dark;
    if (!backDark && l > 0.75) return const Color(0xFF1B1F24);
    if (backDark && l < 0.08) return const Color(0xFFFFFFFF);
    return c;
  }

  /// Breaks [text] into lines no wider than [width].
  static List<String> _wrap(String text, double size, bool bold, double width) {
    final out = <String>[];
    for (final para in text.split('\n')) {
      var line = '';
      for (final word in para.split(' ')) {
        final next = line.isEmpty ? word : '$line $word';
        if (line.isNotEmpty && _textWidth(next, size, bold) > width) {
          out.add(line);
          line = word;
        } else {
          line = next;
        }
      }
      out.add(line);
    }
    return out;
  }
}

/// The text on each slide, top to bottom (for tests and read aloud).
List<String> pptxSlideText(PptxSlide slide) => [for (final op in slide.ops) if (op is _TextOp) op.text];

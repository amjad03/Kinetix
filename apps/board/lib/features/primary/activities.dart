import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:kinetix_labs/kinetix_labs.dart' show LabSpeech;
import 'package:kinetix_ui/kinetix_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../core/board_controller.dart';
import '../../l10n/feature_strings.dart';
import '../reader/read_aloud.dart' show ReadAloudScope;
import '../toolkit/toolkit_controller.dart' show demoClassNames;
import 'primary_strings.dart';
import 'tracing.dart';

/// Says [text] with the board's voice (the panel lends it; silent where there is none).
void say(BuildContext context, String text) => LabSpeech.maybeOf(context)?.call(text);

// --- Numbers ------------------------------------------------------------------------------------

/// Counting: pick a number, tap each picture to count it aloud, then trace the number.
class CountingActivity extends StatefulWidget {
  const CountingActivity({super.key, this.onTrace});

  /// Opens tracing at the numbers.
  final VoidCallback? onTrace;

  @override
  State<CountingActivity> createState() => _CountingActivityState();
}

class _CountingActivityState extends State<CountingActivity> {
  static const _things = [Icons.star, Icons.local_florist, Icons.pets, Icons.directions_car, Icons.cake, Icons.wb_sunny, Icons.sports_soccer, Icons.emoji_nature];
  static const _colors = [Color(0xFFF9AB00), Color(0xFFE91E63), Color(0xFF8D6E63), Color(0xFF1E88E5), Color(0xFFAB47BC), Color(0xFFFF7043), Color(0xFF43A047), Color(0xFF00897B)];
  int _n = 3;
  final _counted = <int>[];

  void _pick(int n) => setState(() {
    _n = n;
    _counted.clear();
  });

  @override
  Widget build(BuildContext context) {
    final s = primaryStrings(context);
    final icon = _things[_n % _things.length];
    final color = _colors[_n % _colors.length];
    final done = _counted.length == _n;
    return ListView(
      padding: const EdgeInsets.all(Kx.s12),
      children: [
        Wrap(
          spacing: Kx.s8,
          runSpacing: Kx.s8,
          children: [
            for (var i = 1; i <= 10; i++)
              SizedBox(
                width: 64,
                height: 64,
                child: ChoiceChip(
                  key: Key('count-$i'),
                  label: SizedBox(width: 32, child: Text('$i', textAlign: TextAlign.center, style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w700))),
                  selected: _n == i,
                  showCheckmark: false,
                  onSelected: (_) => _pick(i),
                ),
              ),
          ],
        ),
        const SizedBox(height: Kx.s12),
        Text(s['countHint'], style: context.text.titleMedium),
        const SizedBox(height: Kx.s12),
        Wrap(
          spacing: Kx.s12,
          runSpacing: Kx.s12,
          children: [
            for (var i = 0; i < _n; i++)
              InkWell(
                key: Key('count-item-$i'),
                borderRadius: Kx.radiusLg,
                onTap: _counted.contains(i)
                    ? null
                    : () {
                        setState(() => _counted.add(i));
                        say(context, '${_counted.length}');
                      },
                child: Container(
                  width: 96,
                  height: 96,
                  decoration: BoxDecoration(
                    color: _counted.contains(i) ? color.withValues(alpha: 0.18) : context.colors.surfaceContainerLow,
                    borderRadius: Kx.radiusLg,
                    border: Border.all(color: _counted.contains(i) ? color : context.colors.outlineVariant, width: 3),
                  ),
                  child: Stack(
                    alignment: Alignment.center,
                    children: [
                      Icon(icon, size: 56, color: color),
                      if (_counted.contains(i))
                        Positioned(
                          right: 6,
                          top: 4,
                          child: Text('${_counted.indexOf(i) + 1}', style: context.text.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
                        ),
                    ],
                  ),
                ),
              ),
          ],
        ),
        const SizedBox(height: Kx.s16),
        if (done)
          Text(s.n('counted', _n), key: const Key('count-done'), textAlign: TextAlign.center, style: context.text.displaySmall?.copyWith(color: color, fontWeight: FontWeight.w800)),
        const SizedBox(height: Kx.s12),
        Wrap(
          spacing: Kx.s8,
          alignment: WrapAlignment.center,
          children: [
            BigButton(key: const Key('count-again'), icon: Icons.replay, label: s['reset'], onTap: () => _pick(_n)),
            if (widget.onTrace != null) BigButton(key: const Key('count-trace'), icon: Icons.gesture, label: s['traceNumber'], onTap: widget.onTrace!),
          ],
        ),
      ],
    );
  }
}

// --- Shapes and colours -------------------------------------------------------------------------

enum KidShape { circle, square, triangle, rectangle, star, oval, diamond, heart }

const kidColours = <String, Color>{
  'red': Color(0xFFE53935),
  'blue': Color(0xFF1E88E5),
  'green': Color(0xFF43A047),
  'yellow': Color(0xFFFDD835),
  'orange': Color(0xFFFB8C00),
  'purple': Color(0xFF8E24AA),
  'pink': Color(0xFFEC407A),
  'brown': Color(0xFF795548),
  'black': Color(0xFF212121),
  'white': Color(0xFFFFFFFF),
};

Path kidShapePath(KidShape s, Rect r) {
  final c = r.center;
  switch (s) {
    case KidShape.circle:
      return Path()..addOval(Rect.fromCircle(center: c, radius: r.shortestSide / 2));
    case KidShape.square:
      return Path()..addRect(Rect.fromCenter(center: c, width: r.shortestSide, height: r.shortestSide));
    case KidShape.triangle:
      return Path()
        ..moveTo(c.dx, r.top)
        ..lineTo(r.right, r.bottom)
        ..lineTo(r.left, r.bottom)
        ..close();
    case KidShape.rectangle:
      return Path()..addRect(Rect.fromCenter(center: c, width: r.width, height: r.height * 0.6));
    case KidShape.oval:
      return Path()..addOval(Rect.fromCenter(center: c, width: r.width, height: r.height * 0.65));
    case KidShape.diamond:
      return Path()
        ..moveTo(c.dx, r.top)
        ..lineTo(r.right, c.dy)
        ..lineTo(c.dx, r.bottom)
        ..lineTo(r.left, c.dy)
        ..close();
    case KidShape.star:
      final p = Path();
      for (var i = 0; i < 10; i++) {
        final rad = i.isEven ? r.shortestSide / 2 : r.shortestSide / 5;
        final a = -math.pi / 2 + i * math.pi / 5;
        final pt = c + Offset(math.cos(a), math.sin(a)) * rad;
        i == 0 ? p.moveTo(pt.dx, pt.dy) : p.lineTo(pt.dx, pt.dy);
      }
      return p..close();
    case KidShape.heart:
      final w = r.shortestSide, x = c.dx - w / 2, y = c.dy - w / 2;
      return Path()
        ..moveTo(x + w / 2, y + w * 0.95)
        ..cubicTo(x - w * 0.1, y + w * 0.5, x + w * 0.1, y - w * 0.05, x + w / 2, y + w * 0.28)
        ..cubicTo(x + w * 0.9, y - w * 0.05, x + w * 1.1, y + w * 0.5, x + w / 2, y + w * 0.95)
        ..close();
  }
}

class KidShapeView extends StatelessWidget {
  const KidShapeView({super.key, required this.shape, required this.color, this.size = 88});
  final KidShape shape;
  final Color color;
  final double size;

  @override
  Widget build(BuildContext context) => CustomPaint(size: Size.square(size), painter: _ShapePainter(shape, color));
}

class _ShapePainter extends CustomPainter {
  _ShapePainter(this.shape, this.color);
  final KidShape shape;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final path = kidShapePath(shape, (Offset.zero & size).deflate(4));
    canvas.drawPath(path, Paint()..color = color);
    canvas.drawPath(
      path,
      Paint()
        ..color = const Color(0x55000000)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2,
    );
  }

  @override
  bool shouldRepaint(_ShapePainter old) => old.shape != shape || old.color != color;
}

/// Shapes and colours: tap one to hear its name; "Find the …" asks for a shape or colour and
/// cheers the right tap.
class ShapesColoursActivity extends StatefulWidget {
  const ShapesColoursActivity({super.key, this.random});
  final math.Random? random;

  @override
  State<ShapesColoursActivity> createState() => _ShapesColoursActivityState();
}

class _ShapesColoursActivityState extends State<ShapesColoursActivity> {
  late final math.Random _rand = widget.random ?? math.Random();
  KidShape? _findShape;
  String? _findColour;
  String? _feedback;

  void _newGame() => setState(() {
    _feedback = null;
    if (_rand.nextBool()) {
      _findShape = KidShape.values[_rand.nextInt(KidShape.values.length)];
      _findColour = null;
    } else {
      _findColour = kidColours.keys.elementAt(_rand.nextInt(kidColours.length - 1));
      _findShape = null;
    }
  });

  void _tapped(BuildContext context, FeatureStrings s, {KidShape? shape, String? colour}) {
    final name = shape != null ? s[shape.name] : s[colour!];
    say(context, name);
    if (_findShape == null && _findColour == null) return;
    final right = (shape != null && shape == _findShape) || (colour != null && colour == _findColour);
    setState(() => _feedback = right ? s['great'] : s['tryAgain']);
    if (right) say(context, s['great']);
  }

  @override
  Widget build(BuildContext context) {
    final s = primaryStrings(context);
    final shapeColours = kidColours.values.toList();
    final target = _findShape != null ? s[_findShape!.name] : (_findColour != null ? s[_findColour!] : null);
    return ListView(
      padding: const EdgeInsets.all(Kx.s12),
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                target == null ? s['shapes'] : s.n('findIt', target),
                key: const Key('shapes-prompt'),
                style: context.text.headlineSmall?.copyWith(fontWeight: FontWeight.w700),
              ),
            ),
            BigButton(key: const Key('shapes-game'), icon: Icons.casino_outlined, label: s['newGame'], onTap: _newGame),
          ],
        ),
        if (_feedback != null)
          Padding(
            padding: const EdgeInsets.only(top: Kx.s8),
            child: Text(_feedback!, key: const Key('shapes-feedback'), style: context.text.headlineMedium?.copyWith(color: _feedback == s['great'] ? Kx.success : Kx.record)),
          ),
        const SizedBox(height: Kx.s12),
        Wrap(
          spacing: Kx.s12,
          runSpacing: Kx.s12,
          children: [
            for (final (i, shape) in KidShape.values.indexed)
              InkWell(
                key: Key('shape-${shape.name}'),
                borderRadius: Kx.radiusLg,
                onTap: () => _tapped(context, s, shape: shape),
                child: Container(
                  width: 120,
                  padding: const EdgeInsets.all(Kx.s8),
                  decoration: BoxDecoration(color: context.colors.surfaceContainerLow, borderRadius: Kx.radiusLg),
                  child: Column(
                    children: [
                      KidShapeView(shape: shape, color: shapeColours[i % (shapeColours.length - 2)]),
                      Text(s[shape.name], style: context.text.titleMedium),
                    ],
                  ),
                ),
              ),
          ],
        ),
        const SizedBox(height: Kx.s16),
        Wrap(
          spacing: Kx.s12,
          runSpacing: Kx.s12,
          children: [
            for (final e in kidColours.entries)
              InkWell(
                key: Key('colour-${e.key}'),
                borderRadius: Kx.radiusLg,
                onTap: () => _tapped(context, s, colour: e.key),
                child: Column(
                  children: [
                    Container(
                      width: 72,
                      height: 72,
                      decoration: BoxDecoration(color: e.value, shape: BoxShape.circle, border: Border.all(color: const Color(0x55000000), width: 2)),
                    ),
                    Text(s[e.key], style: context.text.titleSmall),
                  ],
                ),
              ),
          ],
        ),
      ],
    );
  }
}

// --- Rhymes ------------------------------------------------------------------------------------

typedef Rhyme = ({String title, String lang, List<String> lines});

/// Traditional rhymes (public domain), in English, Hindi and Kannada; teachers add their own.
const rhymes = <Rhyme>[
  (
    title: 'Twinkle, Twinkle, Little Star',
    lang: 'en',
    lines: ['Twinkle, twinkle, little star,', 'How I wonder what you are!', 'Up above the world so high,', 'Like a diamond in the sky.', 'Twinkle, twinkle, little star,', 'How I wonder what you are!'],
  ),
  (
    title: 'Baa, Baa, Black Sheep',
    lang: 'en',
    lines: ['Baa, baa, black sheep,', 'Have you any wool?', 'Yes sir, yes sir,', 'Three bags full.', 'One for the master,', 'One for the dame,', 'And one for the little boy', 'Who lives down the lane.'],
  ),
  (
    title: 'Humpty Dumpty',
    lang: 'en',
    lines: ['Humpty Dumpty sat on a wall,', 'Humpty Dumpty had a great fall.', "All the king's horses and all the king's men", "Couldn't put Humpty together again."],
  ),
  (
    title: 'Hickory Dickory Dock',
    lang: 'en',
    lines: ['Hickory dickory dock,', 'The mouse ran up the clock.', 'The clock struck one,', 'The mouse ran down,', 'Hickory dickory dock.'],
  ),
  (
    title: 'मछली जल की रानी है',
    lang: 'hi',
    lines: ['मछली जल की रानी है,', 'जीवन उसका पानी है।', 'हाथ लगाओ डर जाएगी,', 'बाहर निकालो मर जाएगी।'],
  ),
  (
    title: 'आलू कचालू',
    lang: 'hi',
    lines: ['आलू कचालू बेटा कहाँ गए थे,', 'बैंगन की टोकरी में सो रहे थे।', 'बैंगन ने लात मारी, रो रहे थे,', 'मम्मी ने प्यार किया, हँस रहे थे।'],
  ),
  (
    title: 'ಒಂದು ಎರಡು ಬಾಳೆಲೆ ಹರಡು',
    lang: 'kn',
    lines: ['ಒಂದು ಎರಡು ಬಾಳೆಲೆ ಹರಡು,', 'ಮೂರು ನಾಲ್ಕು ಅನ್ನ ಹಾಕು,', 'ಐದು ಆರು ಬೇಳೆ ಸಾರು,', 'ಏಳು ಎಂಟು ಪಲ್ಯಕೆ ದಂಟು,', 'ಒಂಬತ್ತು ಹತ್ತು ಎಲೆ ಮುದುರೆತ್ತು,', 'ಒಂದರಿಂದ ಹತ್ತು ಹೀಗಿತ್ತು, ಊಟದ ಆಟವು ಮುಗಿದಿತ್ತು.'],
  ),
  (
    title: 'ಆನೆ ಬಂತೊಂದಾನೆ',
    lang: 'kn',
    lines: ['ಆನೆ ಬಂತೊಂದಾನೆ,', 'ಯಾವೂರಾನೆ? ಬಿಜಾಪುರದಾನೆ,', 'ಇಲ್ಲಿಗ್ಯಾಕೆ ಬಂತು? ಹಾದಿ ತಪ್ಪಿ ಬಂತು,', 'ಹಾದಿಗೊಂದು ದುಡ್ಡು, ಬೀದಿಗೊಂದು ದುಡ್ಡು!'],
  ),
];

/// Rhymes: pick one, read it big on the panel, and have the board read it aloud.
class RhymesActivity extends StatefulWidget {
  const RhymesActivity({super.key});

  @override
  State<RhymesActivity> createState() => _RhymesActivityState();
}

class _RhymesActivityState extends State<RhymesActivity> {
  static const _key = 'kinetix.primary.rhymes';
  final _own = <Rhyme>[];
  int _i = 0;

  @override
  void initState() {
    super.initState();
    SharedPreferences.getInstance().then((p) {
      final saved = p.getStringList(_key) ?? const <String>[];
      if (!mounted) return;
      setState(() {
        for (final r in saved) {
          final parts = r.split('\n');
          if (parts.length > 1) _own.add((title: parts.first, lang: 'en', lines: parts.skip(1).toList()));
        }
      });
    }).catchError((_) {});
  }

  List<Rhyme> get _all => [...rhymes, ..._own];

  void _read(BuildContext context, Rhyme r) {
    final scope = ReadAloudScope.maybeOf(context);
    if (scope != null) {
      scope.read(r.title, r.lines);
    } else {
      say(context, r.lines.join(' '));
    }
  }

  Future<void> _add(FeatureStrings s) async {
    final title = TextEditingController(), lines = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (d) => AlertDialog(
        title: Text(s['addRhyme']),
        content: SizedBox(
          width: 420,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(key: const Key('rhyme-title'), controller: title, decoration: InputDecoration(labelText: s['rhymeTitle'])),
              TextField(key: const Key('rhyme-lines'), controller: lines, minLines: 4, maxLines: 8, decoration: InputDecoration(labelText: s['rhymeLines'])),
            ],
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(d, false), child: Text(s['cancel'])),
          FilledButton(key: const Key('rhyme-save'), onPressed: () => Navigator.pop(d, true), child: Text(s['save'])),
        ],
      ),
    );
    final ls = lines.text.split('\n').map((l) => l.trim()).where((l) => l.isNotEmpty).toList();
    if (ok != true || title.text.trim().isEmpty || ls.isEmpty) return;
    setState(() {
      _own.add((title: title.text.trim(), lang: 'en', lines: ls));
      _i = _all.length - 1;
    });
    final value = [for (final r in _own) [r.title, ...r.lines].join('\n')];
    SharedPreferences.getInstance().then((p) => p.setStringList(_key, value)).catchError((_) => false);
  }

  @override
  Widget build(BuildContext context) {
    final s = primaryStrings(context);
    final all = _all;
    final r = all[_i.clamp(0, all.length - 1)];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SizedBox(
          height: 64,
          child: ListView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.all(Kx.s8),
            children: [
              for (final (i, x) in all.indexed)
                Padding(
                  padding: const EdgeInsets.only(right: 6),
                  child: ChoiceChip(key: Key('rhyme-$i'), label: Text(x.title), selected: i == _i, onSelected: (_) => setState(() => _i = i)),
                ),
              ActionChip(key: const Key('rhyme-add'), avatar: const Icon(Icons.add), label: Text(s['addRhyme']), onPressed: () => _add(s)),
            ],
          ),
        ),
        Expanded(
          child: ListView(
            padding: const EdgeInsets.symmetric(horizontal: Kx.s24, vertical: Kx.s8),
            children: [
              Text(r.title, key: const Key('rhyme-heading'), style: context.text.headlineMedium?.copyWith(fontWeight: FontWeight.w800)),
              const SizedBox(height: Kx.s12),
              for (final line in r.lines) Padding(padding: const EdgeInsets.only(bottom: Kx.s8), child: Text(line, style: context.text.headlineSmall)),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.all(Kx.s12),
          child: BigButton(key: const Key('rhyme-read'), icon: Icons.record_voice_over, label: s['readAloud'], onTap: () => _read(context, r)),
        ),
      ],
    );
  }
}

// --- Star wall ---------------------------------------------------------------------------------

/// The class's star wall: every child's name in a big tile; a tap gives a star, the minus takes
/// one back. Stars are the subject kit's class stars (the same count, kept on the board).
class StarWall extends StatefulWidget {
  const StarWall({super.key, required this.board});
  final BoardController board;

  @override
  State<StarWall> createState() => _StarWallState();
}

class _StarWallState extends State<StarWall> {
  Map<String, int> _stars = {};
  String? _last;

  String get _key => 'kinetix.stars.${widget.board.session?.sectionName ?? 'guest'}';

  List<(String id, String name)> get _children {
    final roster = widget.board.roster;
    if (roster.isNotEmpty) return [for (final r in roster) (r.id, r.fullName)];
    return [for (final n in demoClassNames) (n, n)];
  }

  @override
  void initState() {
    super.initState();
    SharedPreferences.getInstance().then((p) {
      final m = <String, int>{};
      for (final r in p.getStringList(_key) ?? const <String>[]) {
        final i = r.lastIndexOf(':');
        if (i > 0) m[r.substring(0, i)] = int.tryParse(r.substring(i + 1)) ?? 0;
      }
      if (mounted) setState(() => _stars = m);
    }).catchError((_) {});
  }

  void _add(String id, int d) {
    setState(() {
      _stars[id] = math.max(0, (_stars[id] ?? 0) + d);
      _last = d > 0 ? id : null;
    });
    final key = _key, value = [for (final e in _stars.entries) '${e.key}:${e.value}'];
    SharedPreferences.getInstance().then((p) => p.setStringList(key, value)).catchError((_) => false);
  }

  @override
  Widget build(BuildContext context) {
    final s = primaryStrings(context);
    final kids = _children;
    final best = kids.isEmpty ? null : (kids.toList()..sort((a, b) => (_stars[b.$1] ?? 0).compareTo(_stars[a.$1] ?? 0))).first;
    final anyStars = _stars.values.any((v) => v > 0);
    return ListView(
      padding: const EdgeInsets.all(Kx.s12),
      children: [
        Text(
          anyStars && best != null ? s.n('starOfDay', best.$2) : s['noStars'],
          key: const Key('star-wall-top'),
          style: context.text.titleLarge?.copyWith(fontWeight: FontWeight.w700),
        ),
        const SizedBox(height: Kx.s12),
        Wrap(
          spacing: Kx.s8,
          runSpacing: Kx.s8,
          children: [
            for (final (id, name) in kids)
              AnimatedScale(
                scale: _last == id ? 1.06 : 1,
                duration: Kx.fast,
                child: Material(
                  color: (_stars[id] ?? 0) > 0 ? const Color(0xFFFFF3C4) : context.colors.surfaceContainerLow,
                  borderRadius: Kx.radiusLg,
                  child: InkWell(
                    key: Key('star-$id'),
                    borderRadius: Kx.radiusLg,
                    onTap: () {
                      _add(id, 1);
                      say(context, name);
                    },
                    child: Container(
                      width: 168,
                      constraints: const BoxConstraints(minHeight: 96),
                      padding: const EdgeInsets.all(Kx.s8),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Expanded(child: Text(name, maxLines: 2, overflow: TextOverflow.ellipsis, style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w700))),
                              IconButton(key: Key('star-minus-$id'), tooltip: '−1', onPressed: () => _add(id, -1), icon: const Icon(Icons.remove_circle_outline)),
                            ],
                          ),
                          Wrap(
                            children: [
                              for (var i = 0; i < math.min(10, _stars[id] ?? 0); i++) const Icon(Icons.star_rounded, color: Color(0xFFF9AB00), size: 26),
                              if ((_stars[id] ?? 0) > 10) Text(' +${(_stars[id] ?? 0) - 10}'),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
          ],
        ),
        const SizedBox(height: Kx.s12),
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton.icon(
            key: const Key('star-reset'),
            onPressed: () {
              for (final id in _stars.keys.toList()) {
                _stars[id] = 0;
              }
              _add(kids.isEmpty ? '_' : kids.first.$1, 0);
            },
            icon: const Icon(Icons.restart_alt),
            label: Text(s['reset']),
          ),
        ),
      ],
    );
  }
}

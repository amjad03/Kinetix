import 'dart:async';
import 'dart:math' as math;

import 'package:clock/clock.dart';
import 'package:flutter/material.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../l10n/feature_strings.dart';
import '../board/chrome.dart' show showBoardMessage;
import '../extras/board_table.dart';
import '../primary/activities.dart' show say;

FeatureStrings aidStrings(BuildContext context) => FeatureStrings(boardLang(context), aidStringTable);

const aidStringTable = <String, Map<String, String>>{
  'en': {
    'organisers': 'Graphic organisers',
    'venn2': 'Venn diagram (2)',
    'venn3': 'Venn diagram (3)',
    'kwl': 'KWL chart',
    'tchart': 'T-chart',
    'mindmap': 'Mind map',
    'cycle': 'Cycle',
    'fishbone': 'Cause and effect',
    'know': 'What I Know',
    'want': 'What I Want to know',
    'learnt': 'What I Learnt',
    'pros': 'For',
    'cons': 'Against',
    'topic': 'Topic',
    'idea': 'Idea',
    'step': 'Step',
    'effect': 'Effect',
    'cause': 'Cause',
    'onBoard': 'On the board: write in it with the pen',
    'clock': 'Teaching clock',
    'clockHint': 'Drag the long hand; the short hand follows.',
    'whatTime': 'What time is it?',
    'showTime': 'Show the time',
    'now': 'Now',
    'scoreboard': 'Scoreboard',
    'team': 'Team {n}',
    'addTeam': 'Add a team',
    'reset': 'Reset',
    'leader': '{n} leads',
    'exam': 'Exam clock',
    'examTitle': 'Internal test',
    'duration': 'Duration (minutes)',
    'start': 'Start',
    'stop': 'Stop',
    'left': 'Time left',
    'ends': 'Ends at {n}',
    'over': 'Time is up. Pens down.',
    'instructions': 'Instructions',
    'defaultInstructions': 'Write your name and roll number. Answer all questions. No phones or notes.',
  },
  'hi': {
    'organisers': 'ग्राफ़िक ऑर्गनाइज़र',
    'venn2': 'वेन आरेख (2)',
    'venn3': 'वेन आरेख (3)',
    'kwl': 'KWL चार्ट',
    'tchart': 'T-चार्ट',
    'mindmap': 'माइंड मैप',
    'cycle': 'चक्र',
    'fishbone': 'कारण और प्रभाव',
    'know': 'मैं क्या जानता हूँ',
    'want': 'मैं क्या जानना चाहता हूँ',
    'learnt': 'मैंने क्या सीखा',
    'pros': 'पक्ष',
    'cons': 'विपक्ष',
    'topic': 'विषय',
    'idea': 'विचार',
    'step': 'चरण',
    'effect': 'प्रभाव',
    'cause': 'कारण',
    'onBoard': 'बोर्ड पर: पेन से इसमें लिखें',
    'clock': 'शिक्षण घड़ी',
    'clockHint': 'बड़ी सुई खींचें; छोटी सुई साथ चलेगी।',
    'whatTime': 'कितने बजे हैं?',
    'showTime': 'समय दिखाएँ',
    'now': 'अभी',
    'scoreboard': 'स्कोरबोर्ड',
    'team': 'टीम {n}',
    'addTeam': 'टीम जोड़ें',
    'reset': 'रीसेट',
    'leader': '{n} आगे है',
    'exam': 'परीक्षा घड़ी',
    'examTitle': 'आंतरिक परीक्षा',
    'duration': 'अवधि (मिनट)',
    'start': 'शुरू करें',
    'stop': 'रोकें',
    'left': 'बचा समय',
    'ends': '{n} पर समाप्त',
    'over': 'समय समाप्त। पेन नीचे रखें।',
    'instructions': 'निर्देश',
    'defaultInstructions': 'अपना नाम और अनुक्रमांक लिखें। सभी प्रश्नों के उत्तर दें। फ़ोन या नोट्स नहीं।',
  },
  'kn': {
    'organisers': 'ಗ್ರಾಫಿಕ್ ಆರ್ಗನೈಸರ್‌ಗಳು',
    'venn2': 'ವೆನ್ ಚಿತ್ರ (2)',
    'venn3': 'ವೆನ್ ಚಿತ್ರ (3)',
    'kwl': 'KWL ಚಾರ್ಟ್',
    'tchart': 'T-ಚಾರ್ಟ್',
    'mindmap': 'ಮೈಂಡ್ ಮ್ಯಾಪ್',
    'cycle': 'ಚಕ್ರ',
    'fishbone': 'ಕಾರಣ ಮತ್ತು ಪರಿಣಾಮ',
    'know': 'ನನಗೆ ಏನು ಗೊತ್ತು',
    'want': 'ನಾನು ಏನು ತಿಳಿಯಬೇಕು',
    'learnt': 'ನಾನು ಏನು ಕಲಿತೆ',
    'pros': 'ಪರ',
    'cons': 'ವಿರುದ್ಧ',
    'topic': 'ವಿಷಯ',
    'idea': 'ಆಲೋಚನೆ',
    'step': 'ಹಂತ',
    'effect': 'ಪರಿಣಾಮ',
    'cause': 'ಕಾರಣ',
    'onBoard': 'ಬೋರ್ಡ್‌ನಲ್ಲಿ: ಪೆನ್‌ನಿಂದ ಇದರಲ್ಲಿ ಬರೆಯಿರಿ',
    'clock': 'ಕಲಿಕೆಯ ಗಡಿಯಾರ',
    'clockHint': 'ಉದ್ದದ ಮುಳ್ಳನ್ನು ಎಳೆಯಿರಿ; ಚಿಕ್ಕ ಮುಳ್ಳು ಹಿಂಬಾಲಿಸುತ್ತದೆ.',
    'whatTime': 'ಈಗ ಸಮಯ ಎಷ್ಟು?',
    'showTime': 'ಸಮಯ ತೋರಿಸಿ',
    'now': 'ಈಗ',
    'scoreboard': 'ಸ್ಕೋರ್‌ಬೋರ್ಡ್',
    'team': 'ತಂಡ {n}',
    'addTeam': 'ತಂಡ ಸೇರಿಸಿ',
    'reset': 'ಮರುಹೊಂದಿಸಿ',
    'leader': '{n} ಮುಂದಿದೆ',
    'exam': 'ಪರೀಕ್ಷಾ ಗಡಿಯಾರ',
    'examTitle': 'ಆಂತರಿಕ ಪರೀಕ್ಷೆ',
    'duration': 'ಅವಧಿ (ನಿಮಿಷ)',
    'start': 'ಆರಂಭಿಸಿ',
    'stop': 'ನಿಲ್ಲಿಸಿ',
    'left': 'ಉಳಿದ ಸಮಯ',
    'ends': '{n} ಕ್ಕೆ ಮುಕ್ತಾಯ',
    'over': 'ಸಮಯ ಮುಗಿಯಿತು. ಪೆನ್ ಕೆಳಗಿಡಿ.',
    'instructions': 'ಸೂಚನೆಗಳು',
    'defaultInstructions': 'ನಿಮ್ಮ ಹೆಸರು ಮತ್ತು ಕ್ರಮ ಸಂಖ್ಯೆ ಬರೆಯಿರಿ. ಎಲ್ಲ ಪ್ರಶ್ನೆಗಳಿಗೆ ಉತ್ತರಿಸಿ. ಫೋನ್ ಅಥವಾ ಟಿಪ್ಪಣಿ ಬೇಡ.',
  },
};

// --- Graphic organisers -------------------------------------------------------------------------

enum Organiser { venn2, venn3, kwl, tchart, mindmap, cycle, fishbone }

/// A graphic organiser as ordinary board elements, ready to write in.
List<BoardElement> organiserElements(Organiser o, FeatureStrings s, Color ink) {
  const a = Color(0x334F8CFF), b = Color(0x33FF5A5F), c = Color(0x333CB44B);
  switch (o) {
    case Organiser.venn2:
      return [
        boardShape(ShapeKind.circle, const Offset(200, 200), const Offset(380, 200), ink, fill: a),
        boardShape(ShapeKind.circle, const Offset(440, 200), const Offset(620, 200), ink, fill: b),
        boardLabel('A', const Offset(120, 200), ink, size: 30, bold: true, center: true),
        boardLabel('B', const Offset(520, 200), ink, size: 30, bold: true, center: true),
        boardLabel('A ∩ B', const Offset(320, 200), ink, size: 22, center: true),
      ];
    case Organiser.venn3:
      return [
        boardShape(ShapeKind.circle, const Offset(240, 180), const Offset(400, 180), ink, fill: a),
        boardShape(ShapeKind.circle, const Offset(420, 180), const Offset(580, 180), ink, fill: b),
        boardShape(ShapeKind.circle, const Offset(330, 330), const Offset(490, 330), ink, fill: c),
        boardLabel('A', const Offset(170, 140), ink, size: 30, bold: true, center: true),
        boardLabel('B', const Offset(490, 140), ink, size: 30, bold: true, center: true),
        boardLabel('C', const Offset(330, 420), ink, size: 30, bold: true, center: true),
      ];
    case Organiser.kwl:
      return boardTable([
        [s['know'], s['want'], s['learnt']],
        for (var i = 0; i < 5; i++) ['                    ', '                    ', '                    '],
      ], ink, size: 22, header: a);
    case Organiser.tchart:
      return [
        boardLabel(s['pros'], const Offset(160, 20), ink, size: 30, bold: true, center: true),
        boardLabel(s['cons'], const Offset(480, 20), ink, size: 30, bold: true, center: true),
        boardLine(const Offset(0, 50), const Offset(640, 50), ink, w: 4),
        boardLine(const Offset(320, 50), const Offset(320, 440), ink, w: 4),
      ];
    case Organiser.mindmap:
      final out = <BoardElement>[
        boardShape(ShapeKind.ellipse, const Offset(220, 190), const Offset(420, 270), ink, fill: a),
        boardLabel(s['topic'], const Offset(320, 230), ink, size: 28, bold: true, center: true),
      ];
      for (var i = 0; i < 6; i++) {
        final ang = -math.pi / 2 + i * math.pi / 3;
        final end = const Offset(320, 230) + Offset(math.cos(ang) * 260, math.sin(ang) * 170);
        final start = const Offset(320, 230) + Offset(math.cos(ang) * 105, math.sin(ang) * 45);
        out
          ..add(boardLine(start, end, ink, w: 3))
          ..add(boardShape(ShapeKind.rectangle, end - const Offset(70, 26), end + const Offset(70, 26), ink, fill: i.isEven ? b : c))
          ..add(boardLabel('${s['idea']} ${i + 1}', end, ink, size: 20, center: true));
      }
      return out;
    case Organiser.cycle:
      final out = <BoardElement>[];
      const n = 4;
      for (var i = 0; i < n; i++) {
        final ang = -math.pi / 2 + i * 2 * math.pi / n;
        final p = const Offset(300, 240) + Offset(math.cos(ang) * 200, math.sin(ang) * 170);
        final q = const Offset(300, 240) + Offset(math.cos(ang + 2 * math.pi / n) * 200, math.sin(ang + 2 * math.pi / n) * 170);
        out
          ..add(boardShape(ShapeKind.ellipse, p - const Offset(80, 32), p + const Offset(80, 32), ink, fill: i.isEven ? a : c))
          ..add(boardLabel('${s['step']} ${i + 1}', p, ink, size: 22, center: true))
          ..add(boardShape(ShapeKind.arrow, Offset.lerp(p, q, 0.3)!, Offset.lerp(p, q, 0.7)!, ink, w: 3));
      }
      return out;
    case Organiser.fishbone:
      final out = <BoardElement>[
        boardShape(ShapeKind.arrow, const Offset(0, 200), const Offset(600, 200), ink, w: 4),
        boardShape(ShapeKind.rectangle, const Offset(610, 160), const Offset(760, 240), ink, fill: b),
        boardLabel(s['effect'], const Offset(685, 200), ink, size: 24, bold: true, center: true),
      ];
      for (var i = 0; i < 3; i++) {
        final x = 120.0 + i * 160;
        out
          ..add(boardLine(Offset(x, 60), Offset(x + 80, 200), ink, w: 3))
          ..add(boardLine(Offset(x, 340), Offset(x + 80, 200), ink, w: 3))
          ..add(boardLabel('${s['cause']} ${i * 2 + 1}', Offset(x - 20, 36), ink, size: 18, center: true))
          ..add(boardLabel('${s['cause']} ${i * 2 + 2}', Offset(x - 20, 364), ink, size: 18, center: true));
      }
      return out;
  }
}

/// The organisers to pick from; one tap puts it on the board.
class OrganisersPanel extends StatelessWidget {
  const OrganisersPanel({super.key, required this.wb});
  final WhiteboardController wb;

  static const _icons = {
    Organiser.venn2: Icons.join_inner,
    Organiser.venn3: Icons.workspaces_outline,
    Organiser.kwl: Icons.view_column_outlined,
    Organiser.tchart: Icons.vertical_split_outlined,
    Organiser.mindmap: Icons.hub_outlined,
    Organiser.cycle: Icons.autorenew,
    Organiser.fishbone: Icons.account_tree_outlined,
  };

  @override
  Widget build(BuildContext context) {
    final s = aidStrings(context);
    return GridView.extent(
      key: const Key('organisers-panel'),
      padding: const EdgeInsets.all(Kx.s16),
      maxCrossAxisExtent: 180,
      mainAxisSpacing: Kx.s12,
      crossAxisSpacing: Kx.s12,
      children: [
        for (final o in Organiser.values)
          Material(
            color: context.colors.surfaceContainerLow,
            borderRadius: Kx.radiusLg,
            child: InkWell(
              key: Key('organiser-${o.name}'),
              borderRadius: Kx.radiusLg,
              onTap: () {
                final ink = wb.background.isDark ? WhiteboardController.chalkWhite : WhiteboardController.inkBlack;
                wb.insert(organiserElements(o, s, ink));
                showBoardMessage(context, s['onBoard']);
              },
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [Icon(_icons[o], size: 48), const SizedBox(height: Kx.s8), Text(s[o.name], textAlign: TextAlign.center)],
              ),
            ),
          ),
      ],
    );
  }
}

// --- Teaching clock -----------------------------------------------------------------------------

/// "7:05" for [minutes] since midnight (12-hour, as children read a clock face).
String clockText(int minutes) {
  final h = (minutes ~/ 60) % 12;
  return '${h == 0 ? 12 : h}:${(minutes % 60).toString().padLeft(2, '0')}';
}

/// A clock face for telling the time: drag the minute hand (the hour hand follows), read the
/// time, or ask the class "What time is it?" with a random time.
class TeachingClockPanel extends StatefulWidget {
  const TeachingClockPanel({super.key, this.random});
  final math.Random? random;

  @override
  State<TeachingClockPanel> createState() => TeachingClockPanelState();
}

class TeachingClockPanelState extends State<TeachingClockPanel> {
  int minutes = 3 * 60;
  bool _hidden = false;
  late final math.Random _rand = widget.random ?? math.Random();

  void _drag(Offset local, Size size) {
    final c = size.center(Offset.zero);
    final v = local - c;
    var ang = math.atan2(v.dy, v.dx) + math.pi / 2;
    if (ang < 0) ang += 2 * math.pi;
    final m = (ang / (2 * math.pi) * 60).round() % 60;
    final hour = minutes ~/ 60;
    final old = minutes % 60;
    var h = hour;
    if (old > 45 && m < 15) h++;
    if (old < 15 && m > 45) h--;
    setState(() => minutes = ((h % 24) * 60 + m) % (24 * 60));
  }

  @override
  Widget build(BuildContext context) {
    final s = aidStrings(context);
    return LayoutBuilder(
      builder: (context, box) {
        final side = math.min(box.maxWidth - 32, box.maxHeight - 180).clamp(160.0, 560.0);
        return ListView(
          key: const Key('teaching-clock'),
          padding: const EdgeInsets.all(Kx.s16),
          children: [
            Text(s['clockHint'], style: context.text.bodySmall),
            const SizedBox(height: Kx.s8),
            Center(
              child: GestureDetector(
                key: const Key('clock-face'),
                onPanUpdate: (d) => _drag(d.localPosition, Size.square(side)),
                onTapDown: (d) => _drag(d.localPosition, Size.square(side)),
                child: CustomPaint(size: Size.square(side), painter: _ClockPainter(minutes, context.colors.primary)),
              ),
            ),
            const SizedBox(height: Kx.s12),
            Center(
              child: Text(_hidden ? '?' : clockText(minutes), key: const Key('clock-text'), style: context.text.displayMedium?.copyWith(fontWeight: FontWeight.w800)),
            ),
            const SizedBox(height: Kx.s12),
            Wrap(
              alignment: WrapAlignment.center,
              spacing: Kx.s8,
              runSpacing: Kx.s8,
              children: [
                FilledButton.tonalIcon(
                  key: const Key('clock-random'),
                  onPressed: () => setState(() {
                    minutes = (1 + _rand.nextInt(12)) * 60 + _rand.nextInt(12) * 5;
                    _hidden = true;
                  }),
                  icon: const Icon(Icons.help_outline),
                  label: Text(s['whatTime']),
                ),
                FilledButton.tonalIcon(
                  key: const Key('clock-show'),
                  onPressed: () {
                    setState(() => _hidden = false);
                    say(context, clockText(minutes));
                  },
                  icon: const Icon(Icons.visibility_outlined),
                  label: Text(s['showTime']),
                ),
                OutlinedButton(
                  key: const Key('clock-now'),
                  onPressed: () => setState(() {
                    final n = clock.now();
                    minutes = n.hour * 60 + n.minute;
                    _hidden = false;
                  }),
                  child: Text(s['now']),
                ),
              ],
            ),
          ],
        );
      },
    );
  }
}

class _ClockPainter extends CustomPainter {
  _ClockPainter(this.minutes, this.accent);
  final int minutes;
  final Color accent;

  @override
  void paint(Canvas canvas, Size size) {
    final c = size.center(Offset.zero);
    final r = size.shortestSide / 2 - 4;
    canvas.drawCircle(c, r, Paint()..color = const Color(0xFFFFFDF5));
    canvas.drawCircle(
      c,
      r,
      Paint()
        ..color = const Color(0xFF1B1F24)
        ..style = PaintingStyle.stroke
        ..strokeWidth = r / 30,
    );
    for (var i = 0; i < 60; i++) {
      final a = i * math.pi / 30 - math.pi / 2;
      final big = i % 5 == 0;
      final p1 = c + Offset(math.cos(a), math.sin(a)) * (r * (big ? 0.86 : 0.92));
      final p2 = c + Offset(math.cos(a), math.sin(a)) * (r * 0.97);
      canvas.drawLine(p1, p2, Paint()
        ..color = const Color(0xFF1B1F24)
        ..strokeWidth = big ? r / 50 : r / 120);
    }
    for (var h = 1; h <= 12; h++) {
      final a = h * math.pi / 6 - math.pi / 2;
      final tp = TextPainter(
        text: TextSpan(text: '$h', style: TextStyle(fontSize: r / 6, fontWeight: FontWeight.w700, color: const Color(0xFF1B1F24))),
        textDirection: TextDirection.ltr,
      )..layout();
      tp.paint(canvas, c + Offset(math.cos(a), math.sin(a)) * r * 0.72 - Offset(tp.width / 2, tp.height / 2));
    }
    final m = minutes % 60, h = (minutes / 60) % 12;
    void hand(double turns, double len, double w, Color col) {
      final a = turns * 2 * math.pi - math.pi / 2;
      canvas.drawLine(c, c + Offset(math.cos(a), math.sin(a)) * len, Paint()
        ..color = col
        ..strokeWidth = w
        ..strokeCap = StrokeCap.round);
    }

    hand(h / 12, r * 0.5, r / 14, const Color(0xFF1B1F24));
    hand(m / 60, r * 0.8, r / 22, accent);
    canvas.drawCircle(c, r / 18, Paint()..color = const Color(0xFF1B1F24));
  }

  @override
  bool shouldRepaint(_ClockPainter old) => old.minutes != minutes || old.accent != accent;
}

// --- Scoreboard ---------------------------------------------------------------------------------

/// Team scores for quizzes and debates: big +/− for each team, names editable.
class ScoreboardPanel extends StatefulWidget {
  const ScoreboardPanel({super.key});

  @override
  State<ScoreboardPanel> createState() => ScoreboardPanelState();
}

class ScoreboardPanelState extends State<ScoreboardPanel> {
  final names = <String>[];
  final scores = <int>[0, 0];
  static const _colors = [Color(0xFF4F8CFF), Color(0xFFFF5A5F), Color(0xFF3CB44B), Color(0xFFFFA64D), Color(0xFFB06CFF), Color(0xFF00ACC1)];

  @override
  Widget build(BuildContext context) {
    final s = aidStrings(context);
    while (names.length < scores.length) {
      names.add(s.n('team', names.length + 1));
    }
    final best = scores.reduce(math.max);
    final leaders = [for (var i = 0; i < scores.length; i++) if (scores[i] == best && best > 0) names[i]];
    return ListView(
      key: const Key('scoreboard'),
      padding: const EdgeInsets.all(Kx.s16),
      children: [
        if (leaders.length == 1) Text(s.n('leader', leaders.first), key: const Key('score-leader'), style: context.text.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
        const SizedBox(height: Kx.s8),
        Wrap(
          spacing: Kx.s12,
          runSpacing: Kx.s12,
          children: [
            for (var i = 0; i < scores.length; i++)
              Container(
                width: 200,
                padding: const EdgeInsets.all(Kx.s12),
                decoration: BoxDecoration(color: _colors[i % _colors.length].withValues(alpha: 0.16), borderRadius: Kx.radiusLg, border: Border.all(color: _colors[i % _colors.length], width: 3)),
                child: Column(
                  children: [
                    TextFormField(
                      initialValue: names[i],
                      textAlign: TextAlign.center,
                      style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w700),
                      decoration: const InputDecoration(isDense: true, border: InputBorder.none),
                      onChanged: (v) => names[i] = v,
                    ),
                    Text('${scores[i]}', key: Key('score-$i'), style: context.text.displayLarge?.copyWith(fontWeight: FontWeight.w800, color: _colors[i % _colors.length])),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                      children: [
                        IconButton.filledTonal(key: Key('score-minus-$i'), iconSize: 32, onPressed: () => setState(() => scores[i] = math.max(0, scores[i] - 1)), icon: const Icon(Icons.remove)),
                        IconButton.filled(key: Key('score-plus-$i'), iconSize: 32, onPressed: () => setState(() => scores[i]++), icon: const Icon(Icons.add)),
                      ],
                    ),
                  ],
                ),
              ),
          ],
        ),
        const SizedBox(height: Kx.s12),
        Wrap(
          spacing: Kx.s8,
          children: [
            if (scores.length < 6) OutlinedButton.icon(key: const Key('score-add-team'), onPressed: () => setState(() => scores.add(0)), icon: const Icon(Icons.group_add_outlined), label: Text(s['addTeam'])),
            TextButton.icon(key: const Key('score-reset'), onPressed: () => setState(() => scores.fillRange(0, scores.length, 0)), icon: const Icon(Icons.restart_alt), label: Text(s['reset'])),
          ],
        ),
      ],
    );
  }
}

// --- Exam clock ---------------------------------------------------------------------------------

/// For internal tests: the test's name, a big clock, the time left and when it ends, and the
/// instructions, readable from the back of a hall.
class ExamClockPanel extends StatefulWidget {
  const ExamClockPanel({super.key});

  @override
  State<ExamClockPanel> createState() => ExamClockPanelState();
}

class ExamClockPanelState extends State<ExamClockPanel> {
  final _title = TextEditingController();
  final _instructions = TextEditingController();
  int minutes = 60;
  DateTime? endsAt;
  Timer? _tick;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final s = aidStrings(context);
    if (_title.text.isEmpty) _title.text = s['examTitle'];
    if (_instructions.text.isEmpty) _instructions.text = s['defaultInstructions'];
  }

  @override
  void dispose() {
    _tick?.cancel();
    _title.dispose();
    _instructions.dispose();
    super.dispose();
  }

  void start() {
    setState(() => endsAt = clock.now().add(Duration(minutes: minutes)));
    _tick?.cancel();
    _tick = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  void stop() {
    _tick?.cancel();
    setState(() => endsAt = null);
  }

  String _hm(DateTime t) => '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';

  @override
  Widget build(BuildContext context) {
    final s = aidStrings(context);
    final now = clock.now();
    final end = endsAt;
    final left = end?.difference(now);
    String fmt(Duration d) => '${d.inHours > 0 ? '${d.inHours}:' : ''}${(d.inMinutes % 60).toString().padLeft(2, '0')}:${(d.inSeconds % 60).toString().padLeft(2, '0')}';
    final over = left != null && left.isNegative;
    return ListView(
      key: const Key('exam-clock'),
      padding: const EdgeInsets.all(Kx.s16),
      children: [
        TextField(controller: _title, style: context.text.headlineSmall?.copyWith(fontWeight: FontWeight.w700), decoration: const InputDecoration(border: InputBorder.none)),
        Center(child: Text(_hm(now), key: const Key('exam-now'), style: context.text.displayLarge?.copyWith(fontWeight: FontWeight.w800))),
        if (end != null) ...[
          Center(
            child: Text(
              over ? s['over'] : '${s['left']}: ${fmt(left!)}',
              key: const Key('exam-left'),
              style: context.text.headlineMedium?.copyWith(color: over || left.inMinutes < 5 ? Kx.record : null, fontWeight: FontWeight.w700),
            ),
          ),
          Center(child: Text(s.n('ends', _hm(end)), style: context.text.titleMedium)),
        ] else
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text('${s['duration']}: '),
              IconButton(onPressed: minutes <= 5 ? null : () => setState(() => minutes -= 5), icon: const Icon(Icons.remove)),
              Text('$minutes', key: const Key('exam-minutes'), style: context.text.titleLarge),
              IconButton(key: const Key('exam-plus'), onPressed: () => setState(() => minutes += 5), icon: const Icon(Icons.add)),
            ],
          ),
        const SizedBox(height: Kx.s12),
        Center(
          child: end == null
              ? FilledButton.icon(key: const Key('exam-start'), onPressed: start, icon: const Icon(Icons.play_arrow), label: Text(s['start']))
              : OutlinedButton.icon(key: const Key('exam-stop'), onPressed: stop, icon: const Icon(Icons.stop), label: Text(s['stop'])),
        ),
        const SizedBox(height: Kx.s16),
        Text(s['instructions'], style: context.text.titleSmall),
        TextField(controller: _instructions, maxLines: null, style: context.text.titleMedium, decoration: const InputDecoration(border: OutlineInputBorder())),
      ],
    );
  }
}

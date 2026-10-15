import 'dart:math' as math;
import 'dart:ui';

import '../ink_models.dart';

/// Ready-made graphs by subject and topic. Each one is placed as an ordinary, editable
/// [GraphElement]: its letters ([GraphElement.params]) can be changed, its marked points moved.
/// Keywords match the period's topic, so the right graph is offered first.

enum GraphSubject { maths, physics, chemistry, biology, economics, statistics }

/// Words a timetable may use for each subject (English, Hindi and Kannada names included).
const _subjectWords = {
  GraphSubject.maths: ['math', 'maths', 'mathematics', 'algebra', 'geometry', 'calculus', 'गणित', 'ಗಣಿತ'],
  GraphSubject.physics: ['physics', 'science', 'भौतिक', 'ಭೌತ'],
  GraphSubject.chemistry: ['chemistry', 'science', 'रसायन', 'ರಸಾಯನ'],
  GraphSubject.biology: ['biology', 'science', 'botany', 'zoology', 'जीव', 'ಜೀವ'],
  GraphSubject.economics: ['economics', 'commerce', 'business', 'accountancy', 'accounts', 'अर्थशास्त्र', 'वाणिज्य', 'ಅರ್ಥಶಾಸ್ತ್ರ', 'ವಾಣಿಜ್ಯ'],
  GraphSubject.statistics: ['statistics', 'stats', 'probability', 'math', 'maths', 'mathematics', 'सांख्यिकी', 'ಸಂಖ್ಯಾಶಾಸ್ತ್ರ'],
};

/// The subjects a timetable's subject name points to (several for "Science"); empty when none.
List<GraphSubject> subjectsFor(String? name) {
  final n = (name ?? '').toLowerCase().trim();
  if (n.isEmpty) return const [];
  return [
    for (final e in _subjectWords.entries)
      if (e.value.any((w) => n.contains(w))) e.key,
  ];
}

class GraphTemplate {
  const GraphTemplate({
    required this.id,
    required this.subject,
    required this.title,
    required this.keywords,
    required this.expression,
    this.curves = const [],
    this.params = const {},
    this.range = const (-10, 10, -10, 10),
    this.points = const [],
    this.shade,
    this.xLabel = '',
    this.yLabel = '',
    this.aspect = 4 / 3,
    this.pointsFor,
  });

  final String id;
  final GraphSubject subject;

  /// English title (shown translated through the tools' strings by [id]).
  final String title;
  final List<String> keywords;
  final String expression;
  final List<String> curves;
  final Map<String, double> params;

  /// xMin, xMax, yMin, yMax.
  final (double, double, double, double) range;
  final List<GraphPoint> points;
  final GraphShade? shade;
  final String xLabel, yLabel;

  /// Width over height of the graph's card (1 for a circle, so it looks round).
  final double aspect;

  /// Marked points worked out from the parameters (an equilibrium, a break-even point).
  final List<GraphPoint> Function(Map<String, double> p)? pointsFor;

  /// How well this template fits [topic] (0: not at all).
  int score(String? topic) {
    final t = (topic ?? '').toLowerCase();
    if (t.trim().isEmpty) return 0;
    var s = 0;
    for (final k in keywords) {
      if (t.contains(k)) s += k.length > 4 ? 3 : 2;
    }
    if (t.contains(title.toLowerCase())) s += 5;
    return s;
  }

  /// The graph, [width] board units wide, with its top-left at [at].
  GraphElement build({Offset at = Offset.zero, double width = 480, required Color color, String? id, String? title}) {
    final (x0, x1, y0, y1) = range;
    return GraphElement(
      id: id ?? newElementId(),
      rect: at & Size(width, width / aspect),
      expression: expression,
      color: color,
      xMin: x0,
      xMax: x1,
      yMin: y0,
      yMax: y1,
      curves: curves,
      params: params,
      points: pointsFor?.call(params) ?? points,
      shade: shade,
      xLabel: xLabel,
      yLabel: yLabel,
      title: title ?? this.title,
    );
  }
}

const _normal = 'exp(-((x - m)^2)/(2*s^2))/(s*sqrt(2*pi))';

/// Every template, by subject.
final List<GraphTemplate> graphTemplates = [
  // --- Maths ---
  const GraphTemplate(
    id: 'linear',
    subject: GraphSubject.maths,
    title: 'Straight line',
    keywords: ['linear', 'straight line', 'slope', 'gradient', 'y = mx', 'intercept', 'equation of a line'],
    expression: 'm*x + c',
    params: {'m': 2, 'c': 1},
  ),
  const GraphTemplate(
    id: 'quadratic',
    subject: GraphSubject.maths,
    title: 'Quadratic',
    keywords: ['quadratic', 'roots', 'polynomial', 'vertex', 'x^2'],
    expression: 'a*x^2 + b*x + c',
    params: {'a': 1, 'b': 0, 'c': -4},
    range: (-6, 6, -6, 10),
    points: [GraphPoint(-2, 0, 'α'), GraphPoint(2, 0, 'β')],
  ),
  const GraphTemplate(
    id: 'cubic',
    subject: GraphSubject.maths,
    title: 'Cubic',
    keywords: ['cubic', 'polynomial', 'x^3', 'turning point'],
    expression: 'a*x^3 + b*x^2 + c*x + d',
    params: {'a': 1, 'b': 0, 'c': -3, 'd': 0},
    range: (-4, 4, -8, 8),
  ),
  const GraphTemplate(
    id: 'exponential',
    subject: GraphSubject.maths,
    title: 'Exponential',
    keywords: ['exponential', 'growth', 'decay', 'e^x', 'compound'],
    expression: 'a*exp(k*x)',
    params: {'a': 1, 'k': 0.5},
    range: (-5, 5, -1, 10),
  ),
  const GraphTemplate(
    id: 'log',
    subject: GraphSubject.maths,
    title: 'Logarithm',
    keywords: ['logarithm', 'log', 'ln'],
    expression: 'a*ln(x)',
    params: {'a': 1},
    range: (-1, 10, -4, 4),
  ),
  const GraphTemplate(
    id: 'trig',
    subject: GraphSubject.maths,
    title: 'Sine and cosine',
    keywords: ['trigonometry', 'trigonometric', 'sine', 'cosine', 'sin', 'cos', 'wave', 'periodic'],
    expression: 'a*sin(b*x)',
    curves: ['a*cos(b*x)'],
    params: {'a': 1, 'b': 1},
    range: (-7, 7, -2, 2),
  ),
  const GraphTemplate(
    id: 'circle',
    subject: GraphSubject.maths,
    title: 'Circle',
    keywords: ['circle', 'radius', 'conic', 'centre'],
    expression: 'sqrt(r^2 - (x - h)^2) + k',
    curves: ['-sqrt(r^2 - (x - h)^2) + k'],
    params: {'r': 4, 'h': 0, 'k': 0},
    range: (-8, 8, -8, 8),
    aspect: 1,
    points: [GraphPoint(0, 0, 'O')],
  ),
  GraphTemplate(
    id: 'parabola',
    subject: GraphSubject.maths,
    title: 'Parabola',
    keywords: const ['parabola', 'focus', 'directrix', 'conic'],
    expression: '(x - h)^2/(4*p) + k',
    curves: const ['k - p'],
    params: const {'p': 1, 'h': 0, 'k': 0},
    range: const (-8, 8, -4, 10),
    pointsFor: (p) => [GraphPoint(p['h']!, p['k']! + p['p']!, 'F')],
  ),
  // --- Physics ---
  const GraphTemplate(
    id: 'vt',
    subject: GraphSubject.physics,
    title: 'Velocity–time',
    keywords: ['velocity', 'v-t', 'v–t', 'acceleration', 'motion', 'kinematics', 'uniformly accelerated'],
    expression: 'u + a*x',
    params: {'u': 2, 'a': 1.5},
    range: (0, 10, 0, 20),
    shade: GraphShade(0, 6),
    xLabel: 't (s)',
    yLabel: 'v (m/s)',
  ),
  const GraphTemplate(
    id: 'st',
    subject: GraphSubject.physics,
    title: 'Distance–time',
    keywords: ['distance', 'displacement', 's-t', 's–t', 'motion', 'kinematics', 'speed'],
    expression: 'u*x + 0.5*a*x^2',
    params: {'u': 0, 'a': 2},
    range: (0, 10, 0, 100),
    xLabel: 't (s)',
    yLabel: 's (m)',
  ),
  const GraphTemplate(
    id: 'ohm',
    subject: GraphSubject.physics,
    title: "Ohm's law",
    keywords: ['ohm', 'current', 'voltage', 'resistance', 'electricity', 'v-i', 'potential difference'],
    expression: 'x/r',
    params: {'r': 5},
    range: (0, 12, 0, 3),
    xLabel: 'V (volt)',
    yLabel: 'I (ampere)',
  ),
  const GraphTemplate(
    id: 'projectile',
    subject: GraphSubject.physics,
    title: 'Projectile',
    keywords: ['projectile', 'trajectory', 'range', 'motion in a plane', 'angle of projection'],
    expression: 'x*tan(k*pi/180) - 9.8*x^2/(2*u^2*(cos(k*pi/180))^2)',
    params: {'u': 20, 'k': 45},
    range: (0, 45, 0, 15),
    xLabel: 'x (m)',
    yLabel: 'y (m)',
  ),
  const GraphTemplate(
    id: 'shm',
    subject: GraphSubject.physics,
    title: 'Simple harmonic motion',
    keywords: ['shm', 'harmonic', 'oscillation', 'pendulum', 'spring', 'oscillations'],
    expression: 'a*sin(w*x)',
    curves: ['a*w*cos(w*x)'],
    params: {'a': 2, 'w': 1},
    range: (0, 12, -3, 3),
    xLabel: 't',
    yLabel: 'x, v',
  ),
  // --- Chemistry ---
  GraphTemplate(
    id: 'titration',
    subject: GraphSubject.chemistry,
    title: 'Titration curve',
    keywords: const ['titration', 'ph', 'acid', 'base', 'neutralisation', 'neutralization', 'equivalence'],
    expression: '1 + 12/(1 + exp(-(x - v)*2))',
    params: const {'v': 25},
    range: const (0, 50, 0, 14),
    xLabel: 'Base added (mL)',
    yLabel: 'pH',
    pointsFor: (p) => [GraphPoint(p['v']!, 7, 'Eq')],
  ),
  const GraphTemplate(
    id: 'rate',
    subject: GraphSubject.chemistry,
    title: 'Rate vs concentration',
    keywords: ['rate', 'kinetics', 'order of reaction', 'concentration', 'rate law'],
    expression: 'k*x^n',
    params: {'k': 0.5, 'n': 1},
    range: (0, 10, 0, 10),
    xLabel: '[A] (mol/L)',
    yLabel: 'Rate',
  ),
  const GraphTemplate(
    id: 'boyle',
    subject: GraphSubject.chemistry,
    title: "Boyle's law",
    keywords: ['boyle', 'gas laws', 'pressure', 'volume', 'gaseous state', 'states of matter'],
    expression: 'k/x',
    params: {'k': 100},
    range: (0, 50, 0, 50),
    xLabel: 'V',
    yLabel: 'P',
  ),
  // --- Biology ---
  const GraphTemplate(
    id: 'population',
    subject: GraphSubject.biology,
    title: 'Population growth',
    keywords: ['population', 'growth', 'logistic', 'carrying capacity', 'ecology', 'exponential growth'],
    expression: 'k/(1 + (k/p - 1)*exp(-r*x))',
    curves: ['p*exp(r*x)'],
    params: {'k': 1000, 'p': 10, 'r': 0.5},
    range: (0, 30, 0, 1200),
    xLabel: 'Time',
    yLabel: 'Population',
  ),
  GraphTemplate(
    id: 'enzymeTemp',
    subject: GraphSubject.biology,
    title: 'Enzyme activity vs temperature',
    keywords: const ['enzyme', 'temperature', 'optimum', 'denature', 'digestion', 'biomolecules'],
    expression: 'a*exp(-((x - t)^2)/(2*w^2))',
    params: const {'a': 100, 't': 37, 'w': 8},
    range: const (0, 80, 0, 110),
    xLabel: 'Temperature (°C)',
    yLabel: 'Activity (%)',
    pointsFor: (p) => [GraphPoint(p['t']!, p['a']!, 'Optimum')],
  ),
  GraphTemplate(
    id: 'enzymePh',
    subject: GraphSubject.biology,
    title: 'Enzyme activity vs pH',
    keywords: const ['enzyme', 'ph', 'optimum', 'digestion', 'biomolecules'],
    expression: 'a*exp(-((x - p)^2)/(2*w^2))',
    params: const {'a': 100, 'p': 7, 'w': 1.2},
    range: const (0, 14, 0, 110),
    xLabel: 'pH',
    yLabel: 'Activity (%)',
    pointsFor: (p) => [GraphPoint(p['p']!, p['a']!, 'Optimum')],
  ),
  // --- Economics and commerce ---
  GraphTemplate(
    id: 'demandSupply',
    subject: GraphSubject.economics,
    title: 'Demand and supply',
    keywords: const ['demand', 'supply', 'equilibrium', 'market', 'price determination'],
    expression: 'a - b*x',
    curves: const ['c + d*x'],
    params: const {'a': 10, 'b': 1, 'c': 2, 'd': 1},
    range: const (0, 10, 0, 12),
    xLabel: 'Quantity',
    yLabel: 'Price',
    pointsFor: (p) {
      final q = (p['a']! - p['c']!) / (p['b']! + p['d']!);
      return [GraphPoint(q, p['a']! - p['b']! * q, 'E')];
    },
  ),
  const GraphTemplate(
    id: 'costCurves',
    subject: GraphSubject.economics,
    title: 'Cost curves',
    keywords: ['cost', 'average cost', 'marginal cost', 'production', 'ac', 'mc', 'avc'],
    expression: 'f/x + a + b*x',
    curves: ['a + 2*b*x', 'a + b*x'],
    params: {'f': 20, 'a': 2, 'b': 0.5},
    range: (0, 15, 0, 20),
    xLabel: 'Output',
    yLabel: 'Cost',
  ),
  GraphTemplate(
    id: 'breakEven',
    subject: GraphSubject.economics,
    title: 'Break-even',
    keywords: const ['break-even', 'break even', 'profit', 'fixed cost', 'revenue', 'cost-volume'],
    expression: 'p*x',
    curves: const ['f + v*x'],
    params: const {'p': 10, 'f': 200, 'v': 5},
    range: const (0, 80, 0, 800),
    shade: const GraphShade(40, 80, between: true),
    xLabel: 'Units',
    yLabel: '₹',
    pointsFor: (p) {
      final q = p['f']! / math.max(1e-9, p['p']! - p['v']!);
      return [GraphPoint(q, p['p']! * q, 'BEP')];
    },
  ),
  const GraphTemplate(
    id: 'ppf',
    subject: GraphSubject.economics,
    title: 'Production possibility frontier',
    keywords: ['ppf', 'ppc', 'production possibility', 'opportunity cost', 'scarcity', 'central problems'],
    expression: 'sqrt(m^2 - x^2)',
    params: {'m': 10},
    range: (0, 12, 0, 12),
    aspect: 1,
    xLabel: 'Good X',
    yLabel: 'Good Y',
  ),
  const GraphTemplate(
    id: 'lorenz',
    subject: GraphSubject.economics,
    title: 'Lorenz curve',
    keywords: ['lorenz', 'inequality', 'gini', 'income distribution', 'poverty'],
    expression: 'x^k',
    curves: ['x'],
    params: {'k': 2},
    range: (0, 1, 0, 1),
    aspect: 1,
    shade: GraphShade(0, 1, between: true),
    xLabel: 'Population share',
    yLabel: 'Income share',
  ),
  // --- Statistics ---
  const GraphTemplate(
    id: 'normal',
    subject: GraphSubject.statistics,
    title: 'Normal distribution',
    keywords: ['normal', 'gaussian', 'bell curve', 'standard deviation', 'distribution', 'z-score'],
    expression: _normal,
    params: {'m': 0, 's': 1},
    range: (-4, 4, 0, 0.5),
    shade: GraphShade(-1, 1),
    xLabel: 'x',
    yLabel: 'f(x)',
  ),
];

/// Templates for a period: those of [subject] (all when none is known), best match for [topic]
/// first, filtered by [query] when given.
List<GraphTemplate> matchGraphTemplates({String? subject, String? topic, String query = ''}) {
  final subjects = subjectsFor(subject);
  final q = query.toLowerCase().trim();
  final list = [
    for (final t in graphTemplates)
      if ((subjects.isEmpty || subjects.contains(t.subject)) &&
          (q.isEmpty || t.title.toLowerCase().contains(q) || t.keywords.any((k) => k.contains(q)) || t.id.toLowerCase().contains(q)))
        t,
  ];
  final scored = [for (var i = 0; i < list.length; i++) (list[i], list[i].score(topic), i)];
  scored.sort((a, b) => a.$2 != b.$2 ? b.$2.compareTo(a.$2) : a.$3.compareTo(b.$3));
  return [for (final s in scored) s.$1];
}

/// The template that fits [topic] best, or null when none does.
GraphTemplate? preselectGraphTemplate({String? subject, String? topic}) {
  final m = matchGraphTemplates(subject: subject, topic: topic);
  return m.isNotEmpty && m.first.score(topic) > 0 ? m.first : null;
}

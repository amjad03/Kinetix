part of 'ink_models.dart';

// --- Live business panels ---------------------------------------------------------------------

/// What a [KitElement] shows: a BCG growth–share matrix, a decision tree, a break-even chart or
/// a chart from data (biz_models.dart); or, for civil engineering, a beam (reactions, SFD, BMD,
/// deflection), a plane truss, a level book, a compass traverse or a contour sketch; for
/// electronics and communication, a logic circuit, a timing diagram, a signal and its spectrum, a
/// Bode plot or a microcontroller pin diagram (ece_models.dart, logic_models.dart, ece_pins.dart);
/// (civil_models.dart); for chemical engineering, a process flow diagram or a unit operation
/// (chem_models.dart); for EV technology, a charging circuit or the power flow (ev_models.dart);
/// for mechanical engineering, a drawing sheet, a thermodynamic cycle's P-V
/// and T-s charts or a free-body diagram (mech_models.dart). Each keeps its figures in
/// [KitElement.data] and is worked out again whenever it is drawn.
enum KitKind { bcg, decisionTree, breakEven, chart, beam, truss, levelBook, traverse, contour, drawingSheet, thermoCycle, fbd, rlc, threePhase, singleLine, waveform, logicCircuit, timing, signal, bode, pinout, csDiagram, nnDiagram, mlPlot, pfd, unitOp, evCharging, evPowerFlow }

/// A live business panel on the board: its figures (JSON, as biz_models.dart writes them) are
/// kept with the page, drawn worked out (quadrants, expected values, the break-even point) and
/// opened again in the board's editor to change. Like a sheet, it is laid out at its natural
/// size ([naturalSize]) and drawn scaled to fill [rect], so resizing it zooms it.
class KitElement extends BoardElement {
  KitElement({required this.id, required this.rect, required this.kind, required Map<String, Object?> data, required this.color, this.rotation = 0})
    : data = Map.unmodifiable(data);

  /// A panel laid out at its natural size, with its top-left corner at the origin.
  factory KitElement.sized({required KitKind kind, required Map<String, Object?> data, required Color color}) =>
      KitElement(id: newElementId(), rect: Offset.zero & naturalSizeOf(kind), kind: kind, data: data, color: color);

  static Size naturalSizeOf(KitKind kind) => switch (kind) {
    KitKind.bcg => const Size(960, 760),
    KitKind.decisionTree => const Size(1200, 720),
    KitKind.breakEven => const Size(1040, 720),
    KitKind.chart => const Size(980, 640),
    KitKind.beam => const Size(1200, 1040),
    KitKind.truss => const Size(1240, 760),
    KitKind.levelBook => const Size(1200, 860),
    KitKind.traverse => const Size(1240, 760),
    KitKind.contour => const Size(1040, 820),
    KitKind.drawingSheet => const Size(1190, 842),
    KitKind.thermoCycle => const Size(1240, 860),
    KitKind.fbd => const Size(1240, 760),
    KitKind.rlc => const Size(1240, 880),
    KitKind.threePhase => const Size(1240, 760),
    KitKind.singleLine => const Size(1240, 860),
    KitKind.waveform => const Size(1240, 800),
    KitKind.logicCircuit => const Size(1240, 820),
    KitKind.timing => const Size(1240, 760),
    KitKind.signal => const Size(1240, 900),
    KitKind.bode => const Size(1240, 900),
    KitKind.pinout => const Size(1240, 1100),
    KitKind.csDiagram => const Size(1240, 860),
    KitKind.nnDiagram => const Size(1240, 820),
    KitKind.mlPlot => const Size(1240, 820),
    KitKind.pfd => const Size(1240, 900),
    KitKind.unitOp => const Size(1240, 800),
    KitKind.evCharging => const Size(1240, 840),
    KitKind.evPowerFlow => const Size(1240, 720),
  };

  @override
  final String id;
  final Rect rect;
  final KitKind kind;
  final Map<String, Object?> data;
  final Color color;
  @override
  final double rotation;

  Size get naturalSize => naturalSizeOf(kind);

  @override
  Rect get frame => rect;
  @override
  Rect get bounds => rotatedBounds(rect, rotation);
  @override
  bool hitTest(Offset p, double radius) => rect.inflate(radius).contains(unturn(p, rect, rotation));

  KitElement copyWith({String? id, Rect? rect, KitKind? kind, Map<String, Object?>? data, Color? color, double? rotation}) => KitElement(
    id: id ?? this.id,
    rect: rect ?? this.rect,
    kind: kind ?? this.kind,
    data: data ?? this.data,
    color: color ?? this.color,
    rotation: rotation ?? this.rotation,
  );

  @override
  KitElement translated(Offset d) => _moved(this, d, copyWith(rect: rect.shift(d)));
  @override
  KitElement scaled(Offset origin, double sx, double sy) => copyWith(rect: _scaleBox(rect, rotation, origin, sx, sy));
  @override
  KitElement rotated(Offset center, double angle) => copyWith(rect: turnFrame(rect, center, angle), rotation: rotation + angle);
  @override
  KitElement recolored(Color c) => copyWith(color: c.withValues(alpha: 1));
  @override
  KitElement withId(String id) => copyWith(id: id);
}

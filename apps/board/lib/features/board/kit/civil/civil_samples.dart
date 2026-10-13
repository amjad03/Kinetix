import 'package:flutter/painting.dart';
import 'package:kinetix_ink/kinetix_ink.dart';

// Worked examples for the civil engineering panels, in the shape the textbooks set them (kN, m).

/// The live panels that belong to the civil kit (the rest are the business panels).
const civilKinds = {KitKind.beam, KitKind.truss, KitKind.levelBook, KitKind.traverse, KitKind.contour};

bool isCivilKit(KitKind k) => civilKinds.contains(k);

KitElement civilPanel(KitKind kind, Map<String, Object?> data, Color accent) => KitElement.sized(kind: kind, data: data, color: accent);

/// A textbook beam of [type]: the editor starts from it.
BeamModel sampleBeam(BeamType type) => switch (type) {
  BeamType.simplySupported => BeamModel(
    title: 'Simply supported beam: UDL',
    length: 6,
    ei: 20000,
    type: type,
    supports: BeamModel.supportsFor(type, 6),
    loads: const [BeamLoad(BeamLoadKind.udl, x: 0, x2: 6, w: 10)],
  ),
  BeamType.cantilever => BeamModel(
    title: 'Cantilever: point load at the free end',
    length: 3,
    ei: 5000,
    type: type,
    supports: BeamModel.supportsFor(type, 3),
    loads: const [BeamLoad(BeamLoadKind.point, x: 3, w: 10)],
  ),
  BeamType.overhanging => BeamModel(
    title: 'Overhanging beam',
    length: 8,
    ei: 30000,
    type: type,
    supports: BeamModel.supportsFor(type, 8, overhang: 2),
    loads: const [BeamLoad(BeamLoadKind.udl, x: 0, x2: 6, w: 10), BeamLoad(BeamLoadKind.point, x: 8, w: 20)],
  ),
  BeamType.propped => BeamModel(
    title: 'Propped cantilever: UDL',
    length: 5,
    ei: 20000,
    type: type,
    supports: BeamModel.supportsFor(type, 5),
    loads: const [BeamLoad(BeamLoadKind.udl, x: 0, x2: 5, w: 12)],
  ),
  BeamType.fixed => BeamModel(
    title: 'Fixed beam: point load and UDL',
    length: 6,
    ei: 40000,
    type: type,
    supports: BeamModel.supportsFor(type, 6),
    loads: const [BeamLoad(BeamLoadKind.point, x: 2, w: 30), BeamLoad(BeamLoadKind.udl, x: 0, x2: 6, w: 5)],
  ),
  BeamType.custom => BeamModel(title: 'Beam', length: 6, type: BeamType.simplySupported, supports: BeamModel.supportsFor(BeamType.simplySupported, 6)),
};

/// A Pratt truss of four 3 m panels, 3 m deep, 10 kN at each inner bottom joint.
const prattTruss = TrussModel(
  title: 'Pratt truss: 4 panels of 3 m',
  nodes: [
    TrussNode(0, 0, label: 'A', support: TrussSupportKind.pin),
    TrussNode(3, 0, label: 'B', fy: -10),
    TrussNode(6, 0, label: 'C', fy: -10),
    TrussNode(9, 0, label: 'D', fy: -10),
    TrussNode(12, 0, label: 'E', support: TrussSupportKind.rollerX),
    TrussNode(3, 3, label: 'F'),
    TrussNode(6, 3, label: 'G'),
    TrussNode(9, 3, label: 'H'),
  ],
  members: [(0, 1), (1, 2), (2, 3), (3, 4), (5, 6), (6, 7), (0, 5), (7, 4), (1, 5), (2, 6), (3, 7), (5, 2), (7, 2)],
);

/// Two 3-4-5 panels with 12 kN at the middle bottom joint.
const simpleTruss = TrussModel(
  title: 'Two-panel truss',
  nodes: [
    TrussNode(0, 0, label: 'A', support: TrussSupportKind.pin),
    TrussNode(3, 0, label: 'B', fy: -12),
    TrussNode(6, 0, label: 'C', support: TrussSupportKind.rollerX),
    TrussNode(3, 4, label: 'D'),
  ],
  members: [(0, 1), (1, 2), (0, 3), (3, 2), (1, 3)],
);

const blankTruss = TrussModel(
  title: 'Truss',
  nodes: [TrussNode(0, 0, label: 'A', support: TrussSupportKind.pin), TrussNode(4, 0, label: 'B', support: TrussSupportKind.rollerX), TrussNode(2, 2, label: 'C', fy: -10)],
  members: [(0, 1), (0, 2), (1, 2)],
);

/// A fly levelling from a bench mark of RL 100.000 with one change point.
LevelBook sampleLevelBook(LevelMethod method) => LevelBook(
  title: method == LevelMethod.riseFall ? 'Level book: rise and fall method' : 'Level book: height of instrument method',
  method: method,
  firstRl: 100,
  rows: const [
    LevelRow('BM', bs: 1.585, remark: 'BM RL 100.000'),
    LevelRow('1', ins: 1.405),
    LevelRow('2', ins: 1.150),
    LevelRow('CP1', fs: 1.820, bs: 2.010, remark: 'Change point'),
    LevelRow('3', ins: 1.565),
    LevelRow('4', fs: 1.285, remark: 'End'),
  ],
);

/// A closed compass traverse ABCD with a small closing error.
const sampleTraverse = Traverse(
  title: 'Closed compass traverse ABCD',
  legs: [
    TraverseLeg('AB', length: 130, bearing: 60.5),
    TraverseLeg('BC', length: 158, bearing: 125.25),
    TraverseLeg('CD', length: 145.5, bearing: 220.75),
    TraverseLeg('DA', length: 201.6, bearing: 313.25),
  ],
);

/// Spot levels over a small hill, 10 m apart.
ContourGrid sampleContours() => ContourGrid.fromText(
  '''
100.5 101.1 101.8 102.1 101.8 101.1 100.5
100.9 102.1 103.5 104.1 103.5 102.1 100.9
101.3 103.0 104.9 105.8 104.9 103.0 101.3
101.3 103.0 104.9 105.8 104.9 103.0 101.3
100.9 102.1 103.5 104.1 103.5 102.1 100.9
100.5 101.1 101.8 102.1 101.8 101.1 100.5''',
  title: 'Contour sketch: a small hill',
  spacing: 10,
  interval: 1,
);

/// The panel data for a blank or worked [kind] (business panels go through bizData).
Map<String, Object?> civilData(KitKind kind) => switch (kind) {
  KitKind.beam => sampleBeam(BeamType.simplySupported).toJson(),
  KitKind.truss => blankTruss.toJson(),
  KitKind.levelBook => sampleLevelBook(LevelMethod.riseFall).toJson(),
  KitKind.traverse => sampleTraverse.toJson(),
  KitKind.contour => sampleContours().toJson(),
  _ => const {},
};

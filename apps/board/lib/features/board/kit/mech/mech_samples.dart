import 'package:flutter/material.dart';
import 'package:kinetix_ink/kinetix_ink.dart';

// Starting points for the mechanical engineering panels: drawing sheets, the six cycles with
// textbook inputs, and free-body diagrams of the usual bodies. Words are in English, as in the
// textbooks.

/// The panels this kit edits (editKit sends them to [editMechKit]).
const mechKinds = {KitKind.drawingSheet, KitKind.thermoCycle, KitKind.fbd};

bool isMechKit(KitKind k) => mechKinds.contains(k);

/// A mechanical panel laid out at its natural size.
KitElement mechPanel(KitKind kind, Map<String, Object?> data, Color accent) => KitElement.sized(kind: kind, data: data, color: accent);

/// A sheet with two points projected (A in the first quadrant, B nearer the planes).
DrawingSheet sampleSheet(DrawingProjection p, {DrawingGrid grid = DrawingGrid.square}) => DrawingSheet(
  title: 'Projections of points (${p == DrawingProjection.first ? 'first' : 'third'} angle)',
  projection: p,
  grid: grid,
  points: const [DrawingPoint('A', x: 30, h: 30, d: 20), DrawingPoint('B', x: 80, h: 15, d: 35)],
);

const blankSheet = DrawingSheet(title: 'Drawing sheet', points: []);

const isometricSheet = DrawingSheet(title: 'Isometric drawing', grid: DrawingGrid.isometric, showXY: false, showMiter: false, points: []);

/// Each cycle with the inputs a textbook example uses.
ThermoCycle sampleCycle(CycleKind k) => switch (k) {
  CycleKind.otto => const ThermoCycle(kind: CycleKind.otto, r: 8, tMax: 1800),
  CycleKind.diesel => const ThermoCycle(kind: CycleKind.diesel, r: 18, rc: 2),
  CycleKind.dual => const ThermoCycle(kind: CycleKind.dual, r: 16, rp: 1.5, rc: 1.6),
  CycleKind.brayton => const ThermoCycle(kind: CycleKind.brayton, rp: 10, tMax: 1400),
  CycleKind.carnot => const ThermoCycle(kind: CycleKind.carnot, t1: 300, tMax: 900, expansion: 2),
  CycleKind.rankine => const ThermoCycle(kind: CycleKind.rankine, boilerBar: 40, condenserBar: 0.1),
};

/// The free-body diagrams the kit starts from.
enum FbdSample { block, incline, beam, sphere, pulley, blank }

FbdModel sampleFbd(FbdSample s) {
  switch (s) {
    case FbdSample.block:
      // A 10 kg block pushed with 25 N stays put: friction found (25 N, under μN = 29.4 N).
      const m = FbdModel(title: 'Block pushed on a floor', mass: 10, mu: 0.3);
      return m.copyWith(forces: [m.weight(), m.normal(), const FbdForce('P', magnitude: 25, angle: 0), m.friction().copyWith(unknown: FbdUnknown.magnitude)]);
    case FbdSample.incline:
      const m = FbdModel(title: 'Block at rest on a 30° incline', body: FbdBody.incline, theta: 30, mass: 10, mu: 0.6);
      return m.copyWith(forces: [m.weight(), m.normal(), m.friction().copyWith(unknown: FbdUnknown.magnitude)]);
    case FbdSample.beam:
      // A 4 m beam, 20 kN at 1 m right of the centre: R_B found from equilibrium after R_A = 5 kN.
      return const FbdModel(
        title: 'Simply supported beam',
        body: FbdBody.beam,
        mass: 0,
        forces: [
          FbdForce('P', magnitude: 20000, angle: -90, x: 1),
          FbdForce('R_A', magnitude: 5000, angle: 90, x: -2),
          FbdForce('R_B', magnitude: 0, angle: 90, x: 2, unknown: FbdUnknown.magnitude),
        ],
      );
    case FbdSample.sphere:
      // A 5 kg sphere held aside by a horizontal pull: the string's tension found.
      const m = FbdModel(title: 'Sphere held by a string', body: FbdBody.sphere, mass: 5);
      return m.copyWith(forces: [m.weight(), const FbdForce('P', magnitude: 20, angle: 0), const FbdForce('T', magnitude: 0, angle: 90, unknown: FbdUnknown.force)]);
    case FbdSample.pulley:
      return const FbdModel(
        title: 'Pulley: string over it, two tensions',
        body: FbdBody.pulley,
        mass: 0,
        forces: [
          FbdForce('T1', magnitude: 60, angle: -90, x: -0.4),
          FbdForce('T2', magnitude: 60, angle: -90, x: 0.4),
          FbdForce('R', magnitude: 0, angle: 90, unknown: FbdUnknown.force),
        ],
      );
    case FbdSample.blank:
      const m = FbdModel(title: 'Free-body diagram', mass: 2);
      return m.copyWith(forces: [m.weight()]);
  }
}

/// The panel data for a fresh [kind] (the first sample of each).
Map<String, Object?> mechData(KitKind kind) => switch (kind) {
  KitKind.drawingSheet => sampleSheet(DrawingProjection.first).toJson(),
  KitKind.thermoCycle => sampleCycle(CycleKind.otto).toJson(),
  KitKind.fbd => sampleFbd(FbdSample.incline).toJson(),
  _ => const {},
};

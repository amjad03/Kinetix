import 'package:flutter/material.dart';
import 'package:kinetix_ink/kinetix_ink.dart';

// Starting points for the electrical engineering panels: RLC circuits with textbook values,
// star and delta loads, a radial power system for per-unit and fault-level work, and the
// waveform generator's usual waves. Words are in English, as in the textbooks.

/// The panels this kit edits (editKit sends them to editEeeKit).
const eeeKinds = {KitKind.rlc, KitKind.threePhase, KitKind.singleLine, KitKind.waveform};

bool isEeeKit(KitKind k) => eeeKinds.contains(k);

/// An electrical panel laid out at its natural size.
KitElement eeePanel(KitKind kind, Map<String, Object?> data, Color accent) => KitElement.sized(kind: kind, data: data, color: accent);

enum RlcSample { series, parallel, rc, rl, resonance }

/// R = 20 Ω, L = 0.15 H, C = 100 µF on 230 V, 50 Hz: X_L = 47.1 Ω, X_C = 31.8 Ω, lagging.
RlcCircuit sampleRlc(RlcSample s) => switch (s) {
  RlcSample.series => const RlcCircuit(title: 'Series RLC circuit', r: 20, l: 0.15, c: 100e-6),
  RlcSample.parallel => const RlcCircuit(title: 'Parallel RLC circuit', topology: RlcTopology.parallel, r: 100, l: 0.2, c: 50e-6),
  RlcSample.rc => const RlcCircuit(title: 'Series RC circuit', r: 50, l: 0, c: 50e-6),
  RlcSample.rl => const RlcCircuit(title: 'Series RL circuit', r: 30, l: 0.127, c: 0),
  // 0.1 H and 101.3 µF resonate at 50 Hz.
  RlcSample.resonance => const RlcCircuit(title: 'Series resonance at 50 Hz', r: 5, l: 0.1, c: 101.32e-6),
};

ThreePhase sampleThreePhase(ThreePhaseConnection c) => c == ThreePhaseConnection.star
    ? const ThreePhase(title: 'Balanced star load, 415 V', vLine: 415, zPhase: 10, phi: 36.87)
    : const ThreePhase(title: 'Balanced delta load, 415 V', connection: ThreePhaseConnection.delta, vLine: 415, zPhase: 30, phi: 36.87);

enum SldSample { radial, parallelGenerators, blank }

/// A generator, a step-up transformer and a line to a load: fault at the far bus (X_th =
/// 0.15 + 0.10 + 40·100/132² = 0.4796 pu, 208.5 MVA on a 100 MVA base).
SingleLineDiagram sampleSld(SldSample s) => switch (s) {
  SldSample.radial => const SingleLineDiagram(
    title: 'Radial system: per unit and fault level',
    buses: [SldBus('Bus 1', kv: 11, x: 0), SldBus('Bus 2', kv: 132, x: 0.5), SldBus('Bus 3', kv: 132, x: 1)],
    elements: [
      SldElement(SldKind.generator, 'G1', a: 0, side: -1, y: 0.4, mva: 100, kv: 11, x: 0.15),
      SldElement(SldKind.breaker, 'CB1', a: 0, b: 1, y: 0.2),
      SldElement(SldKind.transformer, 'T1 11/132 kV', a: 0, b: 1, y: 0.5, mva: 100, kv: 11, x: 0.1),
      SldElement(SldKind.line, 'Line j40 Ω', a: 1, b: 2, y: 0.5, ohms: 40),
      SldElement(SldKind.isolator, 'Isolator', a: 1, b: 2, y: 0.2),
      SldElement(SldKind.load, 'Load', a: 2, side: 1, y: 0.5, mva: 50),
    ],
    faultBus: 2,
  ),
  SldSample.parallelGenerators => const SingleLineDiagram(
    title: 'Two generators on a bus: fault level',
    buses: [SldBus('Bus A', kv: 11, x: 0.15), SldBus('Bus B', kv: 66, x: 0.85)],
    elements: [
      SldElement(SldKind.generator, 'G1 50 MVA', a: 0, side: -1, y: 0.25, mva: 50, kv: 11, x: 0.2),
      SldElement(SldKind.generator, 'G2 25 MVA', a: 0, side: -1, y: 0.75, mva: 25, kv: 11, x: 0.15),
      SldElement(SldKind.transformer, 'T1 11/66 kV', a: 0, b: 1, y: 0.5, mva: 75, kv: 11, x: 0.08),
      SldElement(SldKind.load, 'Load', a: 1, side: 1, y: 0.5, mva: 40),
    ],
    faultBus: 0,
  ),
  SldSample.blank => const SingleLineDiagram(
    title: 'Single-line diagram',
    buses: [SldBus('Bus 1', kv: 11, x: 0.2), SldBus('Bus 2', kv: 33, x: 0.8)],
    elements: [],
  ),
};

enum WaveSample { sine, square, triangle, sawtooth, pwm, superposed, squareHarmonics }

WaveformPanel sampleWave(WaveSample s) => switch (s) {
  WaveSample.sine => const WaveformPanel(title: 'Sine wave', a: Wave(amplitude: 325, freq: 50)),
  WaveSample.square => const WaveformPanel(title: 'Square wave', a: Wave(kind: WaveKind.square, amplitude: 10, freq: 50)),
  WaveSample.triangle => const WaveformPanel(title: 'Triangular wave', a: Wave(kind: WaveKind.triangle, amplitude: 10, freq: 50)),
  WaveSample.sawtooth => const WaveformPanel(title: 'Sawtooth wave', a: Wave(kind: WaveKind.sawtooth, amplitude: 10, freq: 50)),
  WaveSample.pwm => const WaveformPanel(title: 'PWM, 25 % duty', a: Wave(kind: WaveKind.pwm, amplitude: 12, freq: 1000, duty: 0.25), cycles: 3),
  WaveSample.superposed => const WaveformPanel(
    title: 'Fundamental with a third harmonic',
    a: Wave(amplitude: 10, freq: 50),
    b: Wave(amplitude: 3, freq: 150),
    superpose: true,
  ),
  WaveSample.squareHarmonics => const WaveformPanel(title: 'Square wave from its harmonics', a: Wave(kind: WaveKind.square, amplitude: 10, freq: 50), harmonics: true, terms: 9),
};

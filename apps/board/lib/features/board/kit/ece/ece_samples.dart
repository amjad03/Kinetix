import 'dart:ui';

import 'package:kinetix_ink/kinetix_ink.dart';

// Starting points for the electronics and communication panels: timing diagrams, signals,
// Bode plots and pinouts with textbook values. Words are in English, as in the textbooks.

/// The panels this kit edits (editKit sends them to editEceKit).
const eceKinds = {KitKind.logicCircuit, KitKind.timing, KitKind.signal, KitKind.bode, KitKind.pinout};

bool isEceKit(KitKind k) => eceKinds.contains(k);

/// An electronics panel laid out at its natural size.
KitElement ecePanel(KitKind kind, Map<String, Object?> data, Color accent) => KitElement.sized(kind: kind, data: data, color: accent);

enum TimingSample { clockData, busRead, blank, counter, shift }

TimingDiagram sampleTiming(TimingSample s) => switch (s) {
  TimingSample.clockData => TimingDiagram(
    title: 'Clock and data (D flip-flop)',
    steps: 16,
    signals: [
      TimingDiagram.clock('CLK', 16),
      TimingSignal(name: 'D', values: [for (final c in '0011111100001111'.split('')) c]),
      TimingSignal(name: 'Q', values: [for (final c in '0001111110000111'.split('')) c]),
    ],
    markers: [(at: 3, label: 'Q ← 1'), (at: 9, label: 'Q ← 0')],
  ),
  TimingSample.busRead => TimingDiagram(
    title: 'Memory read cycle',
    steps: 12,
    signals: [
      TimingDiagram.clock('CLK', 12),
      TimingSignal(name: 'ADDR', bus: true, values: ['', '', '0x40A0', '0x40A0', '0x40A0', '0x40A0', '0x40A0', '0x40A0', '', '', '', '']),
      TimingSignal(name: "RD'", values: [for (final c in '111100001111'.split('')) c]),
      TimingSignal(name: 'DATA', values: [for (final c in 'zzzzzxxxzzzz'.split('')) c]),
      TimingSignal(name: 'D[7:0]', bus: true, values: ['', '', '', '', '', '', '0x3C', '0x3C', '', '', '', '']),
    ],
    markers: [(at: 4, label: 'RD′ low'), (at: 8, label: 'latch')],
  ),
  TimingSample.blank => TimingDiagram(steps: 16, signals: [TimingDiagram.clock('CLK', 16), TimingSignal(name: 'A'), TimingSignal(name: 'B')]),
  TimingSample.counter => simulateTiming(logicPreset(LogicPreset.syncCounter), cycles: 9, title: '3-bit synchronous counter'),
  TimingSample.shift => () {
    final c = logicPreset(LogicPreset.shiftRegister);
    c.inputs.firstWhere((p) => p.label == 'Din').value = true;
    return simulateTiming(c, cycles: 6, title: '4-bit shift register, Din = 1');
  }(),
};

enum SignalSample { sine, sum, square, am, fm, noise, alias, window }

SignalPanel sampleSignal(SignalSample s) => switch (s) {
  SignalSample.sine => const SignalPanel(title: 'Sine and its spectrum', f1: 8, a1: 1, fs: 128, n: 128),
  SignalSample.sum => const SignalPanel(title: 'Sum of two sines', kind: SignalKind.sumOfSines, f1: 5, a1: 1, f2: 20, a2: 0.5, fs: 128, n: 128),
  SignalSample.square => const SignalPanel(title: 'Square wave: odd harmonics', kind: SignalKind.square, f1: 4, a1: 1, fs: 256, n: 256),
  SignalSample.am => const SignalPanel(title: 'Amplitude modulation', kind: SignalKind.am, fc: 32, fm: 4, m: 0.6, fs: 256, n: 256),
  SignalSample.fm => const SignalPanel(title: 'Frequency modulation', kind: SignalKind.fm, fc: 40, fm: 4, beta: 2, fs: 256, n: 256),
  SignalSample.noise => const SignalPanel(title: 'Sine in noise', f1: 10, a1: 1, noise: 0.8, fs: 256, n: 256),
  SignalSample.alias => const SignalPanel(title: 'Aliasing: 90 Hz sampled at 100 Hz', f1: 90, a1: 1, fs: 100, n: 128),
  SignalSample.window => const SignalPanel(title: 'Leakage: 8.5 Hz, Hann window', f1: 8.5, a1: 1, fs: 128, n: 128, window: WindowKind.hann),
};

enum BodeSample { lp1, hp1, lp2, hp2, bp2, pz }

BodePanel sampleBode(BodeSample s) => switch (s) {
  BodeSample.lp1 => const BodePanel(title: 'RC low pass, fc = 1 kHz', filter: FilterKind.lowPass1, fc: 1000),
  BodeSample.hp1 => const BodePanel(title: 'RC high pass, fc = 100 Hz', filter: FilterKind.highPass1, fc: 100),
  BodeSample.lp2 => const BodePanel(title: 'Second-order low pass (Butterworth)', filter: FilterKind.lowPass2, fc: 1000, zeta: 0.707),
  BodeSample.hp2 => const BodePanel(title: 'Second-order high pass', filter: FilterKind.highPass2, fc: 1000, zeta: 0.5),
  BodeSample.bp2 => const BodePanel(title: 'Band pass, Q = 5', filter: FilterKind.bandPass2, fc: 1000, zeta: 0.1),
  BodeSample.pz => const BodePanel(title: 'G(s) = 100(s + 10) / s(s + 100)', mode: BodeMode.polesZeros, k: 100, zeros: [Cplx(-10)], poles: [Cplx(0), Cplx(-100)]),
};

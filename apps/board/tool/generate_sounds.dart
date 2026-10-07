// Writes the timer's sounds (assets/sounds/*.wav): short tones synthesised here, so the board
// ships no third-party audio. Run from apps/board: `dart run tool/generate_sounds.dart`.
import 'dart:io';
import 'dart:math' as math;
import 'dart:typed_data';

const rate = 22050;

/// A struck tone: partials (frequency, level) under an exponential decay.
List<double> strike(List<(double, double)> partials, double seconds, double decay, {double start = 0}) {
  final n = (seconds * rate).round();
  return [
    for (var i = 0; i < n; i++)
      () {
        final t = i / rate;
        final attack = math.min(1.0, t / 0.004);
        var v = 0.0;
        for (final (f, a) in partials) {
          v += a * math.sin(2 * math.pi * f * t);
        }
        return v * attack * math.exp(-t * decay);
      }(),
  ];
}

List<double> mix(int length, List<(double, List<double>)> parts) {
  final out = List<double>.filled(length, 0);
  for (final (at, s) in parts) {
    final o = (at * rate).round();
    for (var i = 0; i < s.length && o + i < length; i++) {
      out[o + i] += s[i];
    }
  }
  final peak = out.fold<double>(0, (m, v) => math.max(m, v.abs()));
  return [for (final v in out) v / peak * 0.8];
}

Uint8List wav(List<double> samples) {
  final data = ByteData(44 + samples.length * 2);
  void str(int o, String s) {
    for (var i = 0; i < s.length; i++) {
      data.setUint8(o + i, s.codeUnitAt(i));
    }
  }

  str(0, 'RIFF');
  data.setUint32(4, 36 + samples.length * 2, Endian.little);
  str(8, 'WAVE');
  str(12, 'fmt ');
  data
    ..setUint32(16, 16, Endian.little)
    ..setUint16(20, 1, Endian.little)
    ..setUint16(22, 1, Endian.little)
    ..setUint32(24, rate, Endian.little)
    ..setUint32(28, rate * 2, Endian.little)
    ..setUint16(32, 2, Endian.little)
    ..setUint16(34, 16, Endian.little);
  str(36, 'data');
  data.setUint32(40, samples.length * 2, Endian.little);
  for (var i = 0; i < samples.length; i++) {
    data.setInt16(44 + i * 2, (samples[i].clamp(-1.0, 1.0) * 32767).round(), Endian.little);
  }
  return data.buffer.asUint8List();
}

void main() {
  const len = (1.6 * rate) ~/ 1;
  // A bell: inharmonic partials, struck twice.
  const bellPartials = [(880.0, 1.0), (1760.0 * 1.19, 0.5), (880 * 2.76, 0.3), (880 * 5.4, 0.12)];
  final bell = mix(len, [(0, strike(bellPartials, 1.2, 3.2)), (0.45, strike(bellPartials, 1.15, 3.2))]);
  // A chime: three rising notes (C6, E6, G6).
  final chime = mix(len, [
    for (final (i, f) in [1046.5, 1318.5, 1568.0].indexed) (i * 0.18, strike([(f, 1.0), (f * 2, 0.25)], 1.0, 4.5)),
  ]);
  // A beep: three short square-ish beeps.
  final beep = mix((1.0 * rate).round(), [
    for (var i = 0; i < 3; i++) (i * 0.3, strike([(1000.0, 1.0), (3000.0, 0.3), (5000.0, 0.12)], 0.16, 6)),
  ]);
  // A lap tick: one short, soft click-tone.
  final lap = mix((0.15 * rate).round(), [(0, strike([(1500.0, 1.0), (3000.0, 0.2)], 0.15, 30))]);
  for (final (name, s) in [('bell', bell), ('chime', chime), ('beep', beep), ('lap', lap)]) {
    File('assets/sounds/$name.wav').writeAsBytesSync(wav(s));
  }
}

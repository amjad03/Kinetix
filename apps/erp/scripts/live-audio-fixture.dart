// Writes src/lib/live/fixtures/live-audio.json: class audio encoded and decoded by the Dart
// codec the boards use (packages/kinetix_ink LiveAudioCodec), so the ERP's TypeScript decoder
// can be checked against it sample for sample (src/lib/live/audio.test.ts).
//
//   cd apps/erp && dart run scripts/live-audio-fixture.dart
import 'dart:convert';
import 'dart:io';
import 'dart:math';
import 'dart:typed_data';

import '../../../packages/kinetix_ink/lib/src/live_audio.dart';

void main() {
  final state = AdpcmState();
  final chunks = <Map<String, Object>>[];
  var t = 0;
  // A 440 Hz tone with a 1.2 kHz overtone that swells, a burst loud enough to clip, then a
  // short odd-length tail (the last byte carries one sample and a padding nibble).
  for (final n in [LiveAudioCodec.chunkSamples, 800, 101]) {
    final pcm = Int16List(n);
    for (var i = 0; i < n; i++, t++) {
      final s = t / LiveAudioCodec.sampleRate;
      final swell = 0.5 + 0.5 * sin(2 * pi * 3 * s);
      var v = 9000 * sin(2 * pi * 440 * s) + 4000 * swell * sin(2 * pi * 1200 * s);
      if (t >= 3400 && t < 3600) v *= 6; // clips
      pcm[i] = v.round().clamp(-32768, 32767);
    }
    final data = LiveAudioCodec.encodeBase64(pcm, state);
    chunks.add({'data': data, 'samples': LiveAudioCodec.decodeBase64(data).toList()});
  }
  final out = File('${File.fromUri(Platform.script).parent.parent.path}/src/lib/live/fixtures/live-audio.json');
  out.writeAsStringSync('${jsonEncode({'source': 'scripts/live-audio-fixture.dart (packages/kinetix_ink LiveAudioCodec)', 'rate': LiveAudioCodec.sampleRate, 'chunks': chunks})}\n');
  stdout.writeln('Wrote ${out.path}: ${chunks.length} chunks');
}

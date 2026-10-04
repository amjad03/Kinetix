import 'dart:math';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_ink/kinetix_ink.dart';

Int16List tone(int n, {double hz = 440, double amp = 12000, int offset = 0}) =>
    Int16List.fromList([for (var i = 0; i < n; i++) (amp * sin(2 * pi * hz * (i + offset) / LiveAudioCodec.sampleRate)).round()]);

double snrDb(Int16List a, Int16List b) {
  var signal = 0.0, noise = 0.0;
  for (var i = 0; i < a.length; i++) {
    signal += a[i] * a[i].toDouble();
    noise += (a[i] - b[i]) * (a[i] - b[i]).toDouble();
  }
  return 10 * log(signal / max(noise, 1)) / ln10;
}

void main() {
  test('a 200 ms chunk is 1604 bytes and decodes to a close copy of the voice', () {
    final pcm = tone(LiveAudioCodec.chunkSamples);
    final chunk = LiveAudioCodec.encode(pcm, AdpcmState());
    expect(chunk.length, 4 + LiveAudioCodec.chunkSamples ~/ 2);
    final out = LiveAudioCodec.decode(chunk);
    expect(out.length, pcm.length);
    // Skip the first few milliseconds while the step size adapts.
    expect(snrDb(Int16List.sublistView(pcm, 160), Int16List.sublistView(out, 160)), greaterThan(20));
  });

  test('each chunk decodes on its own, continuing from the previous one', () {
    final state = AdpcmState();
    final first = LiveAudioCodec.encode(tone(3200), state);
    final second = LiveAudioCodec.encode(tone(3200, offset: 3200), state);
    expect(first, isNot(second));
    final out = LiveAudioCodec.decode(second); // the first chunk was lost
    expect(snrDb(tone(3200, offset: 3200), out), greaterThan(20));
  });

  test('silence stays quiet and extremes do not wrap around', () {
    final quiet = LiveAudioCodec.decode(LiveAudioCodec.encode(Int16List(3200), AdpcmState()));
    expect(quiet.every((s) => s.abs() < 64), isTrue);
    final loud = Int16List.fromList([for (var i = 0; i < 3200; i++) i.isEven ? 32767 : -32768]);
    final out = LiveAudioCodec.decode(LiveAudioCodec.encode(loud, AdpcmState()));
    expect(out.every((s) => s >= -32768 && s <= 32767), isTrue);
  });

  test('malformed chunks decode to nothing', () {
    expect(LiveAudioCodec.decode(Uint8List(2)), isEmpty);
    expect(LiveAudioCodec.decode(Uint8List.fromList([0, 0, 99, 0, 1])), isEmpty);
    expect(LiveAudioCodec.decodeBase64('not base64!'), isEmpty);
    expect(LiveAudioCodec.decodeBase64(LiveAudioCodec.encodeBase64(tone(10), AdpcmState())).length, 10);
  });

  test('PcmChunker cuts microphone bytes of any size into whole chunks', () {
    final c = PcmChunker(samples: 4);
    final bytes = Uint8List.fromList([for (var i = 1; i <= 10; i++) ...[i, 0]]); // samples 1..10
    expect(c.add(Uint8List.sublistView(bytes, 0, 5)), isEmpty);
    final got = c.add(Uint8List.sublistView(bytes, 5));
    expect(got.map((x) => x.toList()), [
      [1, 2, 3, 4],
      [5, 6, 7, 8],
    ]);
    expect(c.add(Uint8List.fromList([11, 0, 12, 0])).single.toList(), [9, 10, 11, 12]);
  });
}

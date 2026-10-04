import 'dart:convert';
import 'dart:typed_data';

/// Class audio for live classes: mono 16 kHz IMA ADPCM, 4 bits a sample (8 KB/s, about
/// 29 MB an hour). The same format is decoded by the ERP (apps/erp) and described by
/// `LiveAudioChunk` in packages/shared.
///
/// A chunk is a 4-byte header (predictor as int16 little-endian, step index, 0) followed by
/// two samples per byte, low nibble first. Every chunk carries its own starting state, so it
/// decodes on its own and a lost chunk is only a short gap.
abstract final class LiveAudioCodec {
  static const sampleRate = 16000;

  /// Samples per chunk the board sends: 200 ms.
  static const chunkSamples = 3200;

  static const _steps = <int>[
    7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 19, 21, 23, 25, 28, 31, 34, 37, 41, 45, 50, 55, 60, 66, 73, 80, 88, 97, 107, 118, 130, 143, 157, 173, //
    190, 209, 230, 253, 279, 307, 337, 371, 408, 449, 494, 544, 598, 658, 724, 796, 876, 963, 1060, 1166, 1282, 1411, 1552, 1707, 1878, 2066,
    2272, 2499, 2749, 3024, 3327, 3660, 4026, 4428, 4871, 5358, 5894, 6484, 7132, 7845, 8630, 9493, 10442, 11487, 12635, 13899, 15289, 16818,
    18500, 20350, 22385, 24623, 27086, 29794, 32767,
  ];
  static const _indexShift = <int>[-1, -1, -1, -1, 2, 4, 6, 8];

  /// Encodes 16-bit samples. [state] carries the predictor between chunks so consecutive
  /// chunks join smoothly; it is updated in place.
  static Uint8List encode(Int16List pcm, AdpcmState state) {
    final out = Uint8List(4 + (pcm.length + 1) ~/ 2);
    final header = ByteData.sublistView(out, 0, 4);
    header.setInt16(0, state.predictor, Endian.little);
    out[2] = state.index;
    var predictor = state.predictor, index = state.index;
    for (var i = 0; i < pcm.length; i++) {
      final step = _steps[index];
      var diff = pcm[i] - predictor;
      var nibble = 0;
      if (diff < 0) {
        nibble = 8;
        diff = -diff;
      }
      var delta = step >> 3;
      if (diff >= step) {
        nibble |= 4;
        diff -= step;
        delta += step;
      }
      if (diff >= step >> 1) {
        nibble |= 2;
        diff -= step >> 1;
        delta += step >> 1;
      }
      if (diff >= step >> 2) {
        nibble |= 1;
        delta += step >> 2;
      }
      predictor = (nibble & 8) != 0 ? predictor - delta : predictor + delta;
      predictor = predictor.clamp(-32768, 32767);
      index = (index + _indexShift[nibble & 7]).clamp(0, 88);
      final at = 4 + (i >> 1);
      out[at] |= (i & 1) == 0 ? nibble : nibble << 4;
    }
    state
      ..predictor = predictor
      ..index = index;
    return out;
  }

  /// Decodes one chunk to 16-bit samples. Returns an empty list for a malformed chunk.
  static Int16List decode(Uint8List chunk) {
    if (chunk.length < 4) return Int16List(0);
    var predictor = ByteData.sublistView(chunk, 0, 2).getInt16(0, Endian.little);
    var index = chunk[2];
    if (index > 88) return Int16List(0);
    final out = Int16List((chunk.length - 4) * 2);
    for (var i = 0; i < out.length; i++) {
      final byte = chunk[4 + (i >> 1)];
      final nibble = (i & 1) == 0 ? byte & 0x0f : byte >> 4;
      final step = _steps[index];
      var delta = step >> 3;
      if ((nibble & 4) != 0) delta += step;
      if ((nibble & 2) != 0) delta += step >> 1;
      if ((nibble & 1) != 0) delta += step >> 2;
      predictor = ((nibble & 8) != 0 ? predictor - delta : predictor + delta).clamp(-32768, 32767);
      index = (index + _indexShift[nibble & 7]).clamp(0, 88);
      out[i] = predictor;
    }
    return out;
  }

  static String encodeBase64(Int16List pcm, AdpcmState state) => base64Encode(encode(pcm, state));

  static Int16List decodeBase64(String data) {
    try {
      return decode(base64Decode(data));
    } on FormatException {
      return Int16List(0);
    }
  }
}

/// Encoder state carried from one chunk to the next.
class AdpcmState {
  int predictor = 0;
  int index = 0;
}

/// Cuts a stream of little-endian 16-bit PCM bytes (as microphones deliver them, in any
/// sizes) into whole [LiveAudioCodec.chunkSamples]-sample chunks.
class PcmChunker {
  PcmChunker({this.samples = LiveAudioCodec.chunkSamples});
  final int samples;
  final _pending = BytesBuilder(copy: false);

  /// Adds bytes; returns the complete chunks now available.
  List<Int16List> add(Uint8List bytes) {
    _pending.add(bytes);
    final need = samples * 2;
    if (_pending.length < need) return const [];
    final all = _pending.takeBytes();
    final out = <Int16List>[];
    var at = 0;
    for (; at + need <= all.length; at += need) {
      final view = ByteData.sublistView(all, at, at + need);
      out.add(Int16List.fromList([for (var i = 0; i < samples; i++) view.getInt16(i * 2, Endian.little)]));
    }
    if (at < all.length) _pending.add(Uint8List.sublistView(all, at));
    return out;
  }

  void clear() => _pending.clear();
}

import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:http/http.dart' as http;

import 'digit_model.dart';

// Where the AI demos run their models. Today: on the board itself ([LocalDartBackend], pure
// Dart, offline). Later: the school's AI box on the LAN ([LanAiBoxBackend], a mini PC running
// Ollama, found like the school code box), plugged in behind the same interface so the demos do
// not change. The LAN backend is written but not active: nothing discovers or selects it yet.

/// A digit's prediction and how it was reached.
class DigitPrediction {
  const DigitPrediction(this.digit, this.probabilities, {this.trace});
  final int digit;
  final List<double> probabilities;

  /// The layers' values, when the backend can show them (the board's own model can).
  final DigitTrace? trace;

  double get confidence => probabilities[digit];
}

/// Something that runs the demos' models.
abstract class InferenceBackend {
  /// `local` or `lan-box`.
  String get id;

  /// Whether it can run now (the LAN box: found and switched on).
  bool get available;

  /// True when the model runs on this board (no network).
  bool get onDevice;

  /// Gets the model ready (the board trains its own the first time); [onProgress] hears 0..1.
  Future<void> prepare({void Function(double progress)? onProgress});

  bool get ready;

  /// Reads a [digitPixels]-long 16 × 16 grid of ink (0..1).
  Future<DigitPrediction> classifyDigit(Float64List pixels);
}

/// The board's own model: a small network trained in Dart the first time a demo opens on this
/// board (a few seconds), then kept for the rest of the day.
class LocalDartBackend implements InferenceBackend {
  LocalDartBackend({this.epochs = 10, this.perDigit = 90, this.seed = 5});

  /// The board's one copy, shared by every demo.
  static final shared = LocalDartBackend();

  final int epochs, perDigit, seed;
  DigitNet? _net;
  Future<void>? _training;

  @override
  String get id => 'local';
  @override
  bool get available => true;
  @override
  bool get onDevice => true;
  @override
  bool get ready => _net != null;

  DigitNet? get net => _net;

  /// Uses [net] (a test's, or one trained elsewhere) instead of training.
  void use(DigitNet net) => _net = net;

  @override
  Future<void> prepare({void Function(double progress)? onProgress}) {
    if (_net != null) {
      onProgress?.call(1);
      return Future.value();
    }
    return _training ??= trainDigitNet(
      seed: seed,
      perDigit: perDigit,
      epochs: epochs,
      onEpoch: (e, _) => onProgress?.call(e / epochs),
      pause: () => Future<void>.delayed(const Duration(milliseconds: 1)),
    ).then((n) => _net = n);
  }

  @override
  Future<DigitPrediction> classifyDigit(Float64List pixels) async {
    await prepare();
    final t = _net!.trace(pixels);
    return DigitPrediction(t.best, t.probs, trace: t);
  }
}

/// The school's AI box on the LAN: an Ollama-compatible server (`/api/tags` lists its models,
/// `/api/generate` runs one). Not active yet: no box is discovered or selected, so [available]
/// is false and the demos stay on the board. To switch it on later, find the box (mDNS
/// `_kinetix-ai._tcp`, or an address in Board settings, as the code box is found), set
/// [baseUrl] and [enabled], and pick it in the demo.
class LanAiBoxBackend implements InferenceBackend {
  LanAiBoxBackend({this.baseUrl, this.model = 'kinetix-digits', this.enabled = false, this.client});

  final Uri? baseUrl;
  final String model;
  final bool enabled;
  /// The HTTP client (a test's); a fresh one per request when null.
  final http.Client? client;

  /// Looks for an AI box on the school's network. Not built yet: always null.
  static Future<Uri?> discover() async => null;

  @override
  String get id => 'lan-box';
  @override
  bool get available => enabled && baseUrl != null;
  @override
  bool get onDevice => false;
  @override
  bool get ready => available;

  @override
  Future<void> prepare({void Function(double progress)? onProgress}) async {
    if (!available) throw StateError('The AI box is not connected');
    onProgress?.call(1);
  }

  /// The Ollama request that reads a digit: the grid as text in the prompt, JSON out.
  ({Uri url, Map<String, Object?> body}) digitRequest(Float64List pixels) => (
    url: baseUrl!.resolve('/api/generate'),
    body: {
      'model': model,
      'stream': false,
      'format': 'json',
      'prompt':
          'Classify this 16x16 handwritten digit (row by row, 0-9 ink levels). '
          'Answer as JSON {"digit": d, "probabilities": [10 numbers]}.\n'
          '${[for (var r = 0; r < digitGrid; r++) pixels.sublist(r * digitGrid, (r + 1) * digitGrid).map((v) => (v * 9).round()).join()].join('\n')}',
    },
  );

  @override
  Future<DigitPrediction> classifyDigit(Float64List pixels) async {
    if (!available) throw StateError('The AI box is not connected');
    final req = digitRequest(pixels);
    final c = client ?? http.Client();
    try {
      final res = await c.post(req.url, headers: {'content-type': 'application/json'}, body: jsonEncode(req.body)).timeout(const Duration(seconds: 20));
      if (res.statusCode != 200) throw StateError('AI box answered ${res.statusCode}');
      final outer = jsonDecode(res.body) as Map;
      final inner = jsonDecode(outer['response'] as String) as Map;
      final digit = (inner['digit'] as num).toInt().clamp(0, 9);
      final raw = inner['probabilities'];
      final probs = raw is List && raw.length == 10 ? [for (final v in raw) v is num ? v.toDouble() : 0.0] : [for (var i = 0; i < 10; i++) i == digit ? 1.0 : 0.0];
      return DigitPrediction(digit, probs);
    } finally {
      if (client == null) c.close();
    }
  }
}

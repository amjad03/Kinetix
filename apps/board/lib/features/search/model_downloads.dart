import 'package:flutter/foundation.dart';
import 'package:kinetix_3d/kinetix_3d.dart';

/// Where a 3D model in the library comes from: with the app, downloaded to this board (works
/// offline), or from a model server on first use (ModelServer: the board's, the school's,
/// the Zynetix server, then GitHub).
enum ModelAvailability { bundled, downloaded, cloud }

/// Downloads of the library's cloud models for offline use, with their progress. One for the
/// board ([instance]); tests give it their own cache.
class ModelDownloads extends ChangeNotifier {
  ModelDownloads({this._cache});

  static ModelDownloads instance = ModelDownloads();

  final ModelCache? _cache;

  /// The board's model cache (the one the viewer opens downloaded models from).
  ModelCache get cache => _cache ?? RemoteModels.cache;

  final _progress = <String, double>{};

  /// Models whose last download failed (offline, or no server had them).
  final failed = <String>{};

  ModelAvailability of(ModelEntry e) {
    final r = e.remote;
    if (r == null) return ModelAvailability.bundled;
    return cache.isCached(r) ? ModelAvailability.downloaded : ModelAvailability.cloud;
  }

  /// How far [id]'s download is (0 to 1), or null when it is not downloading.
  double? progress(String id) => _progress[id];

  bool get busy => _progress.isNotEmpty;

  /// Downloads [m] and keeps it for offline use. Returns whether it is on the board now.
  Future<bool> download(RemoteModelInfo m) async {
    if (_progress.containsKey(m.id)) return false;
    if (cache.isCached(m)) return true;
    failed.remove(m.id);
    _progress[m.id] = 0;
    notifyListeners();
    try {
      await cache.load(
        m,
        onProgress: (received, total) {
          if (!_progress.containsKey(m.id)) return;
          _progress[m.id] = total > 0 ? (received / total).clamp(0.0, 1.0) : 0;
          notifyListeners();
        },
      );
      return true;
    } catch (e) {
      debugPrint('3D model ${m.id} could not be downloaded: $e');
      failed.add(m.id);
      return false;
    } finally {
      _progress.remove(m.id);
      notifyListeners();
    }
  }

  /// Downloads every model of [models] not on the board yet, one after another. Returns how many failed.
  Future<int> downloadAll(Iterable<RemoteModelInfo> models) async {
    var failures = 0;
    for (final m in models.toList()) {
      if (!await download(m)) failures++;
    }
    return failures;
  }

  /// The cloud models among [entries] not on the board yet.
  List<RemoteModelInfo> missing(Iterable<ModelEntry> entries) => [
    for (final e in entries)
      if (e.remote case final r? when !cache.isCached(r)) r,
  ];
}

/// A download size as people read it: "850 KB", "4.2 MB".
String modelSize(int bytes) {
  if (bytes < 1000 * 1000) return '${(bytes / 1000).ceil()} KB';
  final mb = bytes / (1000 * 1000);
  return '${mb >= 100 ? mb.round() : mb.toStringAsFixed(1)} MB';
}

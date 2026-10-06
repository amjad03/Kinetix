import 'dart:async';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';

import 'phet_catalogue.dart';

/// Where a sim's all-locales file is on PhET's own site: the fallback when the API has no
/// mirror (demo, development) or cannot be reached.
Uri phetOriginUrl(String id, String locale) => Uri.parse('https://phet.colorado.edu/sims/html/$id/latest/${id}_all.html?locale=$locale');

/// The PhET sims on this board: downloads them once (from our mirror in India via the API, else
/// from phet.colorado.edu) into app support storage, `<support>/phet/<id>_all.html`, so they
/// open without the internet afterwards. A download can be cancelled and picks up where it
/// stopped (HTTP Range on the `.part` file); one already on the board is never fetched again.
class PhetDownloads extends ChangeNotifier {
  PhetDownloads({required this.resolve, Future<Directory> Function()? directory, http.Client? client})
    : _directory = directory ?? _defaultDirectory,
      _http = client ?? http.Client();

  /// The board's downloads (one for the app); tests set their own.
  static PhetDownloads? shared;

  /// The download link for a sim in a locale.
  final Future<Uri> Function(String id, String locale) resolve;
  final Future<Directory> Function() _directory;
  final http.Client _http;

  static Future<Directory> _defaultDirectory() async => Directory('${(await getApplicationSupportDirectory()).path}${Platform.pathSeparator}phet');

  final _sizes = <String, int>{};
  final _partial = <String, int>{};
  final _jobs = <String, _Job>{};
  final _errors = <String>{};
  Directory? _dir;
  Future<void>? _scan;

  /// False after a download came from phet.colorado.edu rather than our mirror.
  bool? lastFromMirror;

  /// Reads what is already on the board (once).
  Future<void> get ready => _scan ??= _rescan();

  Future<Directory> get directory async => _dir ??= await (await _directory()).create(recursive: true);

  Future<void> _rescan() async {
    final dir = await directory;
    _sizes.clear();
    _partial.clear();
    await for (final f in dir.list()) {
      if (f is! File) continue;
      final name = f.uri.pathSegments.last;
      if (_name.firstMatch(name) case final m?) {
        (m.group(2) == null ? _sizes : _partial)[m.group(1)!] = await f.length();
      }
    }
    notifyListeners();
  }

  static final _name = RegExp(r'^([a-z0-9-]+)_all\.html(\.part)?$');

  bool isDownloaded(String id) => _sizes.containsKey(id);
  bool isDownloading(String id) => _jobs.containsKey(id);
  bool failed(String id) => _errors.contains(id);

  /// Bytes already fetched of a download that was stopped part way.
  int partialBytes(String id) => _partial[id] ?? 0;

  /// The size on the board of a downloaded sim.
  int? sizeOf(String id) => _sizes[id];

  /// 0…1 while downloading (null when the size is not known yet), else null.
  double? progress(String id) => _jobs[id]?.fraction;

  List<String> get downloaded => _sizes.keys.toList()..sort();

  /// Everything the sims take on this board.
  int get usedBytes => _sizes.values.fold(0, (a, b) => a + b) + _partial.values.fold(0, (a, b) => a + b);

  Future<File> fileOf(String id) async => File('${(await directory).path}${Platform.pathSeparator}${id}_all.html');

  /// Downloads [sim] (true when it is on the board afterwards). Already there: nothing is fetched.
  Future<bool> download(PhetSim sim, String locale) async {
    await ready;
    final id = sim.id;
    if (isDownloaded(id)) return true;
    if (_jobs[id] case final job?) return job.done.future;
    final job = _jobs[id] = _Job(sim.sizeBytes);
    _errors.remove(id);
    notifyListeners();
    final file = await fileOf(id);
    final part = File('${file.path}.part');
    IOSink? sink;
    try {
      final url = await resolve(id, locale);
      lastFromMirror = url.host != 'phet.colorado.edu';
      final offset = await part.exists() ? await part.length() : 0;
      final req = http.Request('GET', url);
      if (offset > 0) req.headers['range'] = 'bytes=$offset-';
      final res = await _http.send(req);
      if (job.cancelled) {
        unawaited(res.stream.listen(null).cancel());
        return false;
      }
      if (res.statusCode != 200 && res.statusCode != 206) throw HttpException('HTTP ${res.statusCode}', uri: url);
      final resumed = res.statusCode == 206;
      job.received = resumed ? offset : 0;
      if (res.contentLength case final n?) job.total = n + job.received;
      sink = part.openWrite(mode: resumed ? FileMode.append : FileMode.write);
      final finished = Completer<void>();
      job.subscription = res.stream.listen(
        (chunk) {
          sink!.add(chunk);
          job.received += chunk.length;
          _partial[id] = job.received;
          notifyListeners();
        },
        onError: (Object e, StackTrace s) => finished.isCompleted ? null : finished.completeError(e, s),
        onDone: () => finished.isCompleted ? null : finished.complete(),
        cancelOnError: true,
      );
      job.onCancel = () => finished.isCompleted ? null : finished.complete();
      await finished.future;
      await sink.flush();
      await sink.close();
      sink = null;
      if (job.cancelled) return false;
      if (job.received == 0) throw const FileSystemException('empty download');
      await part.rename(file.path);
      _partial.remove(id);
      _sizes[id] = await file.length();
      job.done.complete(true);
      return true;
    } catch (e) {
      debugPrint('PhET download of $id failed: $e');
      await sink?.close();
      if (!job.cancelled) _errors.add(id);
      if (!job.done.isCompleted) job.done.complete(false);
      return false;
    } finally {
      if (!job.done.isCompleted) job.done.complete(false);
      _jobs.remove(id);
      notifyListeners();
    }
  }

  /// Stops a download; what was fetched stays, and the next download carries on from there.
  void cancel(String id) {
    final job = _jobs[id];
    if (job == null) return;
    job.cancelled = true;
    unawaited(job.subscription?.cancel());
    job.onCancel?.call();
  }

  /// Removes a sim (and any part download) from the board.
  Future<void> delete(String id) async {
    cancel(id);
    final file = await fileOf(id);
    for (final f in [file, File('${file.path}.part')]) {
      if (await f.exists()) await f.delete();
    }
    _sizes.remove(id);
    _partial.remove(id);
    _errors.remove(id);
    notifyListeners();
  }
}

class _Job {
  _Job(this.total);

  int total;
  int received = 0;
  bool cancelled = false;
  StreamSubscription<List<int>>? subscription;
  VoidCallback? onCancel;
  final done = Completer<bool>();

  double? get fraction => total <= 0 ? null : (received / total).clamp(0.0, 1.0);
}

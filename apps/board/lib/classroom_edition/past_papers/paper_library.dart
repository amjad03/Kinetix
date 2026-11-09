import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

import 'exam_rules.dart';
import 'paper_model.dart';
import 'paper_pack.dart';
import 'paper_storage.dart';

/// What the teacher said about a PDF in the "Add papers" form.
@immutable
class PaperDraft {
  const PaperDraft({required this.exam, required this.year, this.session = '', this.subjects = const [], this.language = 'English', this.source = ''});

  final Exam exam;
  final int year;
  final String session;
  final List<String> subjects;
  final String language;
  final String source;
}

/// What one import did, in words for the teacher.
class ImportReport {
  final added = <String>[];
  final keysAdded = <String>[];

  /// File names (or paper titles) already in the library.
  final duplicates = <String>[];
  final problems = <String>[];

  bool get nothingNew => added.isEmpty && keysAdded.isEmpty;

  void addAll(ImportReport o) {
    added.addAll(o.added);
    keysAdded.addAll(o.keysAdded);
    duplicates.addAll(o.duplicates);
    problems.addAll(o.problems);
  }
}

/// The past-papers library on this board: an index (`past_papers/index.json`) and each
/// paper's files (`past_papers/papers/<id>/`). Works offline; nothing leaves the board.
class PaperLibrary extends ChangeNotifier {
  PaperLibrary(this.storage, {DateTime Function()? now}) : now = now ?? DateTime.now;

  final PaperStorage storage;
  final DateTime Function() now;

  static const indexPath = 'index.json';
  static const indexVersion = 1;

  /// Bundled packs, built into the app from the gitignored `assets/private/past_papers/`.
  static const bundledDir = 'assets/private/past_papers/';

  /// The largest file the board takes (a scanned paper is rarely over 60 MB).
  static const maxFileBytes = 200 * 1024 * 1024;

  /// The board's own library (app storage), made once.
  static PaperLibrary? _shared;
  static Future<PaperLibrary> shared() async {
    final lib = _shared ??= PaperLibrary(await DirPaperStorage.appStorage());
    if (!lib.loaded) await lib.load();
    return lib;
  }

  /// Replaces the board's library (tests).
  static set sharedForTests(PaperLibrary? lib) => _shared = lib;

  var _papers = <Paper>[];
  var _bundled = <String>{};
  bool loaded = false;

  List<Paper> get papers => List.unmodifiable(_papers);
  bool get isEmpty => _papers.isEmpty;
  Paper? byId(String id) => _papers.where((p) => p.id == id).firstOrNull;

  Future<void> load() async {
    try {
      final raw = await storage.read(indexPath);
      if (raw != null) {
        final j = jsonDecode(utf8.decode(raw));
        if (j is Map) {
          _papers = [
            for (final e in (j['papers'] as List?) ?? const [])
              if (e is Map) ?Paper.fromJson(e.cast<String, dynamic>()),
          ];
          _bundled = {for (final b in (j['bundled'] as List?) ?? const []) '$b'};
        }
      }
    } catch (e) {
      debugPrint('Past papers index unreadable, starting fresh: $e');
    }
    loaded = true;
    notifyListeners();
  }

  Future<void> _save() async {
    notifyListeners();
    await storage.write(
      indexPath,
      utf8.encode(
        jsonEncode({
          'version': indexVersion,
          'papers': [for (final p in _papers) p.toJson()],
          'bundled': _bundled.toList(),
        }),
      ),
    );
  }

  Future<Uint8List?> paperPdf(Paper p) => storage.read(p.paperFile);
  Future<Uint8List?> keyPdf(Paper p) => p.keyFile == null ? Future.value() : storage.read(p.keyFile!);
  Future<Uint8List?> file(String path) => storage.read(path);

  /// The paper's question set (null when it has none or it cannot be read).
  Future<QuestionSet?> questions(Paper p) async {
    if (p.questionsFile == null) return null;
    final raw = await storage.read(p.questionsFile!);
    if (raw == null) return null;
    try {
      return QuestionSet.fromJson(jsonDecode(utf8.decode(raw)));
    } catch (e) {
      debugPrint('Questions of ${p.id} unreadable: $e');
      return null;
    }
  }

  static String hashOf(List<int> bytes) => sha256.convert(bytes).toString();

  /// The paper (or the paper whose key it is) already holding a PDF with [hash].
  Paper? withHash(String hash) => _papers.where((p) => p.paperHash == hash || p.keyHash == hash).firstOrNull;

  String _dir(String id) => 'papers/$id';

  /// Adds a PDF as a paper. Null (and [report] says why) when it is not a PDF or already here.
  Future<Paper?> addPdf(Uint8List bytes, PaperDraft d, {required String fileName, ImportReport? report}) async {
    final r = report ?? ImportReport();
    if (!_checkPdf(bytes, fileName, r)) return null;
    final hash = hashOf(bytes);
    if (withHash(hash) != null) {
      r.duplicates.add(fileName);
      return null;
    }
    final id = hash.substring(0, 12);
    final path = '${_dir(id)}/paper.pdf';
    await storage.write(path, bytes);
    final p = Paper(
      id: id,
      exam: d.exam,
      year: d.year,
      session: d.session.trim(),
      subjects: d.subjects,
      language: d.language,
      source: d.source.trim(),
      paperFile: path,
      paperHash: hash,
      pageCount: countPdfPages(bytes),
      addedAt: now(),
    );
    _papers = [..._papers, p];
    await _save();
    r.added.add(p.longTitle);
    return p;
  }

  /// Adds [bytes] as the answer key of [paperId] (replacing an older key).
  Future<Paper?> addKey(Uint8List bytes, String paperId, {required String fileName, ImportReport? report}) async {
    final r = report ?? ImportReport();
    final p = byId(paperId);
    if (p == null) {
      r.problems.add('$fileName: the paper it is the key for is not in the library');
      return null;
    }
    if (!_checkPdf(bytes, fileName, r)) return null;
    final hash = hashOf(bytes);
    if (withHash(hash) != null) {
      r.duplicates.add(fileName);
      return null;
    }
    final path = '${_dir(p.id)}/key.pdf';
    await storage.write(path, bytes);
    final updated = p.copyWith(keyFile: path, keyHash: hash);
    _papers = [for (final x in _papers) x.id == p.id ? updated : x];
    await _save();
    r.keysAdded.add(p.longTitle);
    return updated;
  }

  bool _checkPdf(Uint8List bytes, String fileName, ImportReport r) {
    if (bytes.length > maxFileBytes) {
      r.problems.add('$fileName is too big (over ${maxFileBytes ~/ (1024 * 1024)} MB)');
      return false;
    }
    if (!looksLikePdf(bytes)) {
      r.problems.add('$fileName is not a PDF, or it is damaged');
      return false;
    }
    return true;
  }

  /// Imports a paper pack. [onProgress] gets (done, total) papers.
  Future<ImportReport> addPack(Uint8List zip, {String fileName = 'paper pack', void Function(int done, int total)? onProgress}) async {
    final r = ImportReport();
    if (zip.length > maxFileBytes * 2) {
      r.problems.add('$fileName is too big');
      return r;
    }
    final PaperPack pack;
    try {
      pack = readPaperPack(zip);
    } on FormatException catch (e) {
      r.problems.add('$fileName: ${e.message}');
      return r;
    }
    r.problems.addAll(pack.problems);
    final free = await storage.freeBytes();
    if (free != null && free < zip.length * 2) {
      r.problems.add('There is not enough space on the board for $fileName.');
      return r;
    }
    for (final (i, pp) in pack.papers.indexed) {
      onProgress?.call(i, pack.papers.length);
      await _addPackPaper(pp, pack.id, r);
    }
    onProgress?.call(pack.papers.length, pack.papers.length);
    return r;
  }

  Future<void> _addPackPaper(PackPaper pp, String packId, ImportReport r) async {
    final hash = hashOf(pp.pdf);
    final title = Paper(id: '', exam: pp.exam, year: pp.year, session: pp.session, subjects: pp.subjects, paperFile: '-', paperHash: '', addedAt: DateTime(2000)).longTitle;
    final existing = withHash(hash);
    if (existing != null) {
      // Already here: a key or questions the pack brings are still added to it.
      if (existing.paperHash == hash && ((pp.key != null && !existing.hasKey) || (pp.questions != null && !existing.hasQuestions))) {
        await _attach(existing, pp, r);
      } else {
        r.duplicates.add(title);
      }
      return;
    }
    final id = hash.substring(0, 12);
    final dir = _dir(id);
    await storage.write('$dir/paper.pdf', pp.pdf);
    final p = Paper(
      id: id,
      exam: pp.exam,
      year: pp.year,
      session: pp.session,
      subjects: pp.subjects,
      language: pp.language,
      source: pp.source,
      paperFile: '$dir/paper.pdf',
      paperHash: hash,
      pageCount: countPdfPages(pp.pdf),
      packId: packId,
      addedAt: now(),
    );
    _papers = [..._papers, p];
    await _attach(p, pp, r, isNew: true);
  }

  Future<void> _attach(Paper p, PackPaper pp, ImportReport r, {bool isNew = false}) async {
    final dir = _dir(p.id);
    var out = p;
    if (pp.key != null && !p.hasKey && withHash(hashOf(pp.key!)) == null) {
      await storage.write('$dir/key.pdf', pp.key!);
      out = out.copyWith(keyFile: '$dir/key.pdf', keyHash: hashOf(pp.key!));
      if (!isNew) r.keysAdded.add(p.longTitle);
    }
    final qs = pp.questions;
    if (qs != null && !p.hasQuestions) {
      // Pictures are kept as images/<n>.<ext>, and the question set points at them.
      final renamed = <String, String>{};
      for (final e in pp.images.entries) {
        final ext = e.value[0] == 0xFF ? 'jpg' : 'png';
        final to = '$dir/images/${renamed.length + 1}.$ext';
        await storage.write(to, e.value);
        renamed[e.key] = to;
      }
      final set = QuestionSet([for (final q in qs.questions) q.image == null ? q : PaperQuestion.fromJson(q.toJson()..['image'] = renamed[q.image])]);
      await storage.write('$dir/questions.json', utf8.encode(jsonEncode(set.toJson())));
      out = out.copyWith(questionsFile: '$dir/questions.json', questionCount: set.questions.length);
    }
    _papers = [for (final x in _papers) x.id == p.id ? out : x];
    await _save();
    if (isNew) r.added.add(out.longTitle);
  }

  /// Saves a page count learned by the viewer.
  Future<void> setPageCount(Paper p, int pages) async {
    if (p.pageCount == pages || byId(p.id) == null) return;
    _papers = [for (final x in _papers) x.id == p.id ? x.copyWith(pageCount: pages) : x];
    await _save();
  }

  /// Corrects what a paper is (the form, after an import).
  Future<void> update(Paper p) async {
    _papers = [for (final x in _papers) x.id == p.id ? p : x];
    await _save();
  }

  Future<void> remove(Paper p) async {
    _papers = [for (final x in _papers) if (x.id != p.id) x];
    await storage.deleteAll('${_dir(p.id)}/');
    await _save();
  }

  /// Imports the packs bundled with the app (`assets/private/past_papers/*.zip`) that this
  /// board has not imported yet. The folder is optional: without it nothing happens.
  Future<ImportReport> importBundled({AssetBundle? bundle}) async {
    final r = ImportReport();
    final b = bundle ?? rootBundle;
    List<String> names;
    try {
      final manifest = await AssetManifest.loadFromAssetBundle(b);
      names = [
        for (final a in manifest.listAssets())
          if (a.startsWith(bundledDir) && a.toLowerCase().endsWith('.zip') && !_bundled.contains(a)) a,
      ];
    } catch (_) {
      return r;
    }
    for (final name in names) {
      try {
        final data = await b.load(name);
        r.addAll(await addPack(data.buffer.asUint8List(data.offsetInBytes, data.lengthInBytes), fileName: name.split('/').last));
        _bundled.add(name);
        await _save();
      } catch (e) {
        r.problems.add('${name.split('/').last}: $e');
      }
    }
    return r;
  }
}

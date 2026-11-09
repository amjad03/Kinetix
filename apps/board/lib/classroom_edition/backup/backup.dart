import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:archive/archive.dart';
import 'package:flutter/foundation.dart';
import 'package:intl/intl.dart';
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../core/app_info.dart';
import '../../core/crash/crash_log.dart';
import '../boards/board_library.dart';
import '../edition.dart';
import '../lessons/lesson_progress.dart';
import '../local/classroom_store.dart';
import '../l10n/ce_strings.dart';
import 'public_documents.dart';

/// A backup is not one, or is from a newer app.
class BackupFormatException implements Exception {
  const BackupFormatException(this.message);
  final String message;
  @override
  String toString() => message;
}

/// What a backup holds, for the restore preview and the list of backups.
@immutable
class BackupSummary {
  const BackupSummary({
    required this.createdAt,
    required this.kind,
    this.college = '',
    this.teachers = 0,
    this.classes = 0,
    this.periods = 0,
    this.marksClasses = 0,
    this.mockTests = 0,
    this.quizMarks = 0,
    this.lessonClasses = 0,
    this.boards = 0,
    this.hasPin = false,
    this.app = '',
  });

  final DateTime createdAt;

  /// "manual", "daily" or "before-restore".
  final String kind;
  final String college, app;
  final int teachers, classes, periods, marksClasses, mockTests, quizMarks, lessonClasses, boards;

  /// Whether it carries the college's own school PIN (restoring makes it the PIN).
  final bool hasPin;

  Map<String, dynamic> toJson() => {
    'createdAt': createdAt.toIso8601String(),
    'kind': kind,
    'college': college,
    'app': app,
    'teachers': teachers,
    'classes': classes,
    'periods': periods,
    'marksClasses': marksClasses,
    'mockTests': mockTests,
    'quizMarks': quizMarks,
    'lessonClasses': lessonClasses,
    'boards': boards,
    'hasPin': hasPin,
  };

  static BackupSummary fromJson(Map<String, dynamic> j) {
    int n(String k) => (j[k] as num?)?.toInt() ?? 0;
    return BackupSummary(
      createdAt: DateTime.tryParse('${j['createdAt']}') ?? DateTime(2000),
      kind: '${j['kind'] ?? 'manual'}',
      college: '${j['college'] ?? ''}',
      app: '${j['app'] ?? ''}',
      teachers: n('teachers'),
      classes: n('classes'),
      periods: n('periods'),
      marksClasses: n('marksClasses'),
      mockTests: n('mockTests'),
      quizMarks: n('quizMarks'),
      lessonClasses: n('lessonClasses'),
      boards: n('boards'),
      hasPin: j['hasPin'] == true,
    );
  }
}

/// One Classroom edition backup: a zip with `manifest.json` (format, version, what it holds),
/// `settings.json` (the college set-up and school PIN hash, every class's marks and mock tests,
/// lesson progress: the board's own settings under [ClassroomBackup.managed]), the boards saved
/// on the board (`boards/…`) and the crash log (`logs/…`).
class ClassroomBackup {
  ClassroomBackup({required this.summary, required this.settings, this.files = const {}});

  static const format = 'zynetix-classroom-backup';
  static const version = 1;

  /// The shared-preferences keys a backup carries (and a restore replaces).
  static const managed = ['setting.classroom.', 'setting.classTools.', 'ce.lessons.'];

  /// Never carried: the PIN lockout is this board's own.
  static const notCarried = {'setting.${ClassroomStore.lockoutKey}'};

  static bool isManaged(String key) => !notCarried.contains(key) && managed.any(key.startsWith);

  final BackupSummary summary;
  final Map<String, String> settings;

  /// `boards/<teacher>/<class>/<file>` and `logs/<file>`.
  final Map<String, Uint8List> files;

  CeSetup? get setup => ClassroomStore.parseSetup(settings['setting.${ClassroomStore.setupKey}']);

  Uint8List encode() {
    final a = Archive()
      ..addFile(ArchiveFile.string('manifest.json', const JsonEncoder.withIndent('  ').convert({'format': format, 'version': version, ...summary.toJson()})))
      ..addFile(ArchiveFile.string('settings.json', jsonEncode(settings)));
    for (final e in files.entries) {
      a.addFile(ArchiveFile.bytes(e.key, e.value));
    }
    return ZipEncoder().encodeBytes(a);
  }

  static ClassroomBackup decode(Uint8List bytes) {
    final Archive a;
    try {
      a = ZipDecoder().decodeBytes(bytes);
    } catch (_) {
      throw BackupFormatException(ceTr('This file is not a Zynetix Classroom backup.'));
    }
    String? text(String name) {
      final f = a.findFile(name);
      final b = f?.readBytes();
      return b == null ? null : utf8.decode(b);
    }

    final Map<String, dynamic> manifest;
    final Map<String, dynamic> settings;
    try {
      manifest = (jsonDecode(text('manifest.json') ?? '') as Map).cast<String, dynamic>();
      settings = (jsonDecode(text('settings.json') ?? '') as Map).cast<String, dynamic>();
    } catch (_) {
      throw BackupFormatException(ceTr('This file is not a Zynetix Classroom backup.'));
    }
    if (manifest['format'] != format) throw BackupFormatException(ceTr('This file is not a Zynetix Classroom backup.'));
    if ((manifest['version'] as num? ?? 0) > version) throw BackupFormatException(ceTr('This backup is from a newer Zynetix Classroom. Update the app on this board first.'));
    final files = <String, Uint8List>{};
    for (final f in a.files) {
      if (!f.isFile || f.name == 'manifest.json' || f.name == 'settings.json') continue;
      final b = f.readBytes();
      if (b != null) files[f.name] = b;
    }
    return ClassroomBackup(
      summary: BackupSummary.fromJson(manifest),
      settings: {
        for (final e in settings.entries)
          if (e.value is String && isManaged(e.key)) e.key: e.value as String,
      },
      files: files,
    );
  }
}

/// A backup kept on this board (in the app's storage).
@immutable
class BackupFile {
  const BackupFile({required this.file, required this.kind, required this.at});
  final File file;
  final String kind;
  final DateTime at;
  String get name => file.uri.pathSegments.last;
}

/// What "Back up now" did.
@immutable
class BackupResult {
  const BackupResult({required this.name, required this.bytes, required this.onBoard, this.publicPath, this.publicError});
  final String name;
  final Uint8List bytes;

  /// The copy in the app's storage.
  final File onBoard;

  /// The copy in Documents/Zynetix (survives an uninstall), or why it could not be written.
  final String? publicPath, publicError;
}

/// Backups of the Classroom edition (Settings → Backup & restore): "Back up now" (the app's
/// storage, Documents/Zynetix, and a copy anywhere through the system's Save dialog: a USB
/// drive), a daily backup kept for 14 days, and restore.
class BackupService {
  BackupService({
    required this.store,
    LocalBoardLibrary? library,
    CrashLog? log,
    PublicDocuments? documents,
    Future<Directory> Function()? dir,
    DateTime Function()? now,
  }) : library = library ?? LocalBoardLibrary.instance,
       log = log ?? CrashLog.instance,
       documents = documents ?? PublicDocuments.instance,
       _dir = dir ?? _defaultDir,
       now = now ?? store.now;

  /// Tests set the folder backups are kept in.
  static Future<Directory> Function()? dirOverride;

  static Future<Directory> _defaultDir() async => dirOverride != null ? dirOverride!() : Directory('${(await getApplicationSupportDirectory()).path}${Platform.pathSeparator}backups');

  final ClassroomStore store;
  final LocalBoardLibrary library;
  final CrashLog log;
  final PublicDocuments documents;
  final Future<Directory> Function() _dir;
  final DateTime Function() now;

  static const keepDaily = 14, keepManual = 10, keepBeforeRestore = 5;
  static const dailyPrefix = 'zynetix-daily-', manualPrefix = 'zynetix-backup-', beforeRestorePrefix = 'zynetix-before-restore-';
  static const dailyFolder = '${PublicDocuments.root}/Daily backups';

  static final _dayName = DateFormat('yyyy-MM-dd');
  static final _stamp = DateFormat('yyyy-MM-dd-HHmm');

  Future<Directory> _folder([String sub = '']) async {
    final root = await _dir();
    final d = sub.isEmpty ? root : Directory('${root.path}${Platform.pathSeparator}$sub');
    await d.create(recursive: true);
    return d;
  }

  /// Everything a backup carries, as it is on the board now.
  Future<ClassroomBackup> collect({String kind = 'manual'}) async {
    final p = await SharedPreferences.getInstance();
    final settings = <String, String>{
      for (final k in p.getKeys())
        if (ClassroomBackup.isManaged(k) && p.get(k) is String) k: p.getString(k)!,
    };
    final files = <String, Uint8List>{};
    try {
      final root = await library.root();
      await for (final f in root.list(recursive: true, followLinks: false)) {
        if (f is! File || f.path.endsWith('.tmp')) continue;
        final rel = f.path.substring(root.path.length + 1).replaceAll(Platform.pathSeparator, '/');
        files['boards/$rel'] = await f.readAsBytes();
      }
    } catch (e) {
      debugPrint('Backup: boards not read: $e');
    }
    for (final f in await log.files()) {
      try {
        files['logs/${f.uri.pathSegments.last}'] = await f.readAsBytes();
      } catch (_) {}
    }
    return ClassroomBackup(summary: summarise(settings, files, kind: kind, at: now()), settings: settings, files: files);
  }

  /// What [settings] and [files] hold.
  static BackupSummary summarise(Map<String, String> settings, Map<String, Uint8List> files, {required String kind, required DateTime at}) {
    final setup = ClassroomStore.parseSetup(settings['setting.${ClassroomStore.setupKey}']);
    var marksClasses = 0, mocks = 0, quizzes = 0, lessons = 0;
    for (final e in settings.entries) {
      if (e.key.startsWith('setting.classTools.')) {
        try {
          final j = jsonDecode(e.value) as Map;
          final m = (j['mocks'] as List?)?.length ?? 0, q = (j['quizzes'] as List?)?.length ?? 0;
          mocks += m;
          quizzes += q;
          if (m + q > 0) marksClasses++;
        } catch (_) {}
      } else if (e.key.startsWith('ce.lessons.')) {
        lessons++;
      }
    }
    return BackupSummary(
      createdAt: at,
      kind: kind,
      college: setup?.college ?? '',
      app: '${Edition.appName} $kBoardVersion',
      teachers: setup?.teachers.length ?? 0,
      classes: setup?.classes.length ?? 0,
      periods: setup?.slots.length ?? 0,
      marksClasses: marksClasses,
      mockTests: mocks,
      quizMarks: quizzes,
      lessonClasses: lessons,
      boards: files.keys.where((k) => k.startsWith('boards/') && k.endsWith('.meta.json')).length,
      hasPin: settings.containsKey('setting.${ClassroomStore.pinKey}'),
    );
  }

  /// "Back up now": the backup in the app's storage (the last [keepManual] kept) and in
  /// Documents/Zynetix, where an uninstall does not remove it. The answer's bytes can also go
  /// through the system's Save dialog (a USB drive).
  Future<BackupResult> backUpNow() => _write(kind: 'manual', name: '$manualPrefix${_stamp.format(now())}.zip', sub: '', prefix: manualPrefix, keep: keepManual, publicFolder: PublicDocuments.root);

  /// Today's daily backup, unless there is one already (null then). The last [keepDaily] are
  /// kept, on the board and in Documents/Zynetix/Daily backups.
  Future<BackupResult?> ensureDaily() async {
    final name = '$dailyPrefix${_dayName.format(now())}.zip';
    final dir = await _folder('daily');
    if (await File('${dir.path}${Platform.pathSeparator}$name').exists()) return null;
    return _write(kind: 'daily', name: name, sub: 'daily', prefix: dailyPrefix, keep: keepDaily, publicFolder: dailyFolder);
  }

  Future<BackupResult> _write({required String kind, required String name, required String sub, required String prefix, required int keep, String? publicFolder}) async {
    final bytes = (await collect(kind: kind)).encode();
    final dir = await _folder(sub);
    final f = File('${dir.path}${Platform.pathSeparator}$name');
    final tmp = File('${f.path}.tmp');
    await tmp.writeAsBytes(bytes, flush: true);
    await tmp.rename(f.path);
    await _prune(dir, prefix, keep);
    String? publicPath, publicError;
    if (publicFolder != null) {
      try {
        publicPath = await documents.save(publicFolder, name, bytes, mime: 'application/zip');
        await documents.prune(publicFolder, prefix: prefix, keep: keep);
      } catch (e) {
        publicError = '$e';
        debugPrint('Backup not copied to Documents: $e');
      }
    }
    return BackupResult(name: name, bytes: bytes, onBoard: f, publicPath: publicPath, publicError: publicError);
  }

  static Future<void> _prune(Directory dir, String prefix, int keep) async {
    final names = [
      for (final f in dir.listSync())
        if (f is File && f.uri.pathSegments.last.startsWith(prefix) && f.path.endsWith('.zip')) f,
    ]..sort((a, b) => b.path.compareTo(a.path));
    for (final f in names.skip(keep)) {
      try {
        await f.delete();
      } catch (_) {}
    }
  }

  /// When a backup was made, from its name ("…-2026-11-09-1005.zip", "…-2026-11-09.zip").
  static DateTime? _stampOf(String name) {
    final m = RegExp(r'(\d{4})-(\d{2})-(\d{2})(?:-(\d{2})(\d{2}))?\.zip$').firstMatch(name);
    if (m == null) return null;
    int g(int i) => int.parse(m.group(i) ?? '0');
    return DateTime(g(1), g(2), g(3), g(4), g(5));
  }

  /// The backups kept on this board, newest first.
  Future<List<BackupFile>> onBoard() async {
    final out = <BackupFile>[];
    for (final (sub, kind) in const [('', 'manual'), ('daily', 'daily')]) {
      final dir = await _folder(sub);
      for (final f in dir.listSync()) {
        if (f is! File || !f.path.endsWith('.zip')) continue;
        final n = f.uri.pathSegments.last;
        final k = n.startsWith(beforeRestorePrefix) ? 'before-restore' : kind;
        out.add(BackupFile(file: f, kind: k, at: _stampOf(n) ?? f.statSync().modified));
      }
    }
    return out..sort((a, b) => b.at.compareTo(a.at));
  }

  /// Puts [b] on the board in place of what is there: the college set-up and PIN, marks, lesson
  /// progress and saved boards. What was there is backed up first (kept on the board as
  /// "before restore"), so a wrong restore can be undone.
  Future<void> restore(ClassroomBackup b) async {
    if (b.setup == null) throw BackupFormatException(ceTr('This backup has no college set-up in it.'));
    await _write(kind: 'before-restore', name: '$beforeRestorePrefix${_stamp.format(now())}.zip', sub: '', prefix: beforeRestorePrefix, keep: keepBeforeRestore);
    final p = await SharedPreferences.getInstance();
    for (final k in p.getKeys().toList()) {
      if (ClassroomBackup.isManaged(k) && !k.startsWith('setting.${ClassroomStore.badPrefix}')) await p.remove(k);
    }
    for (final e in b.settings.entries) {
      if (e.key.startsWith('setting.${ClassroomStore.badPrefix}')) continue;
      await p.setString(e.key, e.value);
    }
    // The saved boards: the backup's in place of the board's.
    final root = await library.root();
    for (final f in root.listSync()) {
      await f.delete(recursive: true);
    }
    for (final e in b.files.entries) {
      if (!e.key.startsWith('boards/')) continue;
      final rel = e.key.substring('boards/'.length);
      final parts = rel.split('/');
      if (parts.any((x) => x.isEmpty || x == '.' || x == '..')) continue;
      final f = File('${root.path}${Platform.pathSeparator}${parts.join(Platform.pathSeparator)}');
      await f.parent.create(recursive: true);
      await f.writeAsBytes(e.value, flush: true);
    }
    library.changed();
    await store.load();
    store.problem = null;
    // Lesson progress is read again from what was restored.
    LessonProgress.instance = LessonProgress();
    await LessonProgress.instance.load();
  }
}

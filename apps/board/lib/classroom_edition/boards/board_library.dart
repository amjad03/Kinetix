import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:flutter/foundation.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:path_provider/path_provider.dart';

/// One board saved on this board's own storage (Classroom edition, no server).
@immutable
class LocalBoardEntry {
  const LocalBoardEntry({
    required this.id,
    required this.title,
    required this.teacherId,
    required this.classId,
    this.className = '',
    this.subject = '',
    required this.savedAt,
    this.openedAt,
    this.pages = 1,
  });

  final String id;
  final String title;

  /// Whose board it is ("guest" for a guest teacher) and for which class.
  final String teacherId, classId;
  final String className, subject;
  final DateTime savedAt;

  /// When it was last opened (null: never since it was saved).
  final DateTime? openedAt;
  final int pages;

  /// When it was last used: opened or saved.
  DateTime get usedAt => openedAt != null && openedAt!.isAfter(savedAt) ? openedAt! : savedAt;

  LocalBoardEntry copyWith({String? title, DateTime? savedAt, DateTime? openedAt, int? pages}) => LocalBoardEntry(
    id: id,
    title: title ?? this.title,
    teacherId: teacherId,
    classId: classId,
    className: className,
    subject: subject,
    savedAt: savedAt ?? this.savedAt,
    openedAt: openedAt ?? this.openedAt,
    pages: pages ?? this.pages,
  );

  Map<String, dynamic> toJson() => {
    'v': 1,
    'id': id,
    'title': title,
    'teacher': teacherId,
    'class': classId,
    'className': className,
    'subject': subject,
    'savedAt': savedAt.toIso8601String(),
    if (openedAt != null) 'openedAt': openedAt!.toIso8601String(),
    'pages': pages,
  };

  static LocalBoardEntry? fromJson(Object? j) {
    if (j is! Map) return null;
    final id = j['id'], savedAt = DateTime.tryParse('${j['savedAt']}');
    if (id is! String || id.isEmpty || savedAt == null) return null;
    return LocalBoardEntry(
      id: id,
      title: '${j['title'] ?? 'Board'}',
      teacherId: '${j['teacher'] ?? ''}',
      classId: '${j['class'] ?? ''}',
      className: '${j['className'] ?? ''}',
      subject: '${j['subject'] ?? ''}',
      savedAt: savedAt,
      openedAt: DateTime.tryParse('${j['openedAt'] ?? ''}'),
      pages: (j['pages'] as num?)?.toInt() ?? 1,
    );
  }
}

/// The boards teachers save in the Classroom edition, kept in the app's own storage, one folder
/// per teacher and class: `boards/<teacher>/<class>/<id>.board.json` (the board),
/// `<id>.meta.json` (title, class, dates; read for the grid) and `<id>.png` (its thumbnail).
/// Files are written beside themselves and renamed into place, so a power cut keeps the copy
/// before. Backups take the whole folder (classroom_edition/backup).
class LocalBoardLibrary extends ChangeNotifier {
  LocalBoardLibrary({Future<Directory> Function()? root, DateTime Function()? now}) : _root = root ?? _defaultRoot, now = now ?? DateTime.now;

  /// The library the board uses. Tests replace it.
  static LocalBoardLibrary instance = LocalBoardLibrary();

  static Future<Directory> _defaultRoot() async => Directory('${(await getApplicationSupportDirectory()).path}${Platform.pathSeparator}boards');

  final Future<Directory> Function() _root;
  DateTime Function() now;

  Future<Directory> root() async {
    final d = await _root();
    await d.create(recursive: true);
    return d;
  }

  /// A folder name for an id ("t1a2", "guest", "c1a").
  static String slug(String id) {
    final s = id.replaceAll(RegExp(r'[^A-Za-z0-9_-]'), '_');
    return s.isEmpty ? '_' : s;
  }

  Future<Directory> _folder(String teacherId, String classId) async {
    final sep = Platform.pathSeparator;
    final d = Directory('${(await root()).path}$sep${slug(teacherId)}$sep${slug(classId)}');
    await d.create(recursive: true);
    return d;
  }

  /// Every board kept (newest saved first); only [teacherId]'s and/or [classId]'s when given.
  Future<List<LocalBoardEntry>> list({String? teacherId, String? classId}) async {
    final out = <LocalBoardEntry>[];
    try {
      final r = await root();
      await for (final f in r.list(recursive: true, followLinks: false)) {
        if (f is! File || !f.path.endsWith('.meta.json')) continue;
        try {
          final e = LocalBoardEntry.fromJson(jsonDecode(await f.readAsString()));
          if (e == null) continue;
          if (teacherId != null && e.teacherId != teacherId) continue;
          if (classId != null && e.classId != classId) continue;
          out.add(e);
        } catch (_) {
          // A damaged entry is skipped, never deleted.
        }
      }
    } catch (e) {
      debugPrint('Board library not read: $e');
    }
    return out..sort((a, b) => b.savedAt.compareTo(a.savedAt));
  }

  /// [teacherId]'s boards last used (opened or saved), newest first.
  Future<List<LocalBoardEntry>> recent({required String teacherId, int limit = 4}) async {
    final all = await list(teacherId: teacherId);
    all.sort((a, b) => b.usedAt.compareTo(a.usedAt));
    return all.take(limit).toList();
  }

  Future<LocalBoardEntry?> entry(String id) async => (await list()).where((e) => e.id == id).firstOrNull;

  /// Saves [board] as [title] for [teacherId] and [classId]: over the board [id] when given (it
  /// keeps its id), else as a new one. Answers its entry.
  Future<LocalBoardEntry> save(
    SavedBoard board, {
    required String title,
    required String teacherId,
    required String classId,
    String className = '',
    String subject = '',
    String? id,
    Uint8List? thumbnail,
  }) async {
    final old = id == null ? null : await entry(id);
    final e = LocalBoardEntry(
      id: old?.id ?? newId(),
      title: title.trim().isEmpty ? 'Board' : title.trim(),
      teacherId: old?.teacherId ?? teacherId,
      classId: old?.classId ?? classId,
      className: className.isEmpty ? old?.className ?? '' : className,
      subject: subject.isEmpty ? old?.subject ?? '' : subject,
      savedAt: now(),
      pages: board.pages.length,
    );
    final dir = await _folder(e.teacherId, e.classId);
    final base = '${dir.path}${Platform.pathSeparator}${e.id}';
    await _write(File('$base.board.json'), utf8.encode(jsonEncode(board.toJson())));
    if (thumbnail != null) await _write(File('$base.png'), thumbnail);
    await _write(File('$base.meta.json'), utf8.encode(jsonEncode(e.toJson())));
    notifyListeners();
    return e;
  }

  /// The board saved as [id] (null when it is gone or unreadable); it becomes the newest opened.
  Future<SavedBoard?> open(String id) async {
    final e = await entry(id);
    if (e == null) return null;
    final base = await _base(e);
    try {
      final b = SavedBoard.fromJson((jsonDecode(await File('$base.board.json').readAsString()) as Map).cast<String, dynamic>());
      await _write(File('$base.meta.json'), utf8.encode(jsonEncode(e.copyWith(openedAt: now()).toJson())));
      notifyListeners();
      return b;
    } catch (err) {
      debugPrint('Board ${e.id} not opened: $err');
      return null;
    }
  }

  Future<Uint8List?> thumbnail(LocalBoardEntry e) async {
    try {
      final f = File('${await _base(e)}.png');
      return await f.exists() ? await f.readAsBytes() : null;
    } catch (_) {
      return null;
    }
  }

  Future<void> rename(String id, String title) async {
    final e = await entry(id);
    if (e == null || title.trim().isEmpty) return;
    await _write(File('${await _base(e)}.meta.json'), utf8.encode(jsonEncode(e.copyWith(title: title.trim()).toJson())));
    notifyListeners();
  }

  Future<void> delete(String id) async {
    final e = await entry(id);
    if (e == null) return;
    final base = await _base(e);
    for (final ext in const ['.meta.json', '.board.json', '.png']) {
      final f = File('$base$ext');
      try {
        if (await f.exists()) await f.delete();
      } catch (err) {
        debugPrint('Board file $ext not deleted: $err');
      }
    }
    notifyListeners();
  }

  /// The files changed under the library (a backup was restored).
  void changed() => notifyListeners();

  Future<String> _base(LocalBoardEntry e) async => '${(await _folder(e.teacherId, e.classId)).path}${Platform.pathSeparator}${e.id}';

  static Future<void> _write(File f, List<int> bytes) async {
    final tmp = File('${f.path}.tmp');
    await tmp.writeAsBytes(bytes, flush: true);
    await tmp.rename(f.path);
  }

  final _random = Random();
  String newId() => 'b${now().microsecondsSinceEpoch.toRadixString(36)}${_random.nextInt(1 << 20).toRadixString(36)}';
}

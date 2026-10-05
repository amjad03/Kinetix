import 'dart:convert';
import 'dart:io';
import 'dart:ui';

import 'package:flutter/foundation.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:path_provider/path_provider.dart';

/// Each teacher's own whiteboard on a shared board (features/profiles): when the board switches
/// teacher with a PIN, the board on screen is kept for the teacher who is leaving and the
/// arriving teacher's comes back. Kept on the board only; saving to the cloud is still "Save".
abstract class ProfileBoardStore {
  Future<SavedBoard?> load(String key);
  Future<void> save(String key, SavedBoard board);
}

/// One JSON file per teacher in the app's support folder.
class FileProfileBoardStore implements ProfileBoardStore {
  Future<File> _file(String key) async {
    final dir = Directory('${(await getApplicationSupportDirectory()).path}/profile_boards');
    await dir.create(recursive: true);
    // Teacher ids are UUIDs; anything else is reduced to safe characters.
    return File('${dir.path}/${key.replaceAll(RegExp(r'[^A-Za-z0-9-]'), '_')}.json');
  }

  @override
  Future<SavedBoard?> load(String key) async {
    try {
      final f = await _file(key);
      if (!await f.exists()) return null;
      return SavedBoard.fromJson(jsonDecode(await f.readAsString()) as Map<String, dynamic>);
    } catch (e) {
      debugPrint('Teacher board unreadable: $e');
      return null;
    }
  }

  @override
  Future<void> save(String key, SavedBoard board) async {
    try {
      await (await _file(key)).writeAsString(jsonEncode(board.toJson()));
    } catch (e) {
      debugPrint('Teacher board not kept: $e');
    }
  }
}

class MemoryProfileBoardStore implements ProfileBoardStore {
  final Map<String, Map<String, dynamic>> boards = {};

  @override
  Future<SavedBoard?> load(String key) async => boards[key] == null ? null : SavedBoard.fromJson(boards[key]!);

  @override
  Future<void> save(String key, SavedBoard board) async => boards[key] = jsonDecode(jsonEncode(board.toJson())) as Map<String, dynamic>;
}

/// Keeps [wb]'s board for [from] and opens [to]'s (a clean board when they have none). Null
/// ids are the guest board.
Future<void> switchProfileBoard(WhiteboardController wb, Size canvas, ProfileBoardStore store, String? from, String? to) async {
  await store.save(from ?? 'guest', wb.toSaved(canvas));
  final next = await store.load(to ?? 'guest');
  wb.load(next ?? const SavedBoard(background: BoardBackground.plain, canvas: Size.zero, pages: []));
}

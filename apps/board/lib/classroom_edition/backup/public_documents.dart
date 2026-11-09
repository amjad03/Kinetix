import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:path_provider/path_provider.dart';

/// Where backups and exports go so that they outlive the app: the device's public Documents
/// folder, `Documents/Zynetix/…` (Android: MediaStore, no permission on Android 10 and later,
/// android/…/DocumentSaver.kt; a computer: its Documents folder). Uninstalling the app does not
/// remove them.
abstract class PublicDocuments {
  /// The one the app uses. Tests replace it with a [MemoryDocuments].
  static PublicDocuments instance = defaultForPlatform();

  static PublicDocuments defaultForPlatform() => !kIsWeb && Platform.isAndroid ? AndroidDocuments() : FolderDocuments();

  /// The folder under Documents ("Zynetix", "Zynetix/Daily backups").
  static const root = 'Zynetix';

  /// Writes [bytes] as Documents/[folder]/[name]; answers where it went for the teacher
  /// ("Documents/Zynetix/zynetix-backup-….zip").
  Future<String> save(String folder, String name, Uint8List bytes, {String mime = 'application/octet-stream'});

  /// The names of the app's files in Documents/[folder].
  Future<List<String>> list(String folder);

  /// Deletes the app's files in [folder] starting with [prefix], but the newest [keep] by name.
  Future<void> prune(String folder, {required String prefix, required int keep});
}

class AndroidDocuments extends PublicDocuments {
  AndroidDocuments({MethodChannel? channel}) : _channel = channel ?? const MethodChannel('zynetix/documents');

  final MethodChannel _channel;

  @override
  Future<String> save(String folder, String name, Uint8List bytes, {String mime = 'application/octet-stream'}) async =>
      (await _channel.invokeMethod<String>('save', {'folder': folder, 'name': name, 'bytes': bytes, 'mime': mime})) ?? 'Documents/$folder/$name';

  @override
  Future<List<String>> list(String folder) async => [...?(await _channel.invokeListMethod<String>('list', {'folder': folder}))];

  @override
  Future<void> prune(String folder, {required String prefix, required int keep}) => _channel.invokeMethod<int>('prune', {'folder': folder, 'prefix': prefix, 'keep': keep});
}

/// A computer (or anywhere without MediaStore): a real folder, the user's Documents.
class FolderDocuments extends PublicDocuments {
  FolderDocuments({Future<Directory> Function()? documents}) : _documents = documents ?? getApplicationDocumentsDirectory;

  final Future<Directory> Function() _documents;

  Future<Directory> _dir(String folder) async {
    final d = Directory('${(await _documents()).path}${Platform.pathSeparator}${folder.replaceAll('/', Platform.pathSeparator)}');
    await d.create(recursive: true);
    return d;
  }

  @override
  Future<String> save(String folder, String name, Uint8List bytes, {String mime = 'application/octet-stream'}) async {
    final d = await _dir(folder);
    final f = File('${d.path}${Platform.pathSeparator}$name');
    final tmp = File('${f.path}.tmp');
    await tmp.writeAsBytes(bytes, flush: true);
    await tmp.rename(f.path);
    return f.path;
  }

  @override
  Future<List<String>> list(String folder) async => [
    for (final f in (await _dir(folder)).listSync())
      if (f is File && !f.path.endsWith('.tmp')) f.uri.pathSegments.last,
  ];

  @override
  Future<void> prune(String folder, {required String prefix, required int keep}) async {
    final d = await _dir(folder);
    final names = (await list(folder)).where((n) => n.startsWith(prefix)).toList()..sort((a, b) => b.compareTo(a));
    for (final n in names.skip(keep)) {
      await File('${d.path}${Platform.pathSeparator}$n').delete();
    }
  }
}

/// For tests.
class MemoryDocuments extends PublicDocuments {
  final files = <String, Uint8List>{};

  @override
  Future<String> save(String folder, String name, Uint8List bytes, {String mime = 'application/octet-stream'}) async {
    files['$folder/$name'] = bytes;
    return 'Documents/$folder/$name';
  }

  @override
  Future<List<String>> list(String folder) async => [
    for (final k in files.keys)
      if (k.startsWith('$folder/') && !k.substring(folder.length + 1).contains('/')) k.substring(folder.length + 1),
  ];

  @override
  Future<void> prune(String folder, {required String prefix, required int keep}) async {
    final names = (await list(folder)).where((n) => n.startsWith(prefix)).toList()..sort((a, b) => b.compareTo(a));
    for (final n in names.skip(keep)) {
      files.remove('$folder/$n');
    }
  }
}

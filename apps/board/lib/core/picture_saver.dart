import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:path_provider/path_provider.dart';

/// Saves a PNG where the teacher will find it: the Android gallery (Pictures/Zynetix, through
/// MediaStore, no permission needed on Android 10 and later), the Downloads folder on a computer,
/// and the system Save dialog anywhere else. Android's Save dialog cannot be relied on for a
/// picture the board has rendered, and a desktop one never writes the bytes it is given, which is
/// why a screenshot used to vanish.
class PictureSaver {
  PictureSaver({MethodChannel? channel, Future<Directory?> Function()? downloads, this.platform})
    : _channel = channel ?? const MethodChannel('kinetix/gallery'),
      _downloads = downloads ?? getDownloadsDirectory;

  final MethodChannel _channel;
  final Future<Directory?> Function() _downloads;
  final TargetPlatform? platform;

  /// Where the last picture went, for the "saved" message: "Pictures/Zynetix" or a file path.
  String? savedTo;

  TargetPlatform get _target => platform ?? defaultTargetPlatform;

  /// Saves [png] as [name]; false when nothing was saved (a cancelled dialog). Throws when the
  /// device refuses, so the board can say why.
  Future<bool> savePng(String name, Uint8List png) async {
    savedTo = null;
    if (!kIsWeb && _target == TargetPlatform.android) {
      final uri = await _channel.invokeMethod<String>('savePng', {'name': name, 'bytes': png});
      if (uri == null || uri.isEmpty) return false;
      savedTo = 'Pictures/Zynetix';
      return true;
    }
    if (!kIsWeb && (_target == TargetPlatform.macOS || _target == TargetPlatform.windows || _target == TargetPlatform.linux)) {
      final dir = await _downloads();
      if (dir == null) throw const FileSystemException('No Downloads folder on this computer');
      await dir.create(recursive: true);
      final file = _free(dir, name);
      await file.writeAsBytes(png, flush: true);
      savedTo = file.path;
      return true;
    }
    final picked = await FilePicker.saveFile(fileName: name, bytes: png, mimeType: 'image/png', type: FileType.image);
    savedTo = picked?.toString();
    return picked != null;
  }

  /// [name] in [dir], or "name (2).png" when the file is already there.
  static File _free(Directory dir, String name) {
    var file = File('${dir.path}${Platform.pathSeparator}$name');
    final dot = name.lastIndexOf('.');
    final stem = dot < 0 ? name : name.substring(0, dot), ext = dot < 0 ? '' : name.substring(dot);
    for (var i = 2; file.existsSync(); i++) {
      file = File('${dir.path}${Platform.pathSeparator}$stem ($i)$ext');
    }
    return file;
  }
}

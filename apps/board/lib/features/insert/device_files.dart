import 'dart:io';
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:file_picker/file_picker.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/painting.dart';
import 'package:image_picker/image_picker.dart';

/// A file the teacher picked: its name and contents.
class PickedFile {
  const PickedFile(this.name, this.bytes);
  final String name;
  final Uint8List bytes;
}

/// Where pictures and documents come from: the file dialog on Windows, the gallery, camera or
/// storage on Android. Kept behind this so tests can hand in files.
abstract class DeviceFiles {
  static DeviceFiles instance = PlatformFiles();

  /// Whether this board can take a photo (Android panels with a camera).
  bool get hasCamera;

  /// A picture from the gallery (Android) or the file dialog (Windows); with [camera], a new
  /// photo. Null when the teacher cancels.
  Future<PickedFile?> pickPicture({bool camera = false});

  /// A PDF or PowerPoint. Null when the teacher cancels.
  Future<PickedFile?> pickDocument();
}

class PlatformFiles implements DeviceFiles {
  final _images = ImagePicker();

  bool get _android => !kIsWeb && Platform.isAndroid;

  @override
  bool get hasCamera => _android;

  @override
  Future<PickedFile?> pickPicture({bool camera = false}) async {
    if (_android) {
      final x = await _images.pickImage(source: camera ? ImageSource.camera : ImageSource.gallery, maxWidth: 2400, maxHeight: 2400);
      return x == null ? null : PickedFile(x.name, await x.readAsBytes());
    }
    return _pick(FileType.image);
  }

  @override
  Future<PickedFile?> pickDocument() => _pick(FileType.custom, const ['pdf', 'pptx', 'ppt']);

  Future<PickedFile?> _pick(FileType type, [List<String>? extensions]) async {
    final f = await FilePicker.pickFile(type: type, allowedExtensions: extensions);
    if (f == null) return null;
    return PickedFile(f.name, await f.xFile.readAsBytes());
  }
}

/// A picture ready for the board: PNG or JPEG no wider or taller than [maxSide] pixels (big
/// photos are scaled down and saved as PNG), and its size. Null when it cannot be decoded.
Future<(Uint8List, Size)?> boardPicture(Uint8List bytes, {int maxSide = 1600}) async {
  try {
    final buffer = await ui.ImmutableBuffer.fromUint8List(bytes);
    final desc = await ui.ImageDescriptor.encoded(buffer);
    final w = desc.width, h = desc.height;
    final jpegOrPng = bytes.length > 4 && ((bytes[0] == 0xFF && bytes[1] == 0xD8) || (bytes[0] == 0x89 && bytes[1] == 0x50));
    if (math.max(w, h) <= maxSide && jpegOrPng) {
      desc.dispose();
      buffer.dispose();
      return (bytes, Size(w.toDouble(), h.toDouble()));
    }
    final scale = math.min(1.0, maxSide / math.max(w, h));
    final codec = await desc.instantiateCodec(targetWidth: math.max(1, (w * scale).round()), targetHeight: math.max(1, (h * scale).round()));
    final image = (await codec.getNextFrame()).image;
    try {
      final data = await image.toByteData(format: ui.ImageByteFormat.png);
      return (data!.buffer.asUint8List(), Size(image.width.toDouble(), image.height.toDouble()));
    } finally {
      image.dispose();
      codec.dispose();
      desc.dispose();
      buffer.dispose();
    }
  } catch (_) {
    return null;
  }
}

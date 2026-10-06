import 'package:image_picker/image_picker.dart';
import 'package:kinetix_ui/kinetix_ui.dart' show KxPhotoSource;
import 'dart:io';
import 'dart:typed_data';

import 'package:open_filex/open_filex.dart';
import 'package:path_provider/path_provider.dart';

/// Opens a downloaded file (a PDF from a homework submission) in another app on the phone.
/// Returns false when nothing could open it. Tests pass their own.
typedef OpenFile = Future<bool> Function(Uint8List bytes, String name, String mime);

/// Saves the file in the app's temporary folder and asks the system to open it.
Future<bool> openWithSystem(Uint8List bytes, String name, String mime) async {
  try {
    final dir = await getTemporaryDirectory();
    final safe = name.replaceAll(RegExp(r'[^\w.\- ]'), '_');
    final file = File('${dir.path}/${DateTime.now().millisecondsSinceEpoch}-$safe');
    await file.writeAsBytes(bytes, flush: true);
    // open_filex shares the file through its own FileProvider, which Android needs (a plain
    // file:// link is refused by other apps on Android 7 and later).
    final result = await OpenFilex.open(file.path, type: mime);
    return result.type == ResultType.done;
  } catch (_) {
    return false;
  }
}

/// A profile photo from the camera (front) or the gallery, at a size worth cropping; null if cancelled.
Future<Uint8List?> pickProfileImage(KxPhotoSource source) async {
  final x = await ImagePicker().pickImage(
    source: source == KxPhotoSource.camera ? ImageSource.camera : ImageSource.gallery,
    preferredCameraDevice: CameraDevice.front,
    maxWidth: 1600,
    maxHeight: 1600,
  );
  return x?.readAsBytes();
}

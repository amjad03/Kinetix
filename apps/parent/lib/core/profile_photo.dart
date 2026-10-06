import 'dart:typed_data';

import 'package:image_picker/image_picker.dart';
import 'package:kinetix_ui/kinetix_ui.dart' show KxPhotoSource;

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

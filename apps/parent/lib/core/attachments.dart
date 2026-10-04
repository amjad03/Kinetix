import 'package:file_picker/file_picker.dart';
import 'package:flutter/foundation.dart';
import 'package:image_picker/image_picker.dart';

import 'models.dart';

/// Where a file to hand in comes from.
enum AttachmentSource { camera, gallery, pdf }

/// Largest file the server takes (services/api homework/submissions.controller.ts).
const maxUploadBytes = 8 * 1024 * 1024;

/// Most files in one hand-in.
const maxUploadFiles = 5;

/// Picks photos (taken now or from the gallery) and PDFs to hand in. Tests use a fake.
abstract class AttachmentPicker {
  /// Up to [max] files; empty when the student cancels.
  Future<List<UploadFile>> pick(AttachmentSource source, {int max = maxUploadFiles});

  static AttachmentPicker instance = const DeviceAttachmentPicker();
}

/// The phone's camera, photo library and files. Photos are scaled to at most 2000 px on the long
/// side at JPEG quality 80, which keeps a page of handwriting legible at well under 2–3 MB.
class DeviceAttachmentPicker implements AttachmentPicker {
  const DeviceAttachmentPicker();

  static const _side = 2000.0, _quality = 80;

  @override
  Future<List<UploadFile>> pick(AttachmentSource source, {int max = maxUploadFiles}) async {
    final picker = ImagePicker();
    switch (source) {
      case AttachmentSource.camera:
        final x = await picker.pickImage(source: ImageSource.camera, maxWidth: _side, maxHeight: _side, imageQuality: _quality);
        return [?await _read(x)];
      case AttachmentSource.gallery:
        final xs = max <= 1
            ? [?await picker.pickImage(source: ImageSource.gallery, maxWidth: _side, maxHeight: _side, imageQuality: _quality)]
            : await picker.pickMultiImage(maxWidth: _side, maxHeight: _side, imageQuality: _quality, limit: max);
        return [for (final x in xs.take(max)) ?await _read(x)];
      case AttachmentSource.pdf:
        final f = await FilePicker.pickFile(type: FileType.custom, allowedExtensions: const ['pdf']);
        return [?await _read(f?.xFile)];
    }
  }

  static Future<UploadFile?> _read(XFile? x) async {
    if (x == null) return null;
    final mime = UploadFile.mimeFor(x.name, x.mimeType);
    if (mime == null) {
      debugPrint('Skipped ${x.name}: not a photo or PDF');
      return null;
    }
    return UploadFile(name: x.name, mime: mime, bytes: await x.readAsBytes());
  }
}

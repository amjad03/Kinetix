import 'dart:isolate';
import 'dart:typed_data';

import 'package:image/image.dart' as img;

/// A profile photo ready to upload: turned upright, cropped to the centre square, scaled to at
/// most [size] pixels and saved as a JPEG. Null if [bytes] is not an image.
Uint8List? kxSquareJpegSync(Uint8List bytes, {int size = 512, int quality = 82}) {
  img.Image? decoded;
  try {
    decoded = img.decodeImage(bytes);
  } catch (_) {
    // Not an image the decoder knows (or a broken one).
  }
  if (decoded == null) return null;
  final upright = img.bakeOrientation(decoded);
  final side = upright.width < upright.height ? upright.width : upright.height;
  final square = img.copyResizeCropSquare(upright, size: side < size ? side : size, interpolation: img.Interpolation.average);
  return img.encodeJpg(square, quality: quality);
}

/// [kxSquareJpegSync] off the UI thread.
Future<Uint8List?> kxSquareJpeg(Uint8List bytes, {int size = 512, int quality = 82}) =>
    Isolate.run(() => kxSquareJpegSync(bytes, size: size, quality: quality));

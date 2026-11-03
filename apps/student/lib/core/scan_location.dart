import 'package:geolocator/geolocator.dart';

import 'api.dart';

/// Reads where the phone is for a QR self-mark, behind an interface so widget tests need no plugin.
abstract class ScanLocator {
  /// One reading, or null when location is off, not allowed, or too slow (the scan still goes; the server holds it
  /// for the teacher when the institution checks the campus).
  Future<ScanLocation?> current();
}

/// geolocator: asks for permission when needed and waits at most eight seconds for a fix.
class GeolocatorScanLocator implements ScanLocator {
  const GeolocatorScanLocator();

  @override
  Future<ScanLocation?> current() async {
    try {
      if (!await Geolocator.isLocationServiceEnabled()) return null;
      var p = await Geolocator.checkPermission();
      if (p == LocationPermission.denied) p = await Geolocator.requestPermission();
      if (p == LocationPermission.denied || p == LocationPermission.deniedForever) return null;
      final pos = await Geolocator.getCurrentPosition(locationSettings: const LocationSettings(accuracy: LocationAccuracy.high, timeLimit: Duration(seconds: 8)));
      return ScanLocation(lat: pos.latitude, lng: pos.longitude, accuracyM: pos.accuracy, mocked: pos.isMocked);
    } catch (_) {
      return null;
    }
  }
}

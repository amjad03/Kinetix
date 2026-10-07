import 'package:geolocator/geolocator.dart';
import 'package:wakelock_plus/wakelock_plus.dart';

/// One GPS reading.
class GeoFix {
  const GeoFix({required this.lat, required this.lng, this.speedKmh});

  final double lat;
  final double lng;

  /// Null when the phone does not know its speed.
  final double? speedKmh;
}

enum LocationAccess { granted, denied, serviceOff }

/// The phone's GPS, behind an interface so tests need no plugin.
abstract class LocationSource {
  /// Asks for permission when needed.
  Future<LocationAccess> ensureAccess();

  /// Readings roughly once a second while listened to.
  Stream<GeoFix> fixes();
}

/// Keeps the screen on while a trip runs.
abstract class ScreenAwake {
  Future<void> enable();
  Future<void> disable();
}

/// geolocator.
class GeolocatorLocationSource implements LocationSource {
  const GeolocatorLocationSource();

  @override
  Future<LocationAccess> ensureAccess() async {
    if (!await Geolocator.isLocationServiceEnabled()) return LocationAccess.serviceOff;
    var p = await Geolocator.checkPermission();
    if (p == LocationPermission.denied) p = await Geolocator.requestPermission();
    return p == LocationPermission.denied || p == LocationPermission.deniedForever ? LocationAccess.denied : LocationAccess.granted;
  }

  @override
  Stream<GeoFix> fixes() => Geolocator.getPositionStream(locationSettings: const LocationSettings(accuracy: LocationAccuracy.high)).map(
        // Position.speed is m/s and negative when unknown.
        (p) => GeoFix(lat: p.latitude, lng: p.longitude, speedKmh: p.speed >= 0 ? p.speed * 3.6 : null),
      );
}

/// wakelock_plus.
class WakelockScreenAwake implements ScreenAwake {
  const WakelockScreenAwake();

  @override
  Future<void> enable() => WakelockPlus.enable();

  @override
  Future<void> disable() => WakelockPlus.disable();
}

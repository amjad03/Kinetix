import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/foundation.dart';

import '../../core/api.dart';
import '../../core/models.dart';
import 'location.dart';

/// Lets a position through at most once per [every] (the first one always goes).
class PingThrottle {
  PingThrottle({this.every = const Duration(seconds: 5)});

  final Duration every;
  DateTime? _last;

  bool shouldSend(DateTime now) {
    final last = _last;
    if (last != null && now.difference(last) < every) return false;
    _last = now;
    return true;
  }

  void reset() => _last = null;
}

/// Metres between two points (haversine).
double metresBetween(double lat1, double lng1, double lat2, double lng2) {
  const r = 6371000.0;
  double rad(double d) => d * math.pi / 180;
  final a =
      math.pow(math.sin(rad(lat2 - lat1) / 2), 2) + math.cos(rad(lat1)) * math.cos(rad(lat2)) * math.pow(math.sin(rad(lng2 - lng1) / 2), 2);
  return 2 * r * math.asin(math.min(1, math.sqrt(a)));
}

enum TripPhase { idle, starting, running, ended }

/// A driver's trip: starts it, streams the GPS to the server every ~5 s while the screen is
/// open (transient errors are noted and tracking carries on), and ends it.
class TripController extends ChangeNotifier {
  TripController(
      {required this.api,
      required this.location,
      required this.awake,
      DateTime Function()? now,
      Duration every = const Duration(seconds: 5)})
      : _now = now ?? DateTime.now,
        throttle = PingThrottle(every: every);

  /// Within this distance a stop counts as reached (the server uses the same).
  static const reachedMetres = 120.0;

  final TeacherApi api;
  final LocationSource location;
  final ScreenAwake awake;
  final PingThrottle throttle;
  final DateTime Function() _now;

  TripPhase phase = TripPhase.idle;
  DriverTrip? trip;
  DriverRoute? route;
  TripDirection direction = TripDirection.pickup;

  /// Why starting failed, or null.
  ApiException? error;
  bool locationDenied = false;
  bool locationServiceOff = false;

  /// When the last position reached the server, and whether the latest send failed.
  DateTime? lastSentAt;
  bool sendFailing = false;
  GeoFix? lastFix;
  int sent = 0;
  int _reached = 0;
  StreamSubscription<GeoFix>? _sub;
  bool _sending = false;

  bool get running => phase == TripPhase.running;

  /// Stops still ahead on this run, nearest first.
  List<DriverStop> get nextStops {
    final r = route;
    if (r == null) return const [];
    final all = r.ordered(direction);
    return all.sublist(math.min(_reached, all.length));
  }

  /// Starts a new trip on [r].
  Future<void> start(DriverRoute r, TripDirection d) async {
    if (phase == TripPhase.starting || running) return;
    phase = TripPhase.starting;
    error = null;
    notifyListeners();
    try {
      final access = await location.ensureAccess();
      locationDenied = access == LocationAccess.denied;
      locationServiceOff = access == LocationAccess.serviceOff;
      if (access != LocationAccess.granted) {
        phase = TripPhase.idle;
        return;
      }
      final t = await api.startTrip(routeId: r.id, direction: d);
      await _track(t, r);
    } on ApiException catch (e) {
      error = e;
      phase = TripPhase.idle;
    } finally {
      notifyListeners();
    }
  }

  /// Carries on a trip the server says is already running (the app was reopened).
  Future<void> resume(DriverTrip t, DriverRoute r) async {
    if (running) return;
    final access = await location.ensureAccess();
    locationDenied = access == LocationAccess.denied;
    locationServiceOff = access == LocationAccess.serviceOff;
    if (access == LocationAccess.granted) await _track(t, r);
    notifyListeners();
  }

  Future<void> _track(DriverTrip t, DriverRoute r) async {
    trip = t;
    route = r;
    direction = t.direction;
    _reached = 0;
    sent = 0;
    sendFailing = false;
    throttle.reset();
    phase = TripPhase.running;
    unawaited(awake.enable().catchError((_) {}));
    await _sub?.cancel();
    _sub = location.fixes().listen(onFix, onError: (_) {});
  }

  /// A GPS reading: remembered, stops reached are ticked off, and sent when the throttle allows.
  Future<void> onFix(GeoFix fix) async {
    final t = trip;
    if (!running || t == null) return;
    lastFix = fix;
    final all = route!.ordered(direction);
    while (_reached < all.length && metresBetween(fix.lat, fix.lng, all[_reached].lat, all[_reached].lng) <= reachedMetres) {
      _reached++;
    }
    notifyListeners();
    if (_sending || !throttle.shouldSend(_now())) return;
    _sending = true;
    try {
      await api.sendPosition(t.id, lat: fix.lat, lng: fix.lng, speedKmh: fix.speedKmh);
      lastSentAt = _now();
      sendFailing = false;
      sent++;
    } on ApiException catch (e) {
      if (e.status == 409 || e.status == 404) {
        // The trip was ended elsewhere (or is gone): stop tracking.
        await _stop(TripPhase.ended);
      } else {
        // Offline or a server hiccup: the next reading tries again.
        sendFailing = true;
      }
    } finally {
      _sending = false;
      notifyListeners();
    }
  }

  /// Ends the trip.
  Future<void> end() async {
    final t = trip;
    if (t == null || !running) return;
    try {
      await api.endTrip(t.id);
    } on ApiException catch (e) {
      error = e;
      notifyListeners();
      return;
    }
    await _stop(TripPhase.ended);
    notifyListeners();
  }

  Future<void> _stop(TripPhase next) async {
    phase = next;
    await _sub?.cancel();
    _sub = null;
    unawaited(awake.disable().catchError((_) {}));
  }

  @override
  void dispose() {
    _sub?.cancel();
    if (running) unawaited(awake.disable().catchError((_) {}));
    super.dispose();
  }
}

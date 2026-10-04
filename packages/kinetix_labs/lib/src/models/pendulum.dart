import 'dart:math' as math;

/// Places with different g, for comparing periods.
enum Gravity {
  earth('Earth', 9.8),
  moon('Moon', 1.62),
  mars('Mars', 3.71),
  jupiter('Jupiter', 24.79);

  const Gravity(this.title, this.g);
  final String title;

  /// m/s²
  final double g;
}

/// T = 2π√(L/g), valid for small swings.
double smallAnglePeriod(double length, double g) => 2 * math.pi * math.sqrt(length / g);

/// The exact period for amplitude [amplitudeRad], T = T₀ / AGM(1, cos(θ₀/2)).
double exactPeriod(double length, double g, double amplitudeRad) {
  var a = 1.0, b = math.cos(amplitudeRad / 2);
  for (var i = 0; i < 30 && (a - b).abs() > 1e-15; i++) {
    final an = (a + b) / 2;
    b = math.sqrt(a * b);
    a = an;
  }
  return smallAnglePeriod(length, g) / a;
}

/// A simple pendulum integrated with RK4 (the full sin θ equation, not the small-angle
/// approximation), plus a stopwatch that times a number of oscillations as in the practical:
/// start at the mean position, count each return moving the same way.
class PendulumSim {
  PendulumSim({required this.length, required this.g, required double amplitudeDeg}) {
    reset(amplitudeDeg);
  }

  double length, g;
  double theta = 0, omega = 0, time = 0;

  // Stopwatch
  bool _armed = false, _running = false;
  double _startTime = 0;
  int oscillations = 0;
  int target = 10;
  double? measuredTotal;
  double _lastCross = double.nan;

  /// Time between the two most recent right-moving passes through the mean position.
  double? lastPeriod;

  bool get timing => _armed || _running;
  bool get stopwatchRunning => _running;
  double get stopwatchTime => _running ? time - _startTime : (measuredTotal ?? 0);

  /// Period measured by the stopwatch, total time ÷ oscillations.
  double? get measuredPeriod => measuredTotal == null ? null : measuredTotal! / target;

  void reset(double amplitudeDeg) {
    theta = amplitudeDeg * math.pi / 180;
    omega = 0;
    time = 0;
    _lastCross = double.nan;
    lastPeriod = null;
    resetStopwatch();
  }

  void resetStopwatch() {
    _armed = false;
    _running = false;
    oscillations = 0;
    measuredTotal = null;
  }

  /// Arms the stopwatch: it starts at the next pass through the mean position.
  void startStopwatch({int oscillations = 10}) {
    resetStopwatch();
    target = oscillations;
    _armed = true;
  }

  double _acc(double th) => -g / length * math.sin(th);

  void step(double dt) {
    // Sub-steps keep RK4 accurate for short pendulums at low frame rates.
    final n = math.max(1, (dt / 0.002).ceil());
    final h = dt / n;
    for (var i = 0; i < n; i++) {
      final th0 = theta, om0 = omega;
      final k1t = om0, k1o = _acc(th0);
      final k2t = om0 + k1o * h / 2, k2o = _acc(th0 + k1t * h / 2);
      final k3t = om0 + k2o * h / 2, k3o = _acc(th0 + k2t * h / 2);
      final k4t = om0 + k3o * h, k4o = _acc(th0 + k3t * h);
      theta = th0 + h / 6 * (k1t + 2 * k2t + 2 * k3t + k4t);
      omega = om0 + h / 6 * (k1o + 2 * k2o + 2 * k3o + k4o);
      final t0 = time;
      time += h;
      // Right-moving crossing of the mean position (θ goes from − to +).
      if (th0 < 0 && theta >= 0) {
        final frac = th0 / (th0 - theta);
        final tc = t0 + frac * h;
        _onCross(tc);
      }
    }
  }

  void _onCross(double tc) {
    if (!_lastCross.isNaN) lastPeriod = tc - _lastCross;
    _lastCross = tc;
    if (_armed) {
      _armed = false;
      _running = true;
      _startTime = tc;
      oscillations = 0;
    } else if (_running) {
      oscillations++;
      if (oscillations >= target) {
        _running = false;
        measuredTotal = tc - _startTime;
      }
    }
  }
}

import 'package:flutter/material.dart';

/// Eye protection for long days in front of a bright board.
///
/// - **Warmth** cuts blue light (a colour matrix over the whole app).
/// - **Dimming** lowers brightness without touching the projector.
/// - **Auto** follows the school day: neutral in the morning, warmer and dimmer as the day
///   goes on, when eyes are tired and afternoon light makes glare worse.
/// - **High contrast** helps on washed-out projectors.
class EyeComfortSettings {
  const EyeComfortSettings({this.enabled = false, this.auto = true, this.warmth = 0.3, this.dim = 0.1, this.highContrast = false, this.breakReminder = false});

  final bool enabled;
  final bool auto;

  /// 0 = neutral, 1 = strongest blue-light cut.
  final double warmth;

  /// 0 = full brightness, 1 = 60% darker (capped so the board stays readable).
  final double dim;
  final bool highContrast;

  /// 20-20-20 break reminders after long continuous use.
  final bool breakReminder;

  EyeComfortSettings copyWith({bool? enabled, bool? auto, double? warmth, double? dim, bool? highContrast, bool? breakReminder}) => EyeComfortSettings(
    enabled: enabled ?? this.enabled,
    auto: auto ?? this.auto,
    warmth: warmth ?? this.warmth,
    dim: dim ?? this.dim,
    highContrast: highContrast ?? this.highContrast,
    breakReminder: breakReminder ?? this.breakReminder,
  );

  String encode() => [enabled, auto, warmth, dim, highContrast, breakReminder].join(',');

  static EyeComfortSettings decode(String? s) {
    final p = s?.split(',');
    // Five values before break reminders were added.
    if (p == null || p.length < 5 || p.length > 6) return const EyeComfortSettings();
    return EyeComfortSettings(
      enabled: p[0] == 'true',
      auto: p[1] == 'true',
      warmth: double.tryParse(p[2]) ?? 0.3,
      dim: double.tryParse(p[3]) ?? 0.1,
      highContrast: p[4] == 'true',
      breakReminder: p.length > 5 && p[5] == 'true',
    );
  }

  /// The warmth and dim levels in effect at [time].
  ({double warmth, double dim}) levelsAt(DateTime time) {
    if (!enabled) return (warmth: 0, dim: 0);
    if (!auto) return (warmth: warmth, dim: dim);
    final hour = time.hour + time.minute / 60;
    // Ramp from neutral at 10:00 to the strongest setting at 16:00.
    final t = ((hour - 10) / 6).clamp(0.0, 1.0);
    return (warmth: 0.15 + 0.45 * t, dim: 0.05 + 0.15 * t);
  }
}

/// The colour matrix for a given warmth, dim and contrast. Exposed for tests.
List<double> comfortMatrix({required double warmth, required double dim, required bool highContrast}) {
  final brightness = 1 - 0.6 * dim.clamp(0.0, 1.0);
  final w = warmth.clamp(0.0, 1.0);
  // Keep red, trim green slightly and blue strongly: a warm, low-blue tint.
  var r = brightness, g = brightness * (1 - 0.12 * w), b = brightness * (1 - 0.45 * w);
  var offset = 0.0;
  if (highContrast) {
    const c = 1.35;
    r *= c;
    g *= c;
    b *= c;
    offset = -(c - 1) * 128 * brightness;
  }
  return [
    r, 0, 0, 0, offset, //
    0, g, 0, 0, offset,
    0, 0, b, 0, offset,
    0, 0, 0, 1, 0,
  ];
}

class EyeComfortFilter extends StatelessWidget {
  const EyeComfortFilter({super.key, required this.settings, required this.child, this.now});

  final EyeComfortSettings settings;
  final Widget child;
  final DateTime Function()? now;

  @override
  Widget build(BuildContext context) {
    final levels = settings.levelsAt((now ?? DateTime.now)());
    if (!settings.enabled && !settings.highContrast) return child;
    return ColorFiltered(
      colorFilter: ColorFilter.matrix(comfortMatrix(warmth: levels.warmth, dim: levels.dim, highContrast: settings.highContrast)),
      child: child,
    );
  }
}

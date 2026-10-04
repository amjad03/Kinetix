import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/features/comfort/eye_comfort.dart';

void main() {
  test('off means no change', () {
    const s = EyeComfortSettings(enabled: false);
    expect(s.levelsAt(DateTime(2026, 10, 5, 15)), (warmth: 0.0, dim: 0.0));
  });

  test('auto mode is gentle in the morning and warmer in the afternoon', () {
    const s = EyeComfortSettings(enabled: true, auto: true);
    final morning = s.levelsAt(DateTime(2026, 10, 5, 9));
    final afternoon = s.levelsAt(DateTime(2026, 10, 5, 15, 30));
    expect(morning.warmth, lessThan(afternoon.warmth));
    expect(morning.dim, lessThan(afternoon.dim));
    expect(afternoon.warmth, lessThanOrEqualTo(0.6));
  });

  test('manual mode uses the chosen levels', () {
    const s = EyeComfortSettings(enabled: true, auto: false, warmth: 0.8, dim: 0.2);
    expect(s.levelsAt(DateTime(2026, 10, 5, 9)), (warmth: 0.8, dim: 0.2));
  });

  test('the matrix cuts blue more than green and never touches red balance', () {
    final m = comfortMatrix(warmth: 1, dim: 0, highContrast: false);
    final r = m[0], g = m[6], b = m[12];
    expect(r, 1.0);
    expect(g, lessThan(r));
    expect(b, lessThan(g));
  });

  test('dimming is capped so the board stays readable', () {
    final m = comfortMatrix(warmth: 0, dim: 1, highContrast: false);
    expect(m[0], closeTo(0.4, 1e-9));
  });

  test('high contrast stretches around the midpoint', () {
    final m = comfortMatrix(warmth: 0, dim: 0, highContrast: true);
    // A mid-grey input of 128 maps back to ~128; darks get darker, lights lighter.
    expect(128 * m[0] + m[4], closeTo(128, 1e-6));
    expect(m[0], greaterThan(1));
  });
}

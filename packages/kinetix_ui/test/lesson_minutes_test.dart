import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

int _sum(List<int> xs) => xs.fold(0, (s, x) => s + x);

void main() {
  test('step minutes always add up to the chosen length (the API rule)', () {
    expect(kxFitMinutes([10, 25, 10], 30), [7, 16, 7]);
    expect(kxFitMinutes([1, 40, 1, 1], 30), [2, 24, 2, 2]);
    expect(kxFitMinutes([5, 5, 5], 10), [4, 3, 3]);
    for (final total in [10, 20, 30, 35, 40, 45, 55, 60, 90]) {
      for (final steps in [
        [10, 25, 10],
        [5, 20, 20, 10],
        [3, 3, 3, 3, 3],
        [1, 1],
      ]) {
        final out = kxFitMinutes(steps, total);
        expect(_sum(out), total, reason: '$steps → $total');
        expect(out.reduce((a, b) => a < b ? a : b), greaterThanOrEqualTo(2));
      }
    }
    expect(kxFitMinutes([], 30), isEmpty);
  });
}

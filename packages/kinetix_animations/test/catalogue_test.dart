import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_animations/kinetix_animations.dart';

final _devanagari = RegExp('[ऀ-ॿ]');
final _kannada = RegExp('[ಀ-೿]');

/// The catalogue's integrity: every animation is complete in English, Hindi and Kannada, and its
/// steps run in order from the start.
void main() {
  test('ids are unique and the catalogue is full', () {
    final ids = [for (final a in animationCatalogue) a.id];
    expect(ids.toSet().length, ids.length);
    expect(ids, contains('photosynthesis'));
    expect(animationCatalogue.length, greaterThanOrEqualTo(25));
    expect(animationById('photosynthesis'), same(animationCatalogue.first));
  });

  for (final a in animationCatalogue) {
    test('${a.id}: three languages, steps in order', () {
      void tr3(Tr t, String what) {
        expect(t.en.trim(), isNotEmpty, reason: '${a.id} $what en');
        expect(t.hi, matches(_devanagari), reason: '${a.id} $what hi');
        expect(t.kn, matches(_kannada), reason: '${a.id} $what kn');
        for (final s in t.all) {
          expect(s.contains('�'), isFalse, reason: '${a.id} $what');
        }
      }

      tr3(a.title, 'title');
      expect(a.steps, isNotEmpty);
      expect(a.steps.first.at, 0);
      for (var i = 0; i < a.steps.length; i++) {
        final s = a.steps[i];
        tr3(s.name, 'step ${i + 1} name');
        tr3(s.caption, 'step ${i + 1} caption');
        expect(s.at, inInclusiveRange(0, 0.95));
        if (i > 0) expect(s.at, greaterThan(a.steps[i - 1].at), reason: '${a.id} step order');
        expect(a.stepAt(s.at + 0.001), i);
      }
      expect(['Biology', 'Earth Science', 'Physics', 'Chemistry', 'Economics', 'Computer Science'], contains(a.subject));
      expect(a.topic, isNotEmpty);
      expect(a.levels, isNotEmpty);
      for (final l in a.levels) {
        expect(l, matches(RegExp(r'^Class \d+$')));
      }
      expect(a.keywords, isNotEmpty);
      expect(a.seconds, greaterThan(4));
      expect(a.matchesQuery(a.title.en), isTrue);
      expect(a.matchesSubject(a.subject), isTrue);
    });
  }
}

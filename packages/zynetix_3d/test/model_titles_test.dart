import 'package:flutter_test/flutter_test.dart';
import 'package:zynetix_3d/zynetix_3d.dart';

/// Every 3D model a teacher can pick is named in English, Hindi and Kannada.
void main() {
  final devanagari = RegExp(r'[ऀ-ॿ]'), kannada = RegExp(r'[ಀ-೿]');

  test('every listed model, the solids among them, has its name in Hindi and Kannada', () {
    for (final e in ModelCatalogue.entries) {
      expect(e.titles?.complete, isTrue, reason: '${e.id} (${e.title})');
      expect(e.titleIn('hi'), matches(devanagari), reason: e.id);
      expect(e.titleIn('kn'), matches(kannada), reason: e.id);
      expect(e.titleIn('en'), e.title, reason: e.id);
    }
    expect(ModelCatalogue.byId('solid.frustum')!.titleIn('kn'), 'ಶಂಕುವಿನ ಛಿನ್ನಕ');
  });

  test('every downloadable model has its name in Hindi and Kannada', () {
    for (final m in RemoteModels.all) {
      expect(m.title.complete, isTrue, reason: m.id);
      expect(m.title.of('hi'), matches(devanagari), reason: m.id);
      expect(m.title.of('kn'), matches(kannada), reason: m.id);
    }
  });
}

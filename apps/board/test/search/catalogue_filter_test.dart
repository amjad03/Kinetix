import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_3d/kinetix_3d.dart';
import 'package:kinetix_board/features/search/catalogue_facets.dart';
import 'package:kinetix_labs/kinetix_labs.dart';

/// The Subject → Topic → Class dropdowns over the 3D models and the virtual labs.
void main() {
  test('every listed model and lab is in the browsers, with a subject and titles in three languages', () {
    expect(modelItems.length, ModelCatalogue.entries.length);
    expect(labItems.length, LabCatalogue.entries.length);
    for (final i in [...modelItems, ...labItems]) {
      expect(catalogueSubjects, contains(i.subject), reason: i.id);
      expect(i.titles.keys, containsAll(['en', 'hi', 'kn']), reason: i.id);
      expect(i.levels, sortLevels(i.levels), reason: i.id);
    }
    // Most land in a named topic, not "Other".
    final other = [...modelItems, ...labItems].where((i) => i.category == 'other').length;
    expect(other, lessThan((modelItems.length + labItems.length) ~/ 10));
  });

  test('topics come from titles first, then keywords', () {
    CatalogueItem model(String id) => modelItems.firstWhere((i) => i.id == id);
    CatalogueItem lab(String id) => labItems.firstWhere((i) => i.id == id);
    expect(model('heart').category, 'humanBody');
    expect(model('solid.cube'), isA<CatalogueItem>().having((i) => i.subject, 'subject', 'maths').having((i) => i.category, 'category', 'geometry'));
    expect(model('electric_motor').category, 'magnetism');
    expect(lab('ohms-law').category, 'electricity');
    expect(lab('glass-slab').category, 'optics');
    expect(categoryFor('chemistry', 'Rate of reaction with an acid'), 'reactions');
    expect(categoryFor('physics', 'Something new'), 'other');
  });

  test('Physics → Light and optics → Class 10', () {
    final labs = filterCatalogue(labItems, subject: 'physics', category: 'optics', level: '10');
    expect(labs, isNotEmpty);
    for (final i in labs) {
      expect((i.subject, i.category, i.levels.contains('10')), ('physics', 'optics', true), reason: i.id);
    }
    expect(labs.map((i) => i.id), contains('glass-slab'));
    // The dropdowns offer only what has something in it.
    expect(subjectsIn(labItems), containsAll(['physics', 'chemistry', 'biology', 'maths', 'electronics', 'forensics']));
    expect(subjectsIn(modelItems), containsAll(['biology', 'physics', 'chemistry', 'maths', 'geography', 'space']));
    expect(categoriesIn(labItems, 'physics'), containsAll(['optics', 'electricity', 'mechanics']));
    expect(categoriesIn(labItems, 'physics'), isNot(contains('humanBody')));
    final classes = levelsIn(labItems, subject: 'physics', category: 'optics');
    expect(classes, contains('10'));
    expect(classes, sortLevels(classes));
  });

  test('search inside the filters, typos forgiven, any language', () {
    expect(filterCatalogue(modelItems, subject: 'biology', query: 'hart').first.id, 'heart');
    expect(filterCatalogue(modelItems, subject: 'physics', query: 'heart'), isEmpty);
    expect(filterCatalogue(modelItems, query: 'घन').first.id, 'solid.cube');
    expect(filterCatalogue(labItems, query: 'ಓಮ್').first.id, 'ohms-law');
    // A topic's name finds what is in it.
    expect(filterCatalogue(labItems, query: 'optics').every((i) => i.category == 'optics' || i.keywords.join(' ').contains('optic')), isTrue);
  });

  test('levels sort from kindergarten to postgraduate', () {
    expect(sortLevels(['pg', '10', 'ug', '9', 'lkg', '12']), ['lkg', '9', '10', '12', 'ug', 'pg']);
  });
}

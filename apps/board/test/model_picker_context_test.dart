import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/features/board/context/class_context.dart';
import 'package:kinetix_board/features/board/kit/subjects.dart';
import 'package:kinetix_board/features/search/catalogue_facets.dart';

List<String> ids({String? subject, String? level, String? category}) =>
    [for (final i in filterCatalogue(modelItems, subject: subject, category: category, level: level, query: '')) i.id];

void main() {
  test('the class decides where the 3D picker opens', () {
    expect(modelSubjectKey(Subject.physics), 'physics');
    expect(modelSubjectKey(Subject.history), 'history');
    expect(modelSubjectKey(Subject.science), isNull);
    expect(modelLevelKey(9), '9');
    expect(modelLevelKey(null), isNull);
  });

  test('the new models are found by subject and class', () {
    expect(ids(subject: 'physics', level: '10'), containsAll(['proc.optics-convex', 'proc.optics-concave']));
    expect(ids(subject: 'engineering'), containsAll(['proc.gears', 'proc.engine']));
    expect(ids(subject: 'history', level: '7'), containsAll(['proc.taj-mahal', 'proc.qutub-minar', 'proc.konark']));
    expect(ids(subject: 'history', level: '7'), isNot(contains('proc.india-gate')));
    expect(ids(subject: 'geography', category: 'landforms'), containsAll(['proc.globe', 'proc.landforms']));
    expect(ids(subject: 'biology', category: 'humanBody'), containsAll(['proc.teeth', 'proc.skull']));
    expect(ids(subject: 'chemistry'), contains('proc.lab-apparatus'));
  });

  test('downloadable models appear in the same picker', () {
    expect(ids(subject: 'physics'), contains('dl.hubble_telescope'));
  });

  test('the profiles carry the new model topics', () {
    expect(toolProfileFor(Subject.physics, GradeBand.secondary).models, containsAll(['machine', 'optics']));
    expect(toolProfileFor(Subject.chemistry, GradeBand.secondary).models, contains('lab'));
    expect(toolProfileFor(Subject.history, GradeBand.middle).models, contains('monument'));
    expect(toolProfileFor(Subject.geography, GradeBand.middle).models, contains('landform'));
  });
}

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
    expect(ids(subject: 'physics', level: '10'), contains('lens_bench'));
    expect(ids(subject: 'engineering'), containsAll(['gears', 'engine']));
    expect(ids(subject: 'history', level: '7'), containsAll(['taj_mahal', 'qutub_minar', 'konark']));
    expect(ids(subject: 'history', level: '7'), isNot(contains('india_gate')));
    expect(ids(subject: 'geography', category: 'landforms'), containsAll(['globe', 'landforms']));
    expect(ids(subject: 'biology', category: 'humanBody'), containsAll(['teeth', 'skull']));
    expect(ids(subject: 'chemistry'), contains('lab_apparatus'));
  });

  test('downloadable models appear in the same picker', () {
    expect(ids(subject: 'physics'), containsAll(['dl.hubble_telescope', 'dl.saturn_v']));
    expect(ids(subject: 'biology', category: 'humanBody'), containsAll(['ear', 'kidney', 'dl.liver', 'dl.stomach', 'dl.tooth', 'dl.skin']));
    expect(ids(subject: 'biology'), containsAll(['dl.bacteria', 'dl.mitochondrion']));
  });

  test('the profiles carry the new model topics', () {
    expect(toolProfileFor(Subject.physics, GradeBand.secondary).models, containsAll(['machine', 'optics']));
    expect(toolProfileFor(Subject.chemistry, GradeBand.secondary).models, contains('lab'));
    expect(toolProfileFor(Subject.history, GradeBand.middle).models, contains('monument'));
    expect(toolProfileFor(Subject.geography, GradeBand.middle).models, contains('landform'));
  });
}

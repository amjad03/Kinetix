import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_3d/kinetix_3d.dart' show ModelCatalogue;
import 'package:kinetix_board/core/models.dart';
import 'package:kinetix_board/features/board/context/class_context.dart';
import 'package:kinetix_board/features/board/context/context_switcher.dart';
import 'package:kinetix_board/features/board/kit/subjects.dart';
import 'package:kinetix_board/features/curriculum/curriculum_labels.dart';
import 'package:kinetix_board/features/curriculum/curriculum_registry.dart';
import 'package:kinetix_board/features/sims/sims.dart';
import 'package:kinetix_board/l10n/l10n.dart';
import 'package:kinetix_labs/kinetix_labs.dart' show LabCatalogue;

/// The class and subject registry (lib/features/curriculum/curriculum_registry.dart).
void main() {
  final en = lookupAppLocalizations(const Locale('en'));

  test('covers Class 1 to 12, MBA, the B.E. branches and the M.Tech programmes; every level has subjects', () {
    final ids = CurriculumRegistry.levels.map((l) => l.id).toList();
    expect(ids, containsAll([for (var g = 1; g <= 12; g++) 'class-$g']));
    expect(ids, containsAll(['mba', 'be-civil', 'be-mech', 'be-eee', 'be-ece', 'be-cse', 'be-aiml', 'be-chem', 'mtech-structural', 'mtech-power', 'mtech-ev']));
    expect(ids.toSet(), hasLength(ids.length), reason: 'level ids are unique');
    for (final l in CurriculumRegistry.levels) {
      expect(l.subjects, isNotEmpty, reason: l.id);
      final subjectIds = l.subjects.map((s) => s.id).toList();
      expect(subjectIds.toSet(), hasLength(subjectIds.length), reason: '${l.id}: subject ids are unique');
      if (l.stage == CurriculumStage.school) {
        expect(l.grade, isNotNull, reason: l.id);
      } else {
        expect(l.name, isNotNull, reason: l.id);
        for (final s in l.subjects) {
          expect(s.semester, isNotNull, reason: '${l.id}/${s.id} has a semester');
        }
      }
      for (final s in l.subjects) {
        expect(s.features, isNotEmpty, reason: '${l.id}/${s.id}');
        expect(CurriculumRegistry.choice('${l.id}/${s.id}')?.id, '${l.id}/${s.id}');
      }
    }
    // The usual subjects.
    Set<String> subjects(String id) => CurriculumRegistry.level(id)!.subjects.map((s) => s.id).toSet();
    expect(subjects('class-3'), {'english', 'hindi', 'kannada', 'maths', 'evs'});
    expect(subjects('class-7'), containsAll(['maths', 'science', 'social-science', 'computer', 'english', 'hindi', 'kannada']));
    expect(subjects('class-12'), containsAll(['physics', 'chemistry', 'maths', 'biology', 'computer-science', 'accountancy', 'business-studies', 'economics']));
  });

  test('every feature id resolves to a real lab, model, sim, kit or to an upcoming kit', () {
    final phet = {
      for (final s in (jsonDecode(File('assets/phet/catalogue.json').readAsStringSync()) as Map)['sims'] as List) (s as Map)['id'] as String,
    };
    final used = <String>{};
    for (final l in CurriculumRegistry.levels) {
      for (final s in l.subjects) {
        final where = '${l.id}/${s.id}';
        for (final f in CurriculumChoice(l, s).features) {
          switch (f.kind) {
            case FeatureKind.tool:
              expect(f.id, startsWith('tool:'), reason: where);
            case FeatureKind.kit:
              expect(f.kitTab, isNotNull, reason: '$where ${f.id}');
            case FeatureKind.lab:
              expect(LabCatalogue.byId(f.ref), isNotNull, reason: '$where ${f.id}');
            case FeatureKind.model:
              expect(ModelCatalogue.byId(f.ref), isNotNull, reason: '$where ${f.id}');
            case FeatureKind.phet:
              expect(phet, contains(f.ref), reason: '$where ${f.id}');
            case FeatureKind.sim:
              expect(SimKind.values.asNameMap()[f.ref], isNotNull, reason: '$where ${f.id}');
            case FeatureKind.upcoming:
              expect(f.id, startsWith('soon:'), reason: '$where: ${f.id} has no known kind');
              expect(CurriculumRegistry.upcoming, contains(f.ref), reason: '$where ${f.id}');
              used.add(f.ref);
          }
        }
      }
    }
    // Every upcoming kit is used and named (the board's tool ids are checked on the real board in
    // test/curriculum_picker_test.dart).
    expect(used, CurriculumRegistry.upcoming.keys.toSet());
    for (final id in CurriculumRegistry.upcoming.keys) {
      expect(upcomingTitle(en, id), isNot(id), reason: id);
    }
  });

  test('programme accents read on white (accentFor lightens them on the dark theme)', () {
    double contrast(Color a, Color b) {
      final x = a.computeLuminance(), y = b.computeLuminance();
      return (x > y ? x + 0.05 : y + 0.05) / (x > y ? y + 0.05 : x + 0.05);
    }

    for (final l in CurriculumRegistry.levels.where((l) => l.accent != null)) {
      expect(contrast(l.accent!, Colors.white), greaterThanOrEqualTo(4.5), reason: l.id);
    }
  });

  test('labels: "Class 7 · Science" and "B.E. Civil · Sem 5 · Structural Analysis"', () {
    expect(curriculumLabel(en, CurriculumRegistry.choice('class-7/science')!), 'Class 7 · Science');
    expect(curriculumLabel(en, CurriculumRegistry.choice('be-civil/structural-analysis')!), 'B.E. Civil · Sem 5 · Structural Analysis');
    final hi = lookupAppLocalizations(const Locale('hi'));
    expect(curriculumLabel(hi, CurriculumRegistry.choice('class-7/science')!), 'कक्षा 7 · ${hi.subjectScience}');
  });

  SessionContext session(String section, String subject, {int? term, String? level}) => SessionContext(
    sessionId: 's',
    expiresAt: DateTime(2030),
    teacherId: 't',
    teacherName: 'T',
    language: 'en',
    sectionName: section,
    subjectName: subject,
    classTerm: term,
    programLevel: level,
  );

  test('the timetabled class preselects its level and subject', () {
    expect(CurriculumRegistry.match(session('Class 7 A', 'Mathematics', term: 7, level: 'k12'))?.id, 'class-7/maths');
    expect(CurriculumRegistry.match(session('Class 8 B', 'Social Science'))?.id, 'class-8/social-science');
    expect(CurriculumRegistry.match(session('II PUC Science A', 'Physics', level: 'pu'))?.id, 'class-12/physics');
    expect(CurriculumRegistry.match(session('B.E. Civil Sem 5 A', 'Structural Analysis', term: 5, level: 'ug'))?.id, 'be-civil/structural-analysis');
    expect(CurriculumRegistry.match(session('MBA Sem 2', 'Financial Management', level: 'pg'))?.id, 'mba/financial-management');
    // Programmes the registry does not have stay with the timetable alone.
    expect(CurriculumRegistry.match(session('BCom Sem 3 A', 'Corporate Accounting')), isNull);
    expect(CurriculumRegistry.match(session('UKG A', 'English and Numbers', term: 0, level: 'k12')), isNull);
  });

  test('a pick reshapes the context: subject, band, paper, accent, tools and kit tabs', () {
    final pick = ContextOverride()..setCurriculum('be-civil/structural-analysis');
    final c = resolveClassContext(null, pick);
    expect((c.subject, c.band, c.source), (Subject.physics, GradeBand.college, ContextSource.teacher));
    final cur = c.curriculum!;
    expect(cur.style.accent, CurriculumRegistry.level('be-civil')!.accent);
    expect(cur.style.paper.name, 'graph');
    expect(cur.toolbar, ['beam-solver', 'truss-solver']);
    expect(c.profile.tools, containsAll(['beam-solver', 'truss-solver', 'equation', 'spreadsheet', 'calculator', 'subject-kits']));

    pick.setCurriculum('class-12/business-studies');
    final b = resolveClassContext(null, pick);
    expect((b.subject, b.grade, b.band), (Subject.management, 12, GradeBand.seniorSecondary));
    expect(b.curriculum!.style.tabs, contains(KitTab.management));

    // An unknown id (an older board's) is ignored.
    pick.setCurriculum('class-99/x');
    expect(pick.curriculum, 'class-12/business-studies');
    pick.set(subject: Subject.history);
    expect(resolveClassContext(null, pick).curriculum, isNull);
  });
}

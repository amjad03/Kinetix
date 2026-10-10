import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../../core/models.dart';
import '../../../l10n/feature_strings.dart';
import '../../../l10n/l10n.dart';
import '../kit/subjects.dart';
import 'class_context.dart';

FeatureStrings contextStrings(BuildContext context) => FeatureStrings(boardLang(context), contextStringTable);

const contextStringTable = <String, Map<String, String>>{
  'en': {
    'title': 'What is being taught',
    'subject': 'Subject',
    'grade': 'Class',
    'lkg': 'LKG/UKG',
    'college': 'College',
    'classN': 'Class {n}',
    'fromTimetable': 'From the timetable',
    'useTimetable': 'Use the timetable',
    'showAll': 'Show all tools',
    'showRelevant': 'Show only this subject',
    'showingFor': 'Showing tools for {n}',
    'chipTip': 'Change subject or class',
    'done': 'Done',
    'mindmap': 'Mind map',
    'logicGates': 'Logic gates',
  },
  'hi': {
    'title': 'अभी क्या पढ़ाया जा रहा है',
    'subject': 'विषय',
    'grade': 'कक्षा',
    'lkg': 'एलकेजी/यूकेजी',
    'college': 'कॉलेज',
    'classN': 'कक्षा {n}',
    'fromTimetable': 'समय-सारणी से',
    'useTimetable': 'समय-सारणी लगाएँ',
    'showAll': 'सभी टूल दिखाएँ',
    'showRelevant': 'सिर्फ़ इस विषय के टूल',
    'showingFor': '{n} के टूल दिख रहे हैं',
    'chipTip': 'विषय या कक्षा बदलें',
    'done': 'हो गया',
    'mindmap': 'माइंड मैप',
    'logicGates': 'लॉजिक गेट',
  },
  'kn': {
    'title': 'ಈಗ ಏನು ಕಲಿಸಲಾಗುತ್ತಿದೆ',
    'subject': 'ವಿಷಯ',
    'grade': 'ತರಗತಿ',
    'lkg': 'ಎಲ್‌ಕೆಜಿ/ಯುಕೆಜಿ',
    'college': 'ಕಾಲೇಜು',
    'classN': 'ತರಗತಿ {n}',
    'fromTimetable': 'ವೇಳಾಪಟ್ಟಿಯಿಂದ',
    'useTimetable': 'ವೇಳಾಪಟ್ಟಿ ಬಳಸಿ',
    'showAll': 'ಎಲ್ಲಾ ಉಪಕರಣಗಳನ್ನು ತೋರಿಸಿ',
    'showRelevant': 'ಈ ವಿಷಯದ ಉಪಕರಣಗಳು ಮಾತ್ರ',
    'showingFor': '{n} ಉಪಕರಣಗಳನ್ನು ತೋರಿಸಲಾಗುತ್ತಿದೆ',
    'chipTip': 'ವಿಷಯ ಅಥವಾ ತರಗತಿ ಬದಲಿಸಿ',
    'done': 'ಮುಗಿಯಿತು',
    'mindmap': 'ಮೈಂಡ್ ಮ್ಯಾಪ್',
    'logicGates': 'ಲಾಜಿಕ್ ಗೇಟ್‌ಗಳು',
  },
};

/// The teacher's own pick of subject and class, which wins over the timetable until cleared.
class ContextOverride extends ChangeNotifier {
  Subject? subject;
  int? grade;

  bool get active => subject != null || grade != null;

  void set({Subject? subject, int? grade}) {
    if (subject != null) this.subject = subject;
    if (grade != null) this.grade = grade;
    notifyListeners();
  }

  void clear() {
    subject = null;
    grade = null;
    notifyListeners();
  }
}

/// What is being taught now: the teacher's pick, else the live session's class and subject from the timetable.
ClassContext resolveClassContext(SessionContext? session, ContextOverride pick) {
  final subject = pick.subject ?? subjectOf(session?.subjectName);
  final grade = pick.grade ?? session?.classTerm;
  return ClassContext(
    subject: subject,
    grade: grade,
    band: gradeBandOf(grade: grade, level: pick.grade != null ? 'k12' : session?.programLevel),
    sectionName: session?.sectionName,
    source: pick.active ? ContextSource.teacher : (session?.periodLabel != null ? ContextSource.timetable : ContextSource.live),
  );
}

/// "Maths · Class 7" for the top bar.
String contextLabel(BuildContext context, ClassContext c) {
  final s = contextStrings(context);
  final grade = switch (c.band) {
    GradeBand.college => s['college'],
    _ when c.grade == null => '',
    _ when c.grade! <= 0 => s['lkg'],
    _ => s.n('classN', c.grade!),
  };
  return [context.l10n.subjectName(c.subject), if (grade.isNotEmpty) grade].join(' · ');
}

/// The top bar's subject and class chip: tap it to pick what is being taught.
class ContextChip extends StatelessWidget {
  const ContextChip({super.key, required this.ctx, required this.pick});

  final ClassContext Function() ctx;
  final ContextOverride pick;

  @override
  Widget build(BuildContext context) {
    final s = contextStrings(context);
    return ListenableBuilder(
      listenable: pick,
      builder: (context, _) => ActionChip(
        key: const Key('ctx-chip'),
        avatar: Icon(subjectStyles[ctx().subject]!.icon, size: 18),
        tooltip: s['chipTip'],
        label: Text(contextLabel(context, ctx())),
        onPressed: () => showDialog<void>(context: context, builder: (_) => ContextPicker(ctx: ctx, pick: pick)),
      ),
    );
  }
}

/// The manual switcher: subject chips, class chips, and a way back to the timetable.
class ContextPicker extends StatelessWidget {
  const ContextPicker({super.key, required this.ctx, required this.pick});

  final ClassContext Function() ctx;
  final ContextOverride pick;

  @override
  Widget build(BuildContext context) {
    final s = contextStrings(context);
    final l = context.l10n;
    return ListenableBuilder(
      listenable: pick,
      builder: (context, _) {
        final now = ctx();
        return AlertDialog(
          key: const Key('ctx-picker'),
          title: Text(s['title']),
          content: SizedBox(
            width: 520,
            child: SingleChildScrollView(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(s['subject'], style: context.text.titleSmall),
                  const SizedBox(height: Kx.s8),
                  Wrap(
                    spacing: 6,
                    runSpacing: 6,
                    children: [
                      for (final sub in Subject.values.where((x) => x != Subject.general))
                        ChoiceChip(key: Key('ctx-subject-${sub.name}'), avatar: Icon(subjectStyles[sub]!.icon, size: 18), label: Text(l.subjectName(sub)), selected: now.subject == sub, onSelected: (_) => pick.set(subject: sub)),
                    ],
                  ),
                  const SizedBox(height: Kx.s16),
                  Text(s['grade'], style: context.text.titleSmall),
                  const SizedBox(height: Kx.s8),
                  Wrap(
                    spacing: 6,
                    runSpacing: 6,
                    children: [
                      for (final g in const [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13])
                        ChoiceChip(
                          key: Key('ctx-grade-$g'),
                          label: Text(g == 0 ? s['lkg'] : (g == 13 ? s['college'] : '$g')),
                          selected: now.grade == g || (g == 13 && now.band == GradeBand.college),
                          onSelected: (_) => pick.set(grade: g),
                        ),
                    ],
                  ),
                ],
              ),
            ),
          ),
          actions: [
            if (pick.active) TextButton(key: const Key('ctx-reset'), onPressed: pick.clear, child: Text(s['useTimetable'])),
            FilledButton(key: const Key('ctx-done'), onPressed: () => Navigator.pop(context), child: Text(s['done'])),
          ],
        );
      },
    );
  }
}

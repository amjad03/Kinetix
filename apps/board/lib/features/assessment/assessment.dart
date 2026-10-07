import 'dart:async';

import 'package:flutter/material.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/board_controller.dart';
import '../../core/models.dart';
import '../../demo/demo.dart' show Demo;
import '../../demo/demo_class_switcher.dart' show DemoClassSwitcher;
import '../../l10n/feature_strings.dart';
import '../board/chrome.dart' show showBoardMessage;
import '../board/kit/builders.dart' show boardText;
import '../class_check/ask_dialog.dart' show AskSetup;
import '../class_check/class_poll.dart' show PollKind;
import '../offline_ai/offline_ai.dart';

FeatureStrings assessmentStrings(BuildContext context) => FeatureStrings(boardLang(context), assessmentStringTable);

const assessmentStringTable = <String, Map<String, String>>{
  'en': {
    'exitTicket': 'Exit ticket',
    'worksheet': 'Worksheet',
    'topic': 'Topic',
    'generate': 'Make it',
    'making': 'Making questions…',
    'toBoard': 'Put on the board',
    'onBoard': 'The questions are on the board',
    'ask': 'Ask the class',
    'askHint': 'Sends this question to the Student App (and answer cards) as a poll',
    'sent': 'Sent to the Student App',
    'sourceAi': 'From KINETIX AI',
    'sourceOffline': 'Offline sample (the board\'s notes)',
    'sourceBank': 'From the class question bank',
    'sourceTemplate': 'Template (no AI or notes for this topic)',
    'sectionA': 'Section A · Choose the right answer (1 mark each)',
    'sectionB': 'Section B · Answer briefly (2 marks each)',
    'sectionC': 'Section C · Answer in detail (5 marks)',
    'reflect': 'Before you go',
    'learnt': 'One thing I learnt today about {n}:',
    'stillAsk': 'One question I still have about {n}:',
    'example': 'One example of {n} from real life:',
    'define': 'Define {n} in your own words.',
    'keyPoints': 'Write two key points about {n}.',
    'dailyLife': 'Give an example of {n} from daily life.',
    'explain': 'Explain {n} with a diagram or a worked example.',
    'name': 'Name: ____________  Roll no: ______',
    'marks': '{n} marks',
    'noTopic': 'Type a topic first',
  },
  'hi': {
    'exitTicket': 'एग्ज़िट टिकट',
    'worksheet': 'वर्कशीट',
    'topic': 'विषय',
    'generate': 'बनाएँ',
    'making': 'प्रश्न बन रहे हैं…',
    'toBoard': 'बोर्ड पर रखें',
    'onBoard': 'प्रश्न बोर्ड पर हैं',
    'ask': 'कक्षा से पूछें',
    'askHint': 'यह प्रश्न स्टूडेंट ऐप (और उत्तर कार्ड) पर पोल के रूप में भेजता है',
    'sent': 'स्टूडेंट ऐप पर भेजा गया',
    'sourceAi': 'KINETIX AI से',
    'sourceOffline': 'ऑफ़लाइन नमूना (बोर्ड के नोट्स)',
    'sourceBank': 'कक्षा के प्रश्न बैंक से',
    'sourceTemplate': 'टेम्पलेट (इस विषय के लिए AI या नोट्स नहीं)',
    'sectionA': 'खंड A · सही उत्तर चुनें (प्रत्येक 1 अंक)',
    'sectionB': 'खंड B · संक्षेप में उत्तर दें (प्रत्येक 2 अंक)',
    'sectionC': 'खंड C · विस्तार से उत्तर दें (5 अंक)',
    'reflect': 'जाने से पहले',
    'learnt': '{n} के बारे में आज मैंने एक बात सीखी:',
    'stillAsk': '{n} के बारे में मेरा एक प्रश्न:',
    'example': 'वास्तविक जीवन से {n} का एक उदाहरण:',
    'define': '{n} को अपने शब्दों में परिभाषित करें।',
    'keyPoints': '{n} के बारे में दो मुख्य बातें लिखें।',
    'dailyLife': 'दैनिक जीवन से {n} का एक उदाहरण दें।',
    'explain': 'चित्र या हल किए गए उदाहरण के साथ {n} समझाएँ।',
    'name': 'नाम: ____________  अनुक्रमांक: ______',
    'marks': '{n} अंक',
    'noTopic': 'पहले विषय लिखें',
  },
  'kn': {
    'exitTicket': 'ಎಕ್ಸಿಟ್ ಟಿಕೆಟ್',
    'worksheet': 'ವರ್ಕ್‌ಶೀಟ್',
    'topic': 'ವಿಷಯ',
    'generate': 'ತಯಾರಿಸಿ',
    'making': 'ಪ್ರಶ್ನೆಗಳು ತಯಾರಾಗುತ್ತಿವೆ…',
    'toBoard': 'ಬೋರ್ಡ್‌ಗೆ ಹಾಕಿ',
    'onBoard': 'ಪ್ರಶ್ನೆಗಳು ಬೋರ್ಡ್‌ನಲ್ಲಿವೆ',
    'ask': 'ತರಗತಿಯನ್ನು ಕೇಳಿ',
    'askHint': 'ಈ ಪ್ರಶ್ನೆಯನ್ನು ಸ್ಟೂಡೆಂಟ್ ಆ್ಯಪ್‌ಗೆ (ಮತ್ತು ಉತ್ತರ ಕಾರ್ಡ್‌ಗಳಿಗೆ) ಪೋಲ್ ಆಗಿ ಕಳುಹಿಸುತ್ತದೆ',
    'sent': 'ಸ್ಟೂಡೆಂಟ್ ಆ್ಯಪ್‌ಗೆ ಕಳುಹಿಸಲಾಗಿದೆ',
    'sourceAi': 'KINETIX AI ಇಂದ',
    'sourceOffline': 'ಆಫ್‌ಲೈನ್ ಮಾದರಿ (ಬೋರ್ಡ್‌ನ ಟಿಪ್ಪಣಿಗಳು)',
    'sourceBank': 'ತರಗತಿಯ ಪ್ರಶ್ನೆ ಬ್ಯಾಂಕ್‌ನಿಂದ',
    'sourceTemplate': 'ಮಾದರಿ ನಮೂನೆ (ಈ ವಿಷಯಕ್ಕೆ AI ಅಥವಾ ಟಿಪ್ಪಣಿ ಇಲ್ಲ)',
    'sectionA': 'ವಿಭಾಗ A · ಸರಿಯಾದ ಉತ್ತರ ಆರಿಸಿ (ತಲಾ 1 ಅಂಕ)',
    'sectionB': 'ವಿಭಾಗ B · ಸಂಕ್ಷಿಪ್ತವಾಗಿ ಉತ್ತರಿಸಿ (ತಲಾ 2 ಅಂಕ)',
    'sectionC': 'ವಿಭಾಗ C · ವಿವರವಾಗಿ ಉತ್ತರಿಸಿ (5 ಅಂಕ)',
    'reflect': 'ಹೋಗುವ ಮೊದಲು',
    'learnt': '{n} ಬಗ್ಗೆ ಇಂದು ನಾನು ಕಲಿತ ಒಂದು ವಿಷಯ:',
    'stillAsk': '{n} ಬಗ್ಗೆ ನನ್ನ ಒಂದು ಪ್ರಶ್ನೆ:',
    'example': 'ನಿಜ ಜೀವನದಿಂದ {n} ಒಂದು ಉದಾಹರಣೆ:',
    'define': '{n} ಅನ್ನು ನಿಮ್ಮ ಮಾತಿನಲ್ಲಿ ವಿವರಿಸಿ.',
    'keyPoints': '{n} ಬಗ್ಗೆ ಎರಡು ಮುಖ್ಯ ಅಂಶಗಳನ್ನು ಬರೆಯಿರಿ.',
    'dailyLife': 'ದಿನನಿತ್ಯದ ಜೀವನದಿಂದ {n} ಒಂದು ಉದಾಹರಣೆ ಕೊಡಿ.',
    'explain': 'ಚಿತ್ರ ಅಥವಾ ಬಿಡಿಸಿದ ಉದಾಹರಣೆಯೊಂದಿಗೆ {n} ವಿವರಿಸಿ.',
    'name': 'ಹೆಸರು: ____________  ಕ್ರಮ ಸಂಖ್ಯೆ: ______',
    'marks': '{n} ಅಂಕಗಳು',
    'noTopic': 'ಮೊದಲು ವಿಷಯ ಬರೆಯಿರಿ',
  },
};

enum AssessmentKind { exitTicket, worksheet }

/// Where the questions came from (the panel says so, as KINETIX AI's answers do).
enum QuestionSource { ai, offline, bank, template }

class AssessmentQuestion {
  const AssessmentQuestion(this.text, {this.options = const [], this.answer, this.marks = 1, this.section = 'A'});

  final String text;
  final List<String> options;
  final int? answer;
  final int marks;

  /// 'A' (choose), 'B' (short), 'C' (long) or 'R' (reflection, on an exit ticket).
  final String section;

  bool get isChoice => options.length >= 2;
}

class Assessment {
  const Assessment({required this.kind, required this.topic, required this.questions, required this.source});

  final AssessmentKind kind;
  final String topic;
  final List<AssessmentQuestion> questions;
  final QuestionSource source;

  int get totalMarks => questions.where((q) => q.section != 'R').fold(0, (a, q) => a + q.marks);

  /// The questions as lines, numbered, for the board or to share.
  List<String> lines(FeatureStrings s) {
    final out = <String>['${s[kind == AssessmentKind.exitTicket ? 'exitTicket' : 'worksheet']}: $topic'];
    if (kind == AssessmentKind.worksheet) out.add(s['name']);
    String? section;
    var n = 0;
    for (final q in questions) {
      if (q.section != section) {
        section = q.section;
        out.add(switch (section) {
          'A' => s['sectionA'],
          'B' => s['sectionB'],
          'C' => s['sectionC'],
          _ => s['reflect'],
        });
      }
      n++;
      out.add('$n. ${q.text}');
      for (final (i, o) in q.options.indexed) {
        out.add('    ${String.fromCharCode(65 + i)}) $o');
      }
    }
    return out;
  }
}

/// Makes exit tickets and worksheets on a topic: KINETIX AI's quiz when it is there, the board's
/// offline notes or the class's question bank when it is not (and in a demo build), and a
/// template of open questions when nothing covers the topic, so there is always something.
class AssessmentGenerator {
  AssessmentGenerator({this.online, this.offline, this.bank, this.demo = false});

  /// KINETIX AI's quiz on a topic.
  final Future<AiResult<Quiz>> Function(String topic, int count)? online;

  /// The board's offline notes (features/offline_ai).
  final AiResult<Quiz>? Function(String topic, int count)? offline;

  /// The class's own questions on today's topic (the demo classes have one).
  final List<QuizQuestion> Function(String topic)? bank;

  /// A demo build: the bank and the notes come before the demo server's sample AI.
  final bool demo;

  /// The generator for [board]'s class.
  factory AssessmentGenerator.forBoard(BoardController board, {AiLanguage language = AiLanguage.en}) {
    const notes = OfflineAi();
    final subject = board.session?.subjectName;
    final api = board.api;
    return AssessmentGenerator(
      demo: Demo.enabled,
      online: api == null || board.session == null
          ? null
          : (topic, count) => api.quiz(topic, count: count, difficulty: AiDifficulty.medium, language: language),
      offline: (topic, count) => notes.quiz(topic, count: count, subject: subject),
      bank: (topic) {
        final c = DemoClassSwitcher.current;
        if (c == null || !Demo.enabled || c.quiz.isEmpty) return const [];
        final t = topic.toLowerCase();
        final fits = t.contains(c.topic.toLowerCase()) || c.topic.toLowerCase().contains(t) || t.contains(c.subject.toLowerCase());
        if (!fits) return const [];
        return [for (final q in c.quiz) QuizQuestion(question: q.q, options: q.options, answer: q.answer, explanation: '')];
      },
    );
  }

  Future<Assessment> generate(AssessmentKind kind, String topic, FeatureStrings s) async {
    final t = topic.trim();
    final count = kind == AssessmentKind.exitTicket ? 3 : 5;
    var (mcqs, source) = await _choices(t, count);
    if (kind == AssessmentKind.exitTicket) {
      final mcq = mcqs.take(2).toList();
      return Assessment(
        kind: kind,
        topic: t,
        source: source,
        questions: [
          for (final q in mcq) AssessmentQuestion(q.question, options: q.options, answer: q.answer),
          AssessmentQuestion(s.n('learnt', t), section: 'R'),
          if (mcq.length < 2) AssessmentQuestion(s.n('example', t), section: 'R'),
          AssessmentQuestion(s.n('stillAsk', t), section: 'R'),
        ],
      );
    }
    return Assessment(
      kind: kind,
      topic: t,
      source: source,
      questions: [
        for (final q in mcqs.take(5)) AssessmentQuestion(q.question, options: q.options, answer: q.answer),
        AssessmentQuestion(s.n('define', t), marks: 2, section: 'B'),
        AssessmentQuestion(s.n('keyPoints', t), marks: 2, section: 'B'),
        AssessmentQuestion(s.n('dailyLife', t), marks: 2, section: 'B'),
        AssessmentQuestion(s.n('explain', t), marks: 5, section: 'C'),
      ],
    );
  }

  Future<(List<QuizQuestion>, QuestionSource)> _choices(String topic, int count) async {
    (List<QuizQuestion>, QuestionSource)? local() {
      final b = bank?.call(topic) ?? const [];
      if (b.isNotEmpty) return (b.take(count).toList(), QuestionSource.bank);
      final o = offline?.call(topic, count);
      if (o != null && o.result.questions.isNotEmpty) return (o.result.questions, QuestionSource.offline);
      return null;
    }

    if (demo) {
      final l = local();
      if (l != null) return l;
    }
    if (online != null) {
      try {
        final r = await online!(topic, count).timeout(const Duration(seconds: 60));
        if (r.result.questions.isNotEmpty) return (r.result.questions, r.meta.offline ? QuestionSource.offline : QuestionSource.ai);
      } catch (e) {
        debugPrint('Assessment: KINETIX AI not reached ($e); using the offline fallback');
      }
    }
    return local() ?? (const <QuizQuestion>[], QuestionSource.template);
  }
}

/// The exit ticket and worksheet generator in the split panel: the topic (today's, to start
/// with), Make it, then put the questions on the board or ask each in the Student App.
class AssessmentPanel extends StatefulWidget {
  const AssessmentPanel({super.key, required this.board, required this.wb, required this.askClass, this.kind = AssessmentKind.exitTicket, this.generator, this.initialTopic});

  final BoardController board;
  final WhiteboardController wb;
  final Future<void> Function(AskSetup setup) askClass;
  final AssessmentKind kind;
  final AssessmentGenerator? generator;
  final String? initialTopic;

  @override
  State<AssessmentPanel> createState() => AssessmentPanelState();
}

class AssessmentPanelState extends State<AssessmentPanel> {
  late AssessmentKind _kind = widget.kind;
  final _topic = TextEditingController();
  Assessment? result;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _topic.text = widget.initialTopic ?? DemoClassSwitcher.current?.topic ?? '';
    if (_topic.text.isEmpty) unawaited(_todaysTopic());
  }

  Future<void> _todaysTopic() async {
    try {
      final plan = await widget.board.api?.currentLessonPlan();
      final t = plan?.plan?.topics.firstOrNull?.title;
      if (t != null && mounted && _topic.text.isEmpty) setState(() => _topic.text = t);
    } catch (_) {}
  }

  @override
  void dispose() {
    _topic.dispose();
    super.dispose();
  }

  Future<void> generate() async {
    final s = assessmentStrings(context);
    if (_topic.text.trim().isEmpty) {
      showBoardMessage(context, s['noTopic']);
      return;
    }
    setState(() => _busy = true);
    final lang = AiLanguage.values.firstWhere((l) => l.name == s.lang, orElse: () => AiLanguage.en);
    final gen = widget.generator ?? AssessmentGenerator.forBoard(widget.board, language: lang);
    final r = await gen.generate(_kind, _topic.text, s);
    if (mounted) {
      setState(() {
        result = r;
        _busy = false;
      });
    }
  }

  void toBoard() {
    final r = result;
    if (r == null) return;
    final s = assessmentStrings(context);
    final ink = widget.wb.background.isDark ? WhiteboardController.chalkWhite : WhiteboardController.inkBlack;
    final lines = r.lines(s);
    widget.wb.insert([
      boardText(lines.first, ink, size: 32, bold: true),
      TextElement(id: newElementId(), position: const Offset(0, 56), text: lines.skip(1).join('\n'), color: ink, fontSize: 24, size: measureBoardText(lines.skip(1).join('\n'), 24)),
    ]);
    showBoardMessage(context, s['onBoard']);
  }

  Future<void> ask(AssessmentQuestion q) async {
    final s = assessmentStrings(context);
    await widget.askClass(
      AskSetup(
        kind: PollKind.mcq,
        // The Student App shows the letters; the options go with the question.
        question: [q.text, for (final (i, o) in q.options.indexed) '${String.fromCharCode(65 + i)}) $o'].join('\n'),
        options: [for (var i = 0; i < q.options.length; i++) String.fromCharCode(65 + i)],
        correct: q.answer?.toString(),
      ),
    );
    if (mounted) showBoardMessage(context, s['sent']);
  }

  @override
  Widget build(BuildContext context) {
    final s = assessmentStrings(context);
    final c = context.colors;
    final r = result;
    return ListView(
      key: const Key('assessment-panel'),
      padding: const EdgeInsets.all(Kx.s16),
      children: [
        SegmentedButton<AssessmentKind>(
          showSelectedIcon: false,
          segments: [
            ButtonSegment(value: AssessmentKind.exitTicket, icon: const Icon(Icons.logout), label: Text(s['exitTicket'], key: const Key('assessment-kind-exit'))),
            ButtonSegment(value: AssessmentKind.worksheet, icon: const Icon(Icons.assignment_outlined), label: Text(s['worksheet'], key: const Key('assessment-kind-worksheet'))),
          ],
          selected: {_kind},
          onSelectionChanged: (v) => setState(() {
            _kind = v.first;
            result = null;
          }),
        ),
        const SizedBox(height: Kx.s12),
        Row(
          children: [
            Expanded(
              child: TextField(
                key: const Key('assessment-topic'),
                controller: _topic,
                decoration: InputDecoration(labelText: s['topic'], border: const OutlineInputBorder()),
                onSubmitted: (_) => generate(),
              ),
            ),
            const SizedBox(width: Kx.s8),
            FilledButton.icon(key: const Key('assessment-generate'), onPressed: _busy ? null : generate, icon: const Icon(Icons.auto_awesome), label: Text(s['generate'])),
          ],
        ),
        if (_busy) Padding(padding: const EdgeInsets.all(Kx.s16), child: Row(children: [const CircularProgressIndicator(), const SizedBox(width: Kx.s12), Text(s['making'])])),
        if (r != null) ...[
          const SizedBox(height: Kx.s12),
          Row(
            children: [
              Expanded(
                child: Chip(
                  key: Key('assessment-source-${r.source.name}'),
                  avatar: Icon(r.source == QuestionSource.ai ? Icons.auto_awesome : Icons.offline_bolt_outlined, size: 18),
                  label: Text(s['source${r.source.name[0].toUpperCase()}${r.source.name.substring(1)}']),
                ),
              ),
              if (r.kind == AssessmentKind.worksheet) Text(s.n('marks', r.totalMarks), style: context.text.titleSmall),
            ],
          ),
          Align(
            alignment: Alignment.centerLeft,
            child: FilledButton.tonalIcon(key: const Key('assessment-to-board'), onPressed: toBoard, icon: const Icon(Icons.open_in_new), label: Text(s['toBoard'])),
          ),
          const SizedBox(height: Kx.s8),
          for (final (i, q) in r.questions.indexed)
            Card(
              key: Key('assessment-q-$i'),
              elevation: 0,
              color: c.surfaceContainerLow,
              child: Padding(
                padding: const EdgeInsets.all(Kx.s12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('${i + 1}. ${q.text}', style: context.text.titleMedium),
                    for (final (j, o) in q.options.indexed)
                      Padding(
                        padding: const EdgeInsets.only(left: Kx.s16, top: 2),
                        child: Text(
                          '${String.fromCharCode(65 + j)}) $o',
                          style: TextStyle(fontWeight: j == q.answer ? FontWeight.w700 : null, color: j == q.answer ? Kx.success : null),
                        ),
                      ),
                    if (q.isChoice)
                      Align(
                        alignment: Alignment.centerRight,
                        child: Tooltip(
                          message: s['askHint'],
                          child: TextButton.icon(key: Key('assessment-ask-$i'), onPressed: () => ask(q), icon: const Icon(Icons.how_to_vote_outlined), label: Text(s['ask'])),
                        ),
                      ),
                  ],
                ),
              ),
            ),
        ],
      ],
    );
  }
}

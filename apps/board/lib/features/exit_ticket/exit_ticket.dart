import 'dart:async';

import 'package:flutter/material.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/board_controller.dart';
import '../../core/models.dart' show AiLanguage;
import '../../l10n/feature_strings.dart';
import '../assessment/assessment.dart' show AssessmentGenerator, AssessmentKind, assessmentStrings;
import '../board/chrome.dart' show showBoardMessage;
import '../class_check/class_poll.dart';
import '../extras/board_table.dart';

FeatureStrings exitStrings(BuildContext context) => FeatureStrings(boardLang(context), exitStringTable);

const exitStringTable = <String, Map<String, String>>{
  'en': {
    'title': 'Exit ticket',
    'topic': 'Topic of the lesson',
    'questions': 'Questions',
    'add': 'Add a question',
    'suggest': 'Suggest questions',
    'question': 'Question {n}',
    'kindChoice': 'Choose',
    'kindNumber': 'Number',
    'kindWords': 'Words',
    'option': 'Answer {n}',
    'addOption': 'Add an answer',
    'rightNumber': 'Right number (optional)',
    'remove': 'Remove',
    'start': 'Start the exit ticket',
    'needQuestion': 'Write at least one question first.',
    'running': 'Question {n} of {total}',
    'answered': '{n} of {total} answered',
    'next': 'Next question',
    'finish': 'Finish',
    'students': 'Students answer in the Student App (Live question) or hold up their answer cards.',
    'results': 'Results',
    'rightPct': '{n}% right',
    'noKey': 'No right answer set',
    'saved': 'Saved to the class record (ERP)',
    'saving': 'Saving…',
    'notSaved': 'Not saved: open a class on the board to keep the results.',
    'saveFailed': 'Could not save. Check the connection.',
    'retry': 'Save again',
    'toBoard': 'Put results on the board',
    'again': 'New exit ticket',
    'sample': 'Sample questions (offline)',
  },
  'hi': {
    'title': 'एग्ज़िट टिकट',
    'topic': 'पाठ का विषय',
    'questions': 'प्रश्न',
    'add': 'प्रश्न जोड़ें',
    'suggest': 'प्रश्न सुझाएँ',
    'question': 'प्रश्न {n}',
    'kindChoice': 'विकल्प',
    'kindNumber': 'संख्या',
    'kindWords': 'शब्द',
    'option': 'उत्तर {n}',
    'addOption': 'उत्तर जोड़ें',
    'rightNumber': 'सही संख्या (वैकल्पिक)',
    'remove': 'हटाएँ',
    'start': 'एग्ज़िट टिकट शुरू करें',
    'needQuestion': 'पहले कम से कम एक प्रश्न लिखें।',
    'running': 'प्रश्न {n} / {total}',
    'answered': '{total} में से {n} ने उत्तर दिया',
    'next': 'अगला प्रश्न',
    'finish': 'समाप्त',
    'students': 'विद्यार्थी स्टूडेंट ऐप (लाइव प्रश्न) में उत्तर दें या उत्तर कार्ड ऊपर उठाएँ।',
    'results': 'परिणाम',
    'rightPct': '{n}% सही',
    'noKey': 'सही उत्तर तय नहीं',
    'saved': 'कक्षा रिकॉर्ड (ERP) में सहेजा गया',
    'saving': 'सहेज रहे हैं…',
    'notSaved': 'सहेजा नहीं गया: परिणाम रखने के लिए बोर्ड पर कक्षा खोलें।',
    'saveFailed': 'सहेज नहीं सके। कनेक्शन जाँचें।',
    'retry': 'फिर सहेजें',
    'toBoard': 'परिणाम बोर्ड पर रखें',
    'again': 'नया एग्ज़िट टिकट',
    'sample': 'नमूना प्रश्न (ऑफ़लाइन)',
  },
  'kn': {
    'title': 'ಎಕ್ಸಿಟ್ ಟಿಕೆಟ್',
    'topic': 'ಪಾಠದ ವಿಷಯ',
    'questions': 'ಪ್ರಶ್ನೆಗಳು',
    'add': 'ಪ್ರಶ್ನೆ ಸೇರಿಸಿ',
    'suggest': 'ಪ್ರಶ್ನೆಗಳನ್ನು ಸೂಚಿಸಿ',
    'question': 'ಪ್ರಶ್ನೆ {n}',
    'kindChoice': 'ಆಯ್ಕೆ',
    'kindNumber': 'ಸಂಖ್ಯೆ',
    'kindWords': 'ಪದಗಳು',
    'option': 'ಉತ್ತರ {n}',
    'addOption': 'ಉತ್ತರ ಸೇರಿಸಿ',
    'rightNumber': 'ಸರಿಯಾದ ಸಂಖ್ಯೆ (ಐಚ್ಛಿಕ)',
    'remove': 'ತೆಗೆಯಿರಿ',
    'start': 'ಎಕ್ಸಿಟ್ ಟಿಕೆಟ್ ಆರಂಭಿಸಿ',
    'needQuestion': 'ಮೊದಲು ಕನಿಷ್ಠ ಒಂದು ಪ್ರಶ್ನೆ ಬರೆಯಿರಿ.',
    'running': 'ಪ್ರಶ್ನೆ {n} / {total}',
    'answered': '{total} ರಲ್ಲಿ {n} ಉತ್ತರಿಸಿದ್ದಾರೆ',
    'next': 'ಮುಂದಿನ ಪ್ರಶ್ನೆ',
    'finish': 'ಮುಗಿಸಿ',
    'students': 'ವಿದ್ಯಾರ್ಥಿಗಳು ಸ್ಟೂಡೆಂಟ್ ಆ್ಯಪ್‌ನಲ್ಲಿ (ಲೈವ್ ಪ್ರಶ್ನೆ) ಉತ್ತರಿಸಬಹುದು ಅಥವಾ ಉತ್ತರ ಕಾರ್ಡ್ ಎತ್ತಬಹುದು.',
    'results': 'ಫಲಿತಾಂಶ',
    'rightPct': '{n}% ಸರಿ',
    'noKey': 'ಸರಿಯಾದ ಉತ್ತರ ನಿಗದಿಯಾಗಿಲ್ಲ',
    'saved': 'ತರಗತಿ ದಾಖಲೆಯಲ್ಲಿ (ERP) ಉಳಿಸಲಾಗಿದೆ',
    'saving': 'ಉಳಿಸುತ್ತಿದೆ…',
    'notSaved': 'ಉಳಿಸಿಲ್ಲ: ಫಲಿತಾಂಶ ಇಡಲು ಬೋರ್ಡ್‌ನಲ್ಲಿ ತರಗತಿ ತೆರೆಯಿರಿ.',
    'saveFailed': 'ಉಳಿಸಲಾಗಲಿಲ್ಲ. ಸಂಪರ್ಕ ಪರಿಶೀಲಿಸಿ.',
    'retry': 'ಮತ್ತೆ ಉಳಿಸಿ',
    'toBoard': 'ಫಲಿತಾಂಶ ಬೋರ್ಡ್‌ನಲ್ಲಿ ಇಡಿ',
    'again': 'ಹೊಸ ಎಕ್ಸಿಟ್ ಟಿಕೆಟ್',
    'sample': 'ಮಾದರಿ ಪ್ರಶ್ನೆಗಳು (ಆಫ್‌ಲೈನ್)',
  },
};

/// One question the teacher writes: choose one answer, a number, or a few words.
class ExitQuestion {
  ExitQuestion({this.kind = PollKind.mcq, String text = '', List<String>? options, this.correct})
    : text = TextEditingController(text: text),
      options = [
        for (final o in options ?? ['', '']) TextEditingController(text: o),
      ];

  PollKind kind;
  final TextEditingController text;
  final List<TextEditingController> options;

  /// Choice: the right answer's index; number: handled by [number].
  int? correct;
  final number = TextEditingController();

  void dispose() {
    text.dispose();
    number.dispose();
    for (final o in options) {
      o.dispose();
    }
  }

  bool get filled => text.text.trim().isNotEmpty && (kind != PollKind.mcq || options.where((o) => o.text.trim().isNotEmpty).length >= 2);

  /// The poll to ask: the options go in the question text, the Student App shows the letters.
  ClassPoll toPoll(BoardController board) {
    if (kind == PollKind.mcq) {
      final shown = [for (final o in options) o.text.trim()].where((o) => o.isNotEmpty).toList();
      final right = correct != null && correct! < options.length && options[correct!].text.trim().isNotEmpty ? options.sublist(0, correct!).where((o) => o.text.trim().isNotEmpty).length : null;
      return ClassPoll(
        board: board,
        kind: PollKind.mcq,
        question: [text.text.trim(), for (final (i, o) in shown.indexed) '${String.fromCharCode(65 + i)}) $o'].join('\n'),
        options: [for (var i = 0; i < shown.length; i++) String.fromCharCode(65 + i)],
        correct: right?.toString(),
      );
    }
    final n = number.text.trim();
    return ClassPoll(board: board, kind: kind, question: text.text.trim(), correct: kind == PollKind.numeric && double.tryParse(n) != null ? n : null);
  }
}

enum _Phase { edit, run, done }

/// The exit ticket: the teacher writes a few questions (or takes suggestions), runs them one by
/// one so students answer in the Student App or with answer cards, watches the answers come in,
/// and at the end the results go to the class record (ERP) and can go on the board.
class ExitTicketPanel extends StatefulWidget {
  const ExitTicketPanel({super.key, required this.board, required this.wb, this.generator, this.initialTopic});

  final BoardController board;
  final WhiteboardController wb;
  final AssessmentGenerator? generator;
  final String? initialTopic;

  @override
  State<ExitTicketPanel> createState() => ExitTicketPanelState();
}

class ExitTicketPanelState extends State<ExitTicketPanel> {
  final _topic = TextEditingController();
  final questions = <ExitQuestion>[ExitQuestion()];
  _Phase _phase = _Phase.edit;
  final polls = <ClassPoll>[];
  int _at = 0;
  bool _busy = false;
  String _save = '';
  String? _error;
  late String ticketId = widget.board.newId();

  @override
  void initState() {
    super.initState();
    _topic.text = widget.initialTopic ?? '';
  }

  @override
  void dispose() {
    _topic.dispose();
    for (final q in questions) {
      q.dispose();
    }
    for (final p in polls) {
      unawaited(p.close().whenComplete(p.dispose));
    }
    super.dispose();
  }

  Future<void> _suggest() async {
    final s = exitStrings(context);
    final a = assessmentStrings(context);
    if (_topic.text.trim().isEmpty) {
      setState(() => _error = a['noTopic']);
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    final lang = AiLanguage.values.firstWhere((l) => l.name == s.lang, orElse: () => AiLanguage.en);
    final gen = widget.generator ?? AssessmentGenerator.forBoard(widget.board, language: lang);
    final r = await gen.generate(AssessmentKind.exitTicket, _topic.text, a);
    if (!mounted) return;
    setState(() {
      for (final q in questions) {
        q.dispose();
      }
      questions
        ..clear()
        ..addAll([
          for (final q in r.questions)
            if (q.isChoice) ExitQuestion(text: q.text, options: q.options, correct: q.answer) else ExitQuestion(kind: PollKind.word, text: q.text),
        ]);
      if (questions.isEmpty) questions.add(ExitQuestion());
      _busy = false;
    });
  }

  Future<void> _start() async {
    final ready = questions.where((q) => q.filled).toList();
    if (ready.isEmpty) {
      setState(() => _error = exitStrings(context)['needQuestion']);
      return;
    }
    for (final p in polls) {
      await p.close();
      p.dispose();
    }
    polls
      ..clear()
      ..addAll([for (final q in ready) q.toPoll(widget.board)]);
    ticketId = widget.board.newId();
    setState(() {
      _error = null;
      _at = 0;
      _phase = _Phase.run;
      _save = '';
    });
    await polls[0].start();
  }

  Future<void> _next() async {
    await polls[_at].close();
    if (_at < polls.length - 1) {
      setState(() => _at++);
      await polls[_at].start();
    } else {
      setState(() => _phase = _Phase.done);
      unawaited(_saveTicket());
    }
  }

  Future<void> _saveTicket() async {
    final api = widget.board.api;
    final saved = polls.every((p) => p.saved);
    if (api == null || !widget.board.isSignedIn || !saved) {
      setState(() => _save = 'notSaved');
      return;
    }
    setState(() => _save = 'saving');
    try {
      await api.saveExitTicket(ticketId, _topic.text.trim().isEmpty ? exitStrings(context)['title'] : _topic.text.trim(), [for (final p in polls) p.id]);
      if (mounted) setState(() => _save = 'saved');
    } catch (_) {
      if (mounted) setState(() => _save = 'saveFailed');
    }
  }

  void _resultsToBoard() {
    final s = exitStrings(context);
    final ink = widget.wb.background.isDark ? WhiteboardController.chalkWhite : WhiteboardController.inkBlack;
    final rows = <List<String>>[
      [s['question'].replaceAll('{n}', '#'), s['results']],
      for (final (i, p) in polls.indexed) ['${i + 1}. ${p.question.split('\n').first}', _summary(p, s)],
    ];
    widget.wb.insert(boardTable(rows, ink, size: 22));
    showBoardMessage(context, s['toBoard']);
  }

  String _summary(ClassPoll p, FeatureStrings s) {
    final n = p.answers.length;
    if (p.correct == null) return '$n / ${p.classSize}';
    final right = p.answers.values.where((a) => p.isRight(a.answer) == true).length;
    return '${n == 0 ? 0 : (100 * right / n).round()}% ($right / $n)';
  }

  @override
  Widget build(BuildContext context) {
    final s = exitStrings(context);
    return switch (_phase) {
      _Phase.edit => _edit(context, s),
      _Phase.run => _run(context, s),
      _Phase.done => _done(context, s),
    };
  }

  Widget _edit(BuildContext context, FeatureStrings s) {
    return ListView(
      key: const Key('exit-ticket-panel'),
      padding: const EdgeInsets.all(Kx.s16),
      children: [
        TextField(
          key: const Key('exit-topic'),
          controller: _topic,
          decoration: InputDecoration(labelText: s['topic'], border: const OutlineInputBorder()),
        ),
        const SizedBox(height: Kx.s8),
        Wrap(
          spacing: Kx.s8,
          children: [
            OutlinedButton.icon(key: const Key('exit-suggest'), onPressed: _busy ? null : _suggest, icon: const Icon(Icons.auto_awesome), label: Text(s['suggest'])),
            OutlinedButton.icon(
              key: const Key('exit-add'),
              onPressed: questions.length >= 8 ? null : () => setState(() => questions.add(ExitQuestion())),
              icon: const Icon(Icons.add),
              label: Text(s['add']),
            ),
          ],
        ),
        if (_busy)
          const Padding(
            padding: EdgeInsets.only(top: Kx.s8),
            child: LinearProgressIndicator(),
          ),
        if (_error != null)
          Padding(
            padding: const EdgeInsets.only(top: Kx.s8),
            child: Text(
              _error!,
              key: const Key('exit-error'),
              style: TextStyle(color: context.colors.error),
            ),
          ),
        for (final (i, q) in questions.indexed) _questionCard(context, s, i, q),
        const SizedBox(height: Kx.s12),
        FilledButton.icon(key: const Key('exit-start'), onPressed: _start, icon: const Icon(Icons.play_arrow), label: Text(s['start'])),
      ],
    );
  }

  Widget _questionCard(BuildContext context, FeatureStrings s, int i, ExitQuestion q) {
    final c = context.colors;
    return Card(
      key: Key('exit-q-$i'),
      elevation: 0,
      color: c.surfaceContainerLow,
      margin: const EdgeInsets.only(top: Kx.s12),
      child: Padding(
        padding: const EdgeInsets.all(Kx.s12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(child: Text(s.n('question', i + 1), style: context.text.titleSmall)),
                IconButton(
                  key: Key('exit-remove-$i'),
                  tooltip: s['remove'],
                  onPressed: questions.length <= 1
                      ? null
                      : () => setState(() {
                          questions.removeAt(i).dispose();
                        }),
                  icon: const Icon(Icons.delete_outline),
                ),
              ],
            ),
            SegmentedButton<PollKind>(
              showSelectedIcon: false,
              style: const ButtonStyle(visualDensity: VisualDensity.compact),
              segments: [
                ButtonSegment(
                  value: PollKind.mcq,
                  label: Text(s['kindChoice'], key: Key('exit-kind-choice-$i')),
                ),
                ButtonSegment(
                  value: PollKind.numeric,
                  label: Text(s['kindNumber'], key: Key('exit-kind-number-$i')),
                ),
                ButtonSegment(
                  value: PollKind.word,
                  label: Text(s['kindWords'], key: Key('exit-kind-words-$i')),
                ),
              ],
              selected: {q.kind},
              onSelectionChanged: (v) => setState(() => q.kind = v.first),
            ),
            const SizedBox(height: Kx.s8),
            TextField(
              key: Key('exit-text-$i'),
              controller: q.text,
              minLines: 1,
              maxLines: 3,
              decoration: const InputDecoration(border: OutlineInputBorder(), isDense: true),
            ),
            if (q.kind == PollKind.mcq) ...[
              RadioGroup<int>(
                groupValue: q.correct,
                onChanged: (v) => setState(() => q.correct = v),
                child: Column(
                  children: [
                    for (final (j, o) in q.options.indexed)
                      Padding(
                        padding: const EdgeInsets.only(top: 6),
                        child: Row(
                          children: [
                            Radio<int>(key: Key('exit-right-$i-$j'), value: j),
                            Expanded(
                              child: TextField(
                                key: Key('exit-option-$i-$j'),
                                controller: o,
                                decoration: InputDecoration(labelText: s.n('option', j + 1), border: const OutlineInputBorder(), isDense: true),
                              ),
                            ),
                          ],
                        ),
                      ),
                  ],
                ),
              ),
              if (q.options.length < 4)
                TextButton.icon(key: Key('exit-add-option-$i'), onPressed: () => setState(() => q.options.add(TextEditingController())), icon: const Icon(Icons.add), label: Text(s['addOption'])),
            ],
            if (q.kind == PollKind.numeric)
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: TextField(
                  key: Key('exit-number-$i'),
                  controller: q.number,
                  keyboardType: TextInputType.number,
                  decoration: InputDecoration(labelText: s['rightNumber'], border: const OutlineInputBorder(), isDense: true),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _run(BuildContext context, FeatureStrings s) {
    final poll = polls[_at];
    final last = _at == polls.length - 1;
    return ListenableBuilder(
      listenable: poll,
      builder: (context, _) => ListView(
        key: const Key('exit-running'),
        padding: const EdgeInsets.all(Kx.s16),
        children: [
          Text(s.n('running', _at + 1).replaceAll('{total}', '${polls.length}'), key: const Key('exit-progress'), style: context.text.labelLarge),
          const SizedBox(height: Kx.s8),
          Text(poll.question, style: context.text.headlineSmall),
          const SizedBox(height: Kx.s12),
          _bars(context, poll),
          const SizedBox(height: Kx.s8),
          Text(s.n('answered', poll.answers.length).replaceAll('{total}', '${poll.classSize}'), key: const Key('exit-answered')),
          const SizedBox(height: 4),
          Text(s['students'], style: context.text.bodySmall?.copyWith(color: context.colors.onSurfaceVariant)),
          const SizedBox(height: Kx.s16),
          FilledButton.icon(key: const Key('exit-next'), onPressed: _next, icon: Icon(last ? Icons.check : Icons.skip_next), label: Text(last ? s['finish'] : s['next'])),
        ],
      ),
    );
  }

  /// The live tally: a bar for each answer (choice), each value (number) or each word.
  Widget _bars(BuildContext context, ClassPoll poll) {
    final tally = poll.tally;
    final top = tally.fold<int>(1, (m, e) => e.$2 > m ? e.$2 : m);
    final c = context.colors;
    return Column(
      children: [
        for (final (k, n) in tally)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 3),
            child: Row(
              children: [
                SizedBox(
                  width: 72,
                  child: Text(
                    poll.label(k),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontWeight: poll.isRight(k) == true ? FontWeight.w800 : null),
                  ),
                ),
                Expanded(
                  child: LinearProgressIndicator(minHeight: 18, value: n / top, color: poll.isRight(k) == true ? Kx.success : c.primary, backgroundColor: c.surfaceContainerHighest),
                ),
                SizedBox(
                  width: 36,
                  child: Text('$n', key: Key('exit-count-$k'), textAlign: TextAlign.end),
                ),
              ],
            ),
          ),
      ],
    );
  }

  Widget _done(BuildContext context, FeatureStrings s) {
    final c = context.colors;
    return ListView(
      key: const Key('exit-done'),
      padding: const EdgeInsets.all(Kx.s16),
      children: [
        Text(s['results'], style: context.text.headlineSmall),
        for (final (i, p) in polls.indexed)
          Card(
            key: Key('exit-result-$i'),
            elevation: 0,
            color: c.surfaceContainerLow,
            margin: const EdgeInsets.only(top: Kx.s8),
            child: ListTile(title: Text('${i + 1}. ${p.question.split('\n').first}'), subtitle: Text(p.correct == null ? '${s['noKey']} · ${p.answers.length} / ${p.classSize}' : _summary(p, s))),
          ),
        const SizedBox(height: Kx.s12),
        if (_save.isNotEmpty)
          Row(
            children: [
              Icon(
                _save == 'saved' ? Icons.cloud_done_outlined : (_save == 'saving' ? Icons.cloud_upload_outlined : Icons.cloud_off_outlined),
                color: _save == 'saved' ? Kx.success : c.onSurfaceVariant,
              ),
              const SizedBox(width: Kx.s8),
              Expanded(child: Text(s[_save], key: const Key('exit-save-status'))),
              if (_save == 'saveFailed') TextButton(key: const Key('exit-retry'), onPressed: _saveTicket, child: Text(s['retry'])),
            ],
          ),
        const SizedBox(height: Kx.s12),
        Wrap(
          spacing: Kx.s8,
          children: [
            FilledButton.tonalIcon(key: const Key('exit-to-board'), onPressed: _resultsToBoard, icon: const Icon(Icons.open_in_new), label: Text(s['toBoard'])),
            OutlinedButton.icon(key: const Key('exit-new'), onPressed: () => setState(() => _phase = _Phase.edit), icon: const Icon(Icons.refresh), label: Text(s['again'])),
          ],
        ),
      ],
    );
  }
}

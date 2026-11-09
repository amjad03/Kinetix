import 'package:flutter/material.dart';

import '../../core/device_store.dart';
import '../classroom_hooks.dart';
import '../past_papers/past_papers_view.dart';
import '../ui/ce_style.dart';
import 'bank.dart';
import 'class_records.dart';
import 'drill_teams_plan.dart';
import 'mastery_view.dart';
import 'mock_view.dart';
import 'quiz_view.dart';
import 'tool_ui.dart';
import 'worksheets_view.dart';
import '../l10n/ce_strings.dart';

/// A tile of the Class tools hub (Classroom Apps → Class tools, and the panel's Class tools
/// tab): an id, its icon, title, one line and the pastel behind it.
typedef ClassTool = ({String id, IconData icon, String title, String line, Color colour});

/// The Class tools (Classroom edition): tools that work without phones or the internet, by roll
/// number — class quiz, mock test, formula drill, teams, class plan, mastery map, worksheets,
/// pick a roll number, timer, past papers. Records are kept per class, by roll number only
/// ([ClassToolsStore]); questions come from the Zynetix School bank when it is bundled
/// ([ClassBank], README.md).
class ClassToolsHub extends StatefulWidget {
  const ClassToolsHub({super.key, required this.host, this.initialTool});

  final ClassroomHost host;

  /// The tool to open at once (a tile tapped in Classroom Apps), else the hub's grid.
  final String? initialTool;

  /// Records per class, kept while the app runs (one store per board settings and class).
  static final _stores = <(DeviceStore, String), ClassToolsStore>{};

  static ClassToolsStore storeFor(ClassroomHost host) {
    final classId = host.currentClass?.id ?? host.board.session?.sectionId ?? 'board';
    final key = (host.board.deviceStore, classId);
    return _stores.putIfAbsent(key, () => ClassToolsStore(deviceStore: host.board.deviceStore, classId: classId)..load());
  }

  @override
  State<ClassToolsHub> createState() => _ClassToolsHubState();
}

class _ClassToolsHubState extends State<ClassToolsHub> {
  late String? tool = widget.initialTool;
  Object? arg;
  late final ClassToolsStore records = ClassToolsHub.storeFor(widget.host);
  late Future<SubjectBank> bank = ClassBank.load(year: widget.host.pucYear ?? 2, subject: widget.host.subject);
  String? Function()? _tip;

  @override
  void initState() {
    super.initState();
    _tip = () => _tips[tool] ?? ceTr('Pick a class tool. Class quiz is a good start: no phones needed.');
    ClassroomHooks.panelTip = _tip;
  }

  @override
  void dispose() {
    if (ClassroomHooks.panelTip == _tip) ClassroomHooks.panelTip = null;
    super.dispose();
  }

  static Map<String, String> get _tips => {
    'quiz': ceTr('Read the question out, then tap each roll number: once for right, twice for wrong.'),
    'mock': ceTr('Pick the chapters, check the paper, then Print. Enter marks after the test.'),
    'drill': ceTr('Let the class say the formula aloud before you tap Show.'),
    'teams': ceTr('Give points with +1 and +5. Put the scoreboard on the board at the end.'),
    'plan': ceTr('Tick each chapter when it is taught; the plan moves the rest.'),
    'mastery': ceTr('Pink cells need another try. Make a revision quiz on the weakest topics.'),
    'worksheets': ceTr('Pick the chapter and how many questions, then Print.'),
    'picker': ceTr('Tap Pick. Nobody is picked twice until everyone has had a turn.'),
    'timer': ceTr('Pick the minutes and tap Start.'),
    'papers': ceTr('Tap a paper to show it on the board. Add papers from a USB stick with the school PIN.'),
  };

  void _open(String? id, {Object? arg}) => setState(() {
    tool = id;
    this.arg = arg;
  });

  @override
  Widget build(BuildContext context) => Material(
    key: Key('ce-class-tools-panel'),
    color: CeC.page,
    child: Theme(
      data: ceTheme(context),
      child: Padding(
        padding: EdgeInsets.fromLTRB(24, 20, 28, 24),
        child: FutureBuilder<SubjectBank>(
          future: bank,
          builder: (context, snap) {
            final b = snap.data;
            if (b == null) return Center(child: CircularProgressIndicator());
            return ListenableBuilder(
              listenable: records,
              builder: (context, _) {
                final env = ToolEnv(
                  host: widget.host,
                  records: records,
                  bank: b,
                  back: () => _open(null),
                  open: (id, {arg}) => _open(id, arg: arg),
                );
                return KeyedSubtree(key: ValueKey('ce-tool-view-$tool-${arg.hashCode}'), child: _view(env));
              },
            );
          },
        ),
      ),
    ),
  );

  Widget _view(ToolEnv env) => switch (tool) {
    'quiz' => ClassQuizView(env: env, topicKeys: arg is List<String> ? arg as List<String> : [], preset: arg is PresetQuiz ? arg as PresetQuiz : null),
    'papers' => PastPapersView(env: env, paperId: arg is String ? arg as String : null),
    'mock' => MockTestView(env: env),
    'drill' => FormulaDrillView(env: env),
    'teams' => TeamsView(env: env),
    'plan' => ClassPlanView(env: env),
    'mastery' => MasteryView(env: env, chapterId: arg is String ? arg as String : null),
    'worksheets' => WorksheetsView(env: env),
    'picker' => RollPickerView(env: env),
    'timer' => TimerView(env: env),
    _ => _grid(env),
  };

  Widget _grid(ToolEnv env) => ListView(
    padding: EdgeInsets.only(left: 4),
    children: [
      Text(context.ce('Class tools'), style: ceHeading(34)),
      SizedBox(height: 6),
      Text([if (env.classLine.isNotEmpty) env.classLine, if (env.rolls.isNotEmpty) context.ce('{n} of {total} present', {'n': env.present.length, 'total': env.rolls.length}), context.ce('no phones, no internet')].join(' · '), style: ceText(17)),
      SizedBox(height: 22),
      LayoutBuilder(
        builder: (context, box) {
          final cols = box.maxWidth > 1300 ? 4 : 3;
          final w = (box.maxWidth - 16 * (cols - 1)) / cols;
          return Wrap(
            spacing: 16,
            runSpacing: 16,
            children: [for (final t in classTools) classToolTile(t, width: w, height: 168, onTap: () => _open(t.id))],
          );
        },
      ),
      if (env.bank.source != BankSource.school) ...[
        SizedBox(height: 22),
        Text(
          env.bank.source == BankSource.lessons
              ? context.ce('Questions come from the lessons’ quick checks. The full question bank adds mock-test questions, formulas and more.')
              : context.ce('No question bank for {subject} on this board yet: Teams, Pick a roll no. and Timer still work.', {'subject': env.subject.isEmpty ? context.ce('this class') : env.subject}),
          key: Key('ce-tools-bank-note'),
          style: ceText(15),
        ),
      ],
    ],
  );
}

/// The Class tools, in the hub's order.
List<ClassTool> get classTools => <ClassTool>[
  (id: 'quiz', icon: Icons.fact_check_outlined, title: ceTr('Class quiz'), line: ceTr('Tap roll numbers right or wrong'), colour: CeC.lavender),
  (id: 'mock', icon: Icons.assignment_outlined, title: ceTr('Mock test'), line: ceTr('PUC board pattern, ready to print'), colour: CeC.peach),
  (id: 'drill', icon: Icons.functions, title: ceTr('Formula drill'), line: ceTr('One formula at a time, quick recall'), colour: CeC.butter),
  (id: 'teams', icon: Icons.groups_2_outlined, title: ceTr('Teams'), line: ceTr('Split the class by roll number'), colour: CeC.mint),
  (id: 'plan', icon: Icons.event_note_outlined, title: ceTr('Class plan'), line: ceTr('Every chapter, to the exam date'), colour: CeC.blue),
  (id: 'mastery', icon: Icons.grid_view_rounded, title: ceTr('Mastery map'), line: ceTr('Every topic, by roll number'), colour: CeC.pink),
  (id: 'worksheets', icon: Icons.description_outlined, title: ceTr('Worksheets'), line: ceTr('Print, or put on the board'), colour: CeC.peach),
  (id: 'picker', icon: Icons.casino_outlined, title: ceTr('Pick a roll no.'), line: ceTr('Fair turns, nobody left out'), colour: CeC.butter),
  (id: 'timer', icon: Icons.timer_outlined, title: ceTr('Timer'), line: ceTr('Big countdown the class can see'), colour: CeC.mint),
  (id: 'papers', icon: Icons.history_edu_outlined, title: ceTr('Past papers'), line: ceTr('KCET, NEET, JEE, PUC papers on the board'), colour: CeC.blue),
];

/// One Class tools tile.
Widget classToolTile(ClassTool t, {double width = 240, double height = 128, VoidCallback? onTap}) => SizedBox(
  width: width,
  height: height,
  child: Material(
    color: t.colour,
    borderRadius: BorderRadius.circular(22),
    child: InkWell(
      key: Key('ce-tool-${t.id}'),
      borderRadius: BorderRadius.circular(22),
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            ceIconDot(t.icon, size: 40),
            const Spacer(),
            Text(t.title, maxLines: 1, overflow: TextOverflow.ellipsis, style: ceHeading(18)),
            const SizedBox(height: 2),
            Text(t.line, maxLines: 2, overflow: TextOverflow.ellipsis, style: ceText(13.5, height: 1.25)),
          ],
        ),
      ),
    ),
  ),
);

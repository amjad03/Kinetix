import 'package:flutter/material.dart';

import '../../core/device_store.dart';
import '../classroom_hooks.dart';
import '../ui/ce_style.dart';
import 'bank.dart';
import 'class_records.dart';
import 'drill_teams_plan.dart';
import 'mastery_view.dart';
import 'mock_view.dart';
import 'quiz_view.dart';
import 'tool_ui.dart';
import 'worksheets_view.dart';

/// A tile of the Class tools hub (Classroom Apps → Class tools, and the panel's Class tools
/// tab): an id, its icon, title, one line and the pastel behind it.
typedef ClassTool = ({String id, IconData icon, String title, String line, Color colour});

/// The Class tools (Classroom edition): tools that work without phones or the internet, by roll
/// number — class quiz, mock test, formula drill, teams, class plan, mastery map, worksheets,
/// pick a roll number, timer. Records are kept per class, by roll number only
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
    _tip = () => _tips[tool] ?? 'Pick a class tool. Class quiz is a good start: no phones needed.';
    ClassroomHooks.panelTip = _tip;
  }

  @override
  void dispose() {
    if (ClassroomHooks.panelTip == _tip) ClassroomHooks.panelTip = null;
    super.dispose();
  }

  static const _tips = {
    'quiz': 'Read the question out, then tap each roll number: once for right, twice for wrong.',
    'mock': 'Pick the chapters, check the paper, then Print. Enter marks after the test.',
    'drill': 'Let the class say the formula aloud before you tap Show.',
    'teams': 'Give points with +1 and +5. Put the scoreboard on the board at the end.',
    'plan': 'Tick each chapter when it is taught; the plan moves the rest.',
    'mastery': 'Pink cells need another try. Make a revision quiz on the weakest topics.',
    'worksheets': 'Pick the chapter and how many questions, then Print.',
    'picker': 'Tap Pick. Nobody is picked twice until everyone has had a turn.',
    'timer': 'Pick the minutes and tap Start.',
  };

  void _open(String? id, {Object? arg}) => setState(() {
    tool = id;
    this.arg = arg;
  });

  @override
  Widget build(BuildContext context) => Material(
    key: const Key('ce-class-tools-panel'),
    color: CeC.page,
    child: Theme(
      data: ceTheme(context),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(24, 20, 28, 24),
        child: FutureBuilder<SubjectBank>(
          future: bank,
          builder: (context, snap) {
            final b = snap.data;
            if (b == null) return const Center(child: CircularProgressIndicator());
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
    'quiz' => ClassQuizView(env: env, topicKeys: arg is List<String> ? arg as List<String> : const []),
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
    padding: const EdgeInsets.only(left: 4),
    children: [
      Text('Class tools', style: ceHeading(34)),
      const SizedBox(height: 6),
      Text([if (env.classLine.isNotEmpty) env.classLine, if (env.rolls.isNotEmpty) '${env.present.length} of ${env.rolls.length} present', 'no phones, no internet'].join(' · '), style: ceText(17)),
      const SizedBox(height: 22),
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
        const SizedBox(height: 22),
        Text(
          env.bank.source == BankSource.lessons
              ? 'Questions come from the lessons\' quick checks. The full Zynetix School bank adds mock-test questions, formulas and more.'
              : 'No question bank for ${env.subject.isEmpty ? 'this class' : env.subject} on this board yet: Teams, Pick a roll no. and Timer still work.',
          key: const Key('ce-tools-bank-note'),
          style: ceText(15),
        ),
      ],
    ],
  );
}

/// The Class tools, in the hub's order.
const classTools = <ClassTool>[
  (id: 'quiz', icon: Icons.fact_check_outlined, title: 'Class quiz', line: 'Tap roll numbers right or wrong', colour: CeC.lavender),
  (id: 'mock', icon: Icons.assignment_outlined, title: 'Mock test', line: 'PUC board pattern, ready to print', colour: CeC.peach),
  (id: 'drill', icon: Icons.functions, title: 'Formula drill', line: 'One formula at a time, quick recall', colour: CeC.butter),
  (id: 'teams', icon: Icons.groups_2_outlined, title: 'Teams', line: 'Split the class by roll number', colour: CeC.mint),
  (id: 'plan', icon: Icons.event_note_outlined, title: 'Class plan', line: 'Every chapter, to the exam date', colour: CeC.blue),
  (id: 'mastery', icon: Icons.grid_view_rounded, title: 'Mastery map', line: 'Every topic, by roll number', colour: CeC.pink),
  (id: 'worksheets', icon: Icons.description_outlined, title: 'Worksheets', line: 'Print, or put on the board', colour: CeC.peach),
  (id: 'picker', icon: Icons.casino_outlined, title: 'Pick a roll no.', line: 'Fair turns, nobody left out', colour: CeC.butter),
  (id: 'timer', icon: Icons.timer_outlined, title: 'Timer', line: 'Big countdown the class can see', colour: CeC.mint),
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

import 'dart:async';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:kinetix_ink/kinetix_ink.dart';

import '../ui/ce_style.dart';
import 'bank.dart';
import 'class_logic.dart';
import 'class_records.dart';
import 'tool_ui.dart';

// --- Formula drill --------------------------------------------------------------------------------

/// Formula drill: one formula at a time, its name showing and the formula hidden; the class
/// says it aloud, then the teacher shows it. Put on board types it there.
class FormulaDrillView extends StatefulWidget {
  const FormulaDrillView({super.key, required this.env});
  final ToolEnv env;

  @override
  State<FormulaDrillView> createState() => _FormulaDrillViewState();
}

class _FormulaDrillViewState extends State<FormulaDrillView> {
  ToolEnv get env => widget.env;
  late String? chapterId = (env.startChapter?.formulas.isNotEmpty ?? false) ? env.startChapter!.id : env.bank.chapters.where((c) => c.formulas.isNotEmpty).firstOrNull?.id;
  int index = 0;
  bool shown = false;
  int score = 0;
  List<BankFormula>? order;

  List<BankFormula> get formulas => order ?? env.bank.chapter(chapterId)?.formulas ?? const [];

  void _go(int i) => setState(() {
    index = i.clamp(0, formulas.length - 1);
    shown = false;
  });

  void _put(BankFormula f) {
    final size = measureBoardText(f.text.isEmpty ? f.tex : f.text, 64);
    env.host.putElements([
      TextElement(id: newElementId(), position: Offset.zero, text: f.name, color: env.ink, fontSize: 40, bold: true, size: measureBoardText(f.name, 40, bold: true)),
      MathElement(id: newElementId(), position: const Offset(0, 80), latex: f.tex, color: env.ink, fontSize: 64, size: Size(size.width * 1.1, size.height * 1.6)),
    ]);
    env.host.showMessage('Formula on the board');
  }

  @override
  Widget build(BuildContext context) {
    if (!env.bank.chapters.any((c) => c.formulas.isNotEmpty)) {
      return Column(
        children: [
          ToolHeader(title: 'Formula drill', onBack: env.back),
          Expanded(child: noBank(env, what: 'formulas')),
        ],
      );
    }
    final list = formulas;
    final f = list.isEmpty ? null : list[index.clamp(0, list.length - 1)];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ToolHeader(
          title: 'Formula drill',
          onBack: env.back,
          pill: list.isEmpty ? null : toolPill('${index + 1} of ${list.length}', key: const Key('ce-drill-progress')),
        ),
        const SizedBox(height: 12),
        ChapterPicker(
          bank: env.bank,
          selected: [?chapterId],
          only: (c) => c.formulas.isNotEmpty,
          onChanged: (s) => setState(() {
            chapterId = s.first;
            order = null;
            index = 0;
            shown = false;
          }),
        ),
        const SizedBox(height: 20),
        if (f != null)
          Expanded(
            child: Container(
              key: const Key('ce-drill-card'),
              padding: const EdgeInsets.all(32),
              decoration: BoxDecoration(color: CeC.butter, borderRadius: BorderRadius.circular(28)),
              child: Column(
                children: [
                  Text(f.name, textAlign: TextAlign.center, style: ceHeading(36)),
                  if (env.bank.chapter(f.chapterId)?.topicTitle(f.topic) case final t? when t.isNotEmpty) Text(t, style: ceText(16)),
                  const Spacer(),
                  GestureDetector(
                    key: const Key('ce-drill-show'),
                    onTap: () => setState(() => shown = !shown),
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 200),
                      constraints: const BoxConstraints(minHeight: 150, minWidth: 420),
                      padding: const EdgeInsets.symmetric(horizontal: 36, vertical: 26),
                      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(22)),
                      child: Center(
                        widthFactor: 1,
                        child: shown
                            ? FittedBox(
                                fit: BoxFit.scaleDown,
                                child: TexView(f.tex, fontSize: 46, color: CeC.navy, display: true),
                              )
                            : Column(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  const Icon(Icons.visibility_off_outlined, size: 40, color: CeC.muted),
                                  const SizedBox(height: 8),
                                  Text(
                                    'Say it aloud, then tap to show',
                                    style: ceText(19, w: FontWeight.w600, c: CeC.navy),
                                  ),
                                ],
                              ),
                      ),
                    ),
                  ),
                  if (shown && f.note.isNotEmpty) ...[
                    const SizedBox(height: 14),
                    Text(
                      f.note,
                      textAlign: TextAlign.center,
                      style: ceText(17, c: CeC.body),
                    ),
                  ],
                  const Spacer(),
                  SizedBox(
                    width: double.infinity,
                    child: Wrap(
                      alignment: WrapAlignment.spaceBetween,
                      runSpacing: 10,
                      children: [
                        Wrap(
                          spacing: 12,
                          children: [
                            toolButton('Previous', icon: Icons.chevron_left, onPressed: index > 0 ? () => _go(index - 1) : null),
                            toolButton(
                              'Shuffle',
                              icon: Icons.shuffle,
                              onPressed: () => setState(() {
                                order = [...env.bank.chapter(chapterId)?.formulas ?? const <BankFormula>[]]..shuffle(Random(env.now().millisecond));
                                index = 0;
                                shown = false;
                              }),
                            ),
                          ],
                        ),
                        Wrap(
                          spacing: 12,
                          children: [
                            toolButton('Put on board', icon: Icons.co_present_outlined, onPressed: () => _put(f), key: const Key('ce-drill-board')),
                            toolButton(
                              shown ? 'Next formula' : 'Show',
                              icon: shown ? Icons.chevron_right : Icons.visibility_outlined,
                              filled: true,
                              key: const Key('ce-drill-next'),
                              onPressed: () {
                                if (!shown) return setState(() => shown = true);
                                if (index < list.length - 1) _go(index + 1);
                              },
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
      ],
    );
  }
}

// --- Teams ----------------------------------------------------------------------------------------

/// Teams: the present roll numbers split by benches or mixed, and a scoreboard.
class TeamsView extends StatefulWidget {
  const TeamsView({super.key, required this.env});
  final ToolEnv env;

  @override
  State<TeamsView> createState() => _TeamsViewState();
}

class _TeamsViewState extends State<TeamsView> {
  ToolEnv get env => widget.env;
  int n = 4;
  bool mixed = false;
  List<TeamRecord> get teams => env.records.records.teams;

  Future<void> _make() => env.records.setTeams(splitTeams(env.present, n, mixed: mixed, seed: env.now().millisecondsSinceEpoch));

  Future<void> _add(int i, int d) => env.records.setTeams([for (final (k, t) in teams.indexed) k == i ? t.withPoints(max(0, t.points + d)) : t]);

  Future<void> _board() async {
    await env.host.putWidget(
      _Scoreboard(teams: teams),
      size: Size(960, 140.0 + 100 * teams.length),
      context: context,
      at: const Offset(900, 120),
    );
    env.host.showMessage('Scoreboard on the board');
  }

  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: env.records,
    builder: (context, _) => ListView(
      key: const Key('ce-teams'),
      padding: EdgeInsets.zero,
      children: [
        ToolHeader(
          title: 'Teams',
          onBack: env.back,
          pill: toolPill('${env.present.length} present', bg: CeC.mint),
        ),
        const SizedBox(height: 14),
        Wrap(
          spacing: 10,
          runSpacing: 10,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            Text(
              'Teams',
              style: ceText(17, w: FontWeight.w600, c: CeC.navy),
            ),
            for (final k in const [2, 3, 4, 5, 6]) choiceChip('$k', on: n == k, offIcon: null, tick: false, key: Key('ce-teams-$k'), onTap: () => setState(() => n = k)),
            const SizedBox(width: 12),
            choiceChip('By benches', on: !mixed, offIcon: null, onTap: () => setState(() => mixed = false)),
            choiceChip('Mixed', on: mixed, offIcon: null, onTap: () => setState(() => mixed = true)),
            toolButton(teams.isEmpty ? 'Make teams' : 'Make new teams', icon: Icons.groups_2_outlined, filled: true, onPressed: env.present.isEmpty ? null : _make, key: const Key('ce-teams-make')),
          ],
        ),
        const SizedBox(height: 20),
        if (teams.isEmpty)
          const SizedBox(
            height: 360,
            child: ToolEmpty(icon: Icons.groups_2_outlined, title: 'No teams yet', line: 'Pick how many teams, then Make teams. Absent roll numbers are left out.'),
          )
        else ...[
          LayoutBuilder(
            builder: (context, box) {
              final cols = box.maxWidth > 1300 ? 3 : 2;
              final w = (box.maxWidth - 16 * (cols - 1)) / cols;
              final top = teams.map((t) => t.points).reduce(max);
              return Wrap(
                spacing: 16,
                runSpacing: 16,
                children: [
                  for (final (i, t) in teams.indexed)
                    Container(
                      key: Key('ce-team-$i'),
                      width: w,
                      padding: const EdgeInsets.all(20),
                      decoration: BoxDecoration(color: CeC.pastel(i), borderRadius: BorderRadius.circular(24)),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Expanded(child: Text(t.name, style: ceHeading(26))),
                              if (top > 0 && t.points == top) const Icon(Icons.emoji_events, color: Color(0xFFB45309)),
                              const SizedBox(width: 8),
                              Text('${t.points}', key: Key('ce-team-points-$i'), style: ceHeading(40)),
                            ],
                          ),
                          Text('Roll ${rollsLabel(t.rolls)} · ${t.rolls.length}', maxLines: 2, overflow: TextOverflow.ellipsis, style: ceText(15)),
                          const SizedBox(height: 12),
                          Wrap(
                            spacing: 0,
                            runSpacing: 8,
                            children: [
                              for (final d in const [1, 5]) ...[
                                OutlinedButton(key: Key('ce-team-$i-plus$d'), style: ceSoftButton(), onPressed: () => _add(i, d), child: Text('+$d')),
                                const SizedBox(width: 8),
                              ],
                              TextButton(
                                onPressed: () => _add(i, -1),
                                child: Text(
                                  '−1',
                                  style: ceText(17, w: FontWeight.w600, c: CeC.navy),
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                ],
              );
            },
          ),
          const SizedBox(height: 20),
          Wrap(
            spacing: 12,
            runSpacing: 12,
            children: [
              toolButton('Put scoreboard on board', icon: Icons.co_present_outlined, filled: true, onPressed: _board, key: const Key('ce-teams-board')),
              toolButton('Points to zero', icon: Icons.restart_alt, onPressed: () => env.records.setTeams([for (final t in teams) t.withPoints(0)])),
            ],
          ),
        ],
      ],
    ),
  );
}

class _Scoreboard extends StatelessWidget {
  const _Scoreboard({required this.teams});
  final List<TeamRecord> teams;

  @override
  Widget build(BuildContext context) {
    final sorted = [...teams]..sort((a, b) => b.points.compareTo(a.points));
    return Container(
      padding: const EdgeInsets.all(30),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(28),
        border: Border.all(color: CeC.line, width: 2),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Scoreboard', style: ceHeading(40)),
          const SizedBox(height: 16),
          for (final (i, t) in sorted.indexed)
            Container(
              height: 84,
              margin: const EdgeInsets.only(bottom: 16),
              padding: const EdgeInsets.symmetric(horizontal: 24),
              decoration: BoxDecoration(color: CeC.pastel(teams.indexOf(t)), borderRadius: BorderRadius.circular(18)),
              child: Row(
                children: [
                  Text('${i + 1}', style: ceHeading(34, c: CeC.muted)),
                  const SizedBox(width: 22),
                  Expanded(child: Text(t.name, style: ceHeading(36))),
                  Text('${t.points}', style: ceHeading(44)),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

// --- Class plan -----------------------------------------------------------------------------------

/// Class plan: the subject's chapters laid out to the exam date, revision weeks kept free,
/// where the class is against the plan and this week's chapter.
class ClassPlanView extends StatelessWidget {
  const ClassPlanView({super.key, required this.env});
  final ToolEnv env;

  String get subject => env.bank.subject;
  PlanRecord get plan => env.records.records.plans[subject] ?? PlanRecord(examDate: defaultExamDate(env.now()));

  static const _months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  static String date(DateTime d) => '${d.day} ${_months[d.month - 1]}';

  Future<void> _date(BuildContext context) async {
    final now = env.now();
    final d = await showDatePicker(context: context, initialDate: plan.examDate.isBefore(now) ? now : plan.examDate, firstDate: now, lastDate: now.add(const Duration(days: 730)));
    if (d != null) await env.records.setPlan(subject, plan.copyWith(examDate: d));
  }

  @override
  Widget build(BuildContext context) {
    if (env.bank.chapters.isEmpty) {
      return Column(
        children: [
          ToolHeader(title: 'Class plan', onBack: env.back),
          Expanded(child: noBank(env, what: 'chapters')),
        ],
      );
    }
    return ListenableBuilder(
      listenable: env.records,
      builder: (context, _) {
        final p = plan;
        final v = buildPlan(chapters: [for (final c in env.bank.chapters) (c.id, c.title)], plan: p, today: env.now());
        final status = v.left == 0
            ? ('Syllabus done', 'Every chapter is taught. Revision from ${date(v.revisionFrom)}.', CeC.mint)
            : v.done == 0 && v.expectedDone > 0
            ? ('Tick the chapters already taught', 'Then the plan shows whether the class is on track for ${date(p.examDate)}: ${v.left} chapters in ${v.teachingDays} school days.', CeC.blue)
            : v.behind > 0
            ? (
                'Behind by ${v.behind} chapter${v.behind == 1 ? '' : 's'}',
                '${v.left} chapters in ${v.teachingDays} school days: about ${v.daysPerChapter.toStringAsFixed(1)} days each. An extra period a week would catch up.',
                CeC.peach,
              )
            : ('On track', '${v.left} chapters in ${v.teachingDays} school days: about ${v.daysPerChapter.toStringAsFixed(1)} days each before revision.', CeC.mint);
        return ListView(
          key: const Key('ce-plan'),
          padding: EdgeInsets.zero,
          children: [
            ToolHeader(
              title: 'Class plan',
              onBack: env.back,
              pill: toolPill('${v.done} of ${v.steps.length} chapters done', key: const Key('ce-plan-done')),
            ),
            Padding(
              padding: const EdgeInsets.only(left: 52),
              child: Text('${env.classLine} · every chapter, to the exam date', style: ceText(17)),
            ),
            const SizedBox(height: 18),
            Wrap(
              spacing: 12,
              runSpacing: 12,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                toolButton('Exam ${date(p.examDate)} ${p.examDate.year}', icon: Icons.event_outlined, onPressed: () => _date(context), key: const Key('ce-plan-exam')),
                Text(
                  'Revision',
                  style: ceText(17, w: FontWeight.w600, c: CeC.navy),
                ),
                for (final w in const [2, 3, 4])
                  choiceChip(
                    '$w weeks',
                    on: p.revisionWeeks == w,
                    offIcon: null,
                    tick: false,
                    onTap: () => env.records.setPlan(subject, p.copyWith(revisionWeeks: w)),
                  ),
                toolPill('${v.daysLeft} school days left', icon: Icons.hourglass_bottom_rounded, bg: CeC.blue),
              ],
            ),
            const SizedBox(height: 18),
            infoCard(icon: v.done == 0 && v.left > 0 ? Icons.checklist_rounded : v.behind > 0 ? Icons.trending_down_rounded : Icons.check_circle_outline, title: status.$1, line: status.$2, colour: status.$3, key: const Key('ce-plan-status')),
            if (v.thisWeek.isNotEmpty) ...[
              const SizedBox(height: 14),
              infoCard(
                icon: Icons.today_outlined,
                title: 'This week: ${v.thisWeek.map((s) => s.title).join(', ')}',
                line: 'Tick a chapter when it is taught; the plan moves the rest.',
                colour: CeC.lavender,
              ),
            ],
            const SizedBox(height: 18),
            Material(
              color: Colors.white,
              borderRadius: BorderRadius.circular(24),
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 8),
                child: Column(
                  children: [
                    for (final s in v.steps)
                      CheckboxListTile(
                        key: Key('ce-plan-${s.id}'),
                        value: s.done,
                        controlAffinity: ListTileControlAffinity.leading,
                        onChanged: (on) => env.records.setPlan(subject, p.copyWith(done: on ?? false ? {...p.done, s.id} : ({...p.done}..remove(s.id)))),
                        title: Text(
                          s.title,
                          style: ceText(17, w: FontWeight.w600, c: s.done ? CeC.muted : CeC.navy),
                        ),
                        secondary: Text(s.done ? 'Done' : '${date(s.from!)} – ${date(s.to!)}', style: ceText(15, c: s.done ? CeC.green : CeC.body)),
                      ),
                    ListTile(
                      leading: const Icon(Icons.flag_outlined, color: CeC.accent),
                      title: Text(
                        'Revision and mock tests',
                        style: ceText(17, w: FontWeight.w600, c: CeC.navy),
                      ),
                      trailing: Text('${date(v.revisionFrom)} – ${date(p.examDate)}', style: ceText(15, c: CeC.body)),
                    ),
                  ],
                ),
              ),
            ),
          ],
        );
      },
    );
  }
}

// --- Pick a roll number and Timer -----------------------------------------------------------------

/// Picks a present roll number at random; nobody twice until everyone has had a turn.
class RollPickerView extends StatefulWidget {
  const RollPickerView({super.key, required this.env});
  final ToolEnv env;

  @override
  State<RollPickerView> createState() => _RollPickerViewState();
}

class _RollPickerViewState extends State<RollPickerView> {
  final picked = <int>[];
  late final _r = Random(widget.env.now().microsecondsSinceEpoch);

  void _pick() {
    var left = [
      for (final r in widget.env.present)
        if (!picked.contains(r)) r,
    ];
    if (left.isEmpty) {
      picked.clear();
      left = [...widget.env.present];
    }
    if (left.isEmpty) return;
    setState(() => picked.add(left[_r.nextInt(left.length)]));
  }

  @override
  Widget build(BuildContext context) {
    final env = widget.env;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ToolHeader(
          title: 'Pick a roll no.',
          onBack: env.back,
          pill: toolPill('${env.present.length - picked.length} still to go', bg: CeC.butter),
        ),
        const SizedBox(height: 20),
        Expanded(
          child: Container(
            decoration: BoxDecoration(color: CeC.butter, borderRadius: BorderRadius.circular(28)),
            child: Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    'Roll number',
                    style: ceText(24, w: FontWeight.w600, c: CeC.navy),
                  ),
                  Text(picked.isEmpty ? '–' : rollLabel(picked.last), key: const Key('ce-picked'), style: ceHeading(200, height: 1.1)),
                  const SizedBox(height: 10),
                  if (picked.length > 1) Text('Before: ${picked.reversed.skip(1).take(8).map(rollLabel).join(', ')}', style: ceText(17)),
                ],
              ),
            ),
          ),
        ),
        const SizedBox(height: 16),
        Row(
          children: [
            Expanded(child: Text('Absent roll numbers are never picked.', style: ceText(15))),
            toolButton('Start again', onPressed: picked.isEmpty ? null : () => setState(picked.clear)),
            const SizedBox(width: 12),
            toolButton('Pick', icon: Icons.casino_outlined, filled: true, onPressed: env.present.isEmpty ? null : _pick, key: const Key('ce-pick')),
          ],
        ),
      ],
    );
  }
}

/// A big countdown the class can see.
class TimerView extends StatefulWidget {
  const TimerView({super.key, required this.env});
  final ToolEnv env;

  @override
  State<TimerView> createState() => _TimerViewState();
}

class _TimerViewState extends State<TimerView> {
  int total = 120, left = 120;
  Timer? _t;

  void _set(int s) => setState(() {
    _t?.cancel();
    _t = null;
    total = left = s;
  });

  void _toggle() {
    if (_t != null) {
      _t!.cancel();
      setState(() => _t = null);
      return;
    }
    if (left == 0) left = total;
    _t = Timer.periodic(const Duration(seconds: 1), (t) {
      if (!mounted) return t.cancel();
      setState(() => left = max(0, left - 1));
      if (left == 0) {
        t.cancel();
        setState(() => _t = null);
      }
    });
    setState(() {});
  }

  @override
  void dispose() {
    _t?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final env = widget.env;
    final mm = (left ~/ 60).toString().padLeft(2, '0'), ss = (left % 60).toString().padLeft(2, '0');
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ToolHeader(title: 'Timer', onBack: env.back),
        const SizedBox(height: 12),
        Wrap(
          spacing: 10,
          children: [
            for (final m in const [1, 2, 3, 5, 10, 15]) choiceChip('$m min', on: total == m * 60, offIcon: null, tick: false, key: Key('ce-timer-$m'), onTap: () => _set(m * 60)),
          ],
        ),
        const SizedBox(height: 20),
        Expanded(
          child: Container(
            decoration: BoxDecoration(color: left == 0 ? CeC.pink : CeC.mint, borderRadius: BorderRadius.circular(28)),
            child: Center(
              child: FittedBox(
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Text('$mm:$ss', key: const Key('ce-timer-left'), style: ceHeading(220)),
                ),
              ),
            ),
          ),
        ),
        const SizedBox(height: 16),
        Row(
          children: [
            const Spacer(),
            toolButton('Reset', onPressed: () => _set(total)),
            const SizedBox(width: 12),
            toolButton(_t == null ? 'Start' : 'Pause', icon: _t == null ? Icons.play_arrow_rounded : Icons.pause_rounded, filled: true, onPressed: _toggle, key: const Key('ce-timer-go')),
          ],
        ),
      ],
    );
  }
}

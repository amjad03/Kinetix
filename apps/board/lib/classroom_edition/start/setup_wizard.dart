import 'dart:async';

import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart' show KxAvatar;

import '../l10n/ce_strings.dart';
import '../local/classroom_store.dart';
import '../settings/pin_pad.dart' show chooseNewPin;
import '../settings/timetable_editor.dart';
import '../ui/ce_confirm.dart';
import '../ui/ce_style.dart';

/// The streams a PU college runs (the class's optional stream).
const ceStreams = ['PCMB', 'PCMC', 'PCME', 'PCMS', 'CEBA', 'SEBA', 'BEBA', 'HEPS', 'HEPP', 'Arts', 'Commerce', 'Science'];

/// The subjects a PU teacher teaches (said in English in Karnataka colleges).
const ceSubjects = [
  'Physics',
  'Chemistry',
  'Mathematics',
  'Biology',
  'Computer Science',
  'Electronics',
  'Statistics',
  'Accountancy',
  'Business Studies',
  'Economics',
  'English',
  'Kannada',
  'Hindi',
  'History',
  'Political Science',
  'Sociology',
];

/// Opens the set-up wizard again from College settings → This board.
Future<void> openSetupWizard(BuildContext context, ClassroomStore store) => Navigator.of(context).push(
  MaterialPageRoute<void>(builder: (ctx) => CeSetupWizard(store: store, firstRun: false, onDone: (_) => Navigator.of(ctx).pop())),
);

/// The first-run set-up (P1 item 10), shown by the start screen while nobody has set the board
/// up ([ClassroomStore.needsSetup]) and again from Settings: 1 the college's name, 2 its classes
/// (1st or 2nd PUC, section, stream, roll numbers), 3 its teachers (name and subject), 4 bell
/// times for Monday to Saturday, 5 the school PIN (the forced change from 1234 and the recovery
/// code), 6 done, with a short tour. Every step has Back; every step but the PIN (while it is
/// still 1234) can be skipped. What a step changes is saved when you leave it.
class CeSetupWizard extends StatefulWidget {
  const CeSetupWizard({super.key, required this.store, required this.onDone, this.firstRun = true});

  final ClassroomStore store;

  /// Called at the end; true: take the short tour on the practice board.
  final ValueChanged<bool> onDone;

  /// The board's first run (the end offers the tour), else run again from Settings.
  final bool firstRun;

  static const steps = 6;

  @override
  State<CeSetupWizard> createState() => _CeSetupWizardState();
}

class _CeSetupWizardState extends State<CeSetupWizard> {
  int step = 0;
  ClassroomStore get store => widget.store;

  late final _college = TextEditingController(text: store.college);
  late List<CeBell> _bells = store.bells;

  // The class being added.
  int _year = 1;
  String _section = 'A';
  String _stream = '';
  int _rolls = 40;

  // The teacher being added.
  final _teacherName = TextEditingController();
  String _subject = '';

  @override
  void initState() {
    super.initState();
    store.addListener(_changed);
    _college.addListener(_changed);
    _teacherName.addListener(_changed);
    _section = _nextSection(1);
  }

  @override
  void dispose() {
    store.removeListener(_changed);
    _college.dispose();
    _teacherName.dispose();
    super.dispose();
  }

  void _changed() {
    if (mounted) setState(() {});
  }

  String _nextSection(int year) {
    const letters = 'ABCDEFGH';
    final used = {for (final c in store.classes.where((c) => c.year == year)) c.section};
    return letters.split('').firstWhere((l) => !used.contains(l), orElse: () => 'A');
  }

  /// Whether this step can be skipped: all but the PIN while it is still 1234.
  bool get _canSkip => step != 4 || !store.pinIsDefault;

  bool get _canNext => switch (step) {
    4 => !store.pinIsDefault,
    _ => true,
  };

  Future<void> _save() async {
    switch (step) {
      case 0:
        if (_college.text.trim() != store.college) await store.replace(store.setup.copyWith(college: _college.text.trim()));
      case 3:
        if (!_sameBells(_bells, store.bells)) await store.setBells(_bells);
    }
  }

  static bool _sameBells(List<CeBell> a, List<CeBell> b) => a.length == b.length && [for (var i = 0; i < a.length; i++) a[i] == b[i]].every((x) => x);

  Future<void> _next({bool skip = false}) async {
    if (!skip) await _save();
    if (step == 3 && skip) _bells = store.bells;
    if (step == CeSetupWizard.steps - 1) return;
    if (mounted) setState(() => step++);
    if (step == CeSetupWizard.steps - 1) await store.markSetupDone();
  }

  void _back() {
    if (step > 0) setState(() => step--);
  }

  Future<void> _finish(bool tour) async {
    await store.markSetupDone();
    widget.onDone(tour);
  }

  @override
  Widget build(BuildContext context) {
    final titles = [
      context.ce('Your college'),
      context.ce('Classes'),
      context.ce('Teachers'),
      context.ce('Bell times'),
      context.ce('School PIN'),
      context.ce('All set'),
    ];
    final last = step == CeSetupWizard.steps - 1;
    return Theme(
      data: ceTheme(context),
      child: Scaffold(
        key: const Key('ce-wizard'),
        backgroundColor: CeC.page,
        body: SafeArea(
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(48, 28, 48, 0),
                child: Row(
                  children: [
                    ceBrand(),
                    const SizedBox(width: 24),
                    Expanded(child: Text(context.ce('Set up this board'), style: ceHeading(24), overflow: TextOverflow.ellipsis)),
                    if (!widget.firstRun) TextButton(key: const Key('ce-wizard-close'), onPressed: () => widget.onDone(false), child: Text(context.ce('Close'))),
                  ],
                ),
              ),
              const SizedBox(height: 20),
              _StepBar(step: step, titles: titles),
              Expanded(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.fromLTRB(48, 24, 48, 24),
                  child: Center(
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 1180),
                      child: Container(
                        key: Key('ce-wizard-step-${step + 1}'),
                        padding: const EdgeInsets.all(40),
                        decoration: ceCard(r: 28),
                        child: switch (step) {
                          0 => _collegeStep(),
                          1 => _classesStep(),
                          2 => _teachersStep(),
                          3 => _bellsStep(),
                          4 => _pinStep(),
                          _ => _doneStep(),
                        },
                      ),
                    ),
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(48, 0, 48, 32),
                child: Row(
                  children: [
                    if (step > 0)
                      OutlinedButton.icon(key: const Key('ce-wizard-back'), style: ceSoftButton(), onPressed: _back, icon: const Icon(Icons.arrow_back), label: Text(context.ce('Back'))),
                    const Spacer(),
                    if (!last && _canSkip) ...[
                      TextButton(
                        key: const Key('ce-wizard-skip'),
                        style: TextButton.styleFrom(minimumSize: const Size(ceTarget * 2, ceTarget), textStyle: ceText(18, w: FontWeight.w600)),
                        onPressed: () => unawaited(_next(skip: true)),
                        child: Text(context.ce('Skip this step')),
                      ),
                      const SizedBox(width: 16),
                    ],
                    if (!last)
                      FilledButton.icon(
                        key: const Key('ce-wizard-next'),
                        style: ceBigButton().copyWith(minimumSize: const WidgetStatePropertyAll(Size(220, 72))),
                        onPressed: _canNext ? () => unawaited(_next()) : null,
                        icon: const Icon(Icons.arrow_forward),
                        label: Text(context.ce('Next')),
                      )
                    else ...[
                      if (widget.firstRun) ...[
                        OutlinedButton.icon(key: const Key('ce-wizard-tour'), style: ceSoftButton(), onPressed: () => unawaited(_finish(true)), icon: const Icon(Icons.tour_outlined), label: Text(context.ce('Take the short tour'))),
                        const SizedBox(width: 16),
                      ],
                      FilledButton.icon(
                        key: const Key('ce-wizard-finish'),
                        style: ceBigButton().copyWith(minimumSize: const WidgetStatePropertyAll(Size(220, 72))),
                        onPressed: () => unawaited(_finish(false)),
                        icon: const Icon(Icons.check_rounded),
                        label: Text(widget.firstRun ? context.ce('Go to the start screen') : context.ce('Done')),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _heading(String title, String line) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(title, style: ceHeading(36)),
      const SizedBox(height: 8),
      Text(line, style: ceText(19, c: CeC.body)),
      const SizedBox(height: 28),
    ],
  );

  Widget _label(String s) => Padding(padding: const EdgeInsets.only(bottom: 10, top: 18), child: Text(s, style: ceText(17, w: FontWeight.w600, c: CeC.navy)));

  Widget _chip(String label, bool on, VoidCallback tap, {Key? key}) => ChoiceChip(key: key, label: Text(label), selected: on, onSelected: (_) => tap());

  // --- 1. College ---------------------------------------------------------------------------

  Widget _collegeStep() => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      _heading(context.ce('What is your college called?'), context.ce('It shows on the start screen, on marks sheets and on backups.')),
      TextField(
        key: const Key('ce-wizard-college'),
        controller: _college,
        autofocus: true,
        textCapitalization: TextCapitalization.words,
        style: ceText(26, c: CeC.navy),
        decoration: InputDecoration(hintText: context.ce('e.g. Soundarya PU College'), border: const OutlineInputBorder(), contentPadding: const EdgeInsets.all(20)),
        onSubmitted: (_) => unawaited(_next()),
      ),
    ],
  );

  // --- 2. Classes ---------------------------------------------------------------------------

  Widget _classesStep() => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      _heading(context.ce('Which classes use this board?'), context.ce('Only roll numbers are kept on this board, never names.')),
      Wrap(
        spacing: 12,
        runSpacing: 12,
        children: [
          for (final c in store.classes)
            _ItemCard(
              key: Key('ce-wizard-class-${c.id}'),
              icon: Icons.groups_outlined,
              colour: CeC.pastel(c.year == 2 ? 1 : 3),
              title: c.name,
              line: [if (c.stream.isNotEmpty) c.stream, context.ce('Roll numbers 1–{n}', {'n': c.rollCount})].join(' · '),
              removeLabel: context.ce('Remove {name}', {'name': c.name}),
              onRemove: () => unawaited(_removeClass(c)),
            ),
        ],
      ),
      if (store.classes.isEmpty) Text(context.ce('No classes yet. Add the first one below.'), style: ceText(17)),
      const SizedBox(height: 24),
      Container(
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(color: CeC.page, borderRadius: BorderRadius.circular(22)),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(context.ce('Add a class'), style: ceHeading(24)),
            _label(context.ce('Year')),
            Wrap(
              spacing: 12,
              children: [
                for (final y in [1, 2])
                  _chip(y == 2 ? '2nd PUC' : '1st PUC', _year == y, () => setState(() {
                    _year = y;
                    _section = _nextSection(y);
                  }), key: Key('ce-wizard-year-$y')),
              ],
            ),
            _label(context.ce('Section')),
            Wrap(spacing: 10, runSpacing: 10, children: [for (final l in 'ABCDEFGH'.split('')) _chip(l, _section == l, () => setState(() => _section = l), key: Key('ce-wizard-section-$l'))]),
            _label(context.ce('Stream (optional)')),
            Wrap(
              spacing: 10,
              runSpacing: 10,
              children: [
                _chip(context.ce('None'), _stream.isEmpty, () => setState(() => _stream = ''), key: const Key('ce-wizard-stream-none')),
                for (final s in ceStreams) _chip(s, _stream == s, () => setState(() => _stream = s), key: Key('ce-wizard-stream-$s')),
              ],
            ),
            _label(context.ce('How many students (roll numbers 1 to …)')),
            _Stepper(value: _rolls, onChanged: (v) => setState(() => _rolls = v), keyPrefix: 'ce-wizard-rolls'),
            const SizedBox(height: 24),
            FilledButton.icon(
              key: const Key('ce-wizard-add-class'),
              style: ceBigButton(),
              onPressed: () async {
                await store.addClass(year: _year, section: _section, stream: _stream, rollCount: _rolls);
                setState(() => _section = _nextSection(_year));
              },
              icon: const Icon(Icons.add),
              label: Text(context.ce('Add {name}', {'name': '${_year == 2 ? '2nd' : '1st'} PUC $_section'})),
            ),
          ],
        ),
      ),
    ],
  );

  Future<void> _removeClass(CeClass c) async {
    final periods = store.slots.where((s) => s.classId == c.id).length;
    if (periods > 0) {
      final ok = await ceConfirmRemove(
        context,
        title: context.ce('Remove {name}?', {'name': c.name}),
        body: periods == 1 ? context.ce('Its 1 period comes off the timetable.') : context.ce('Its {n} periods come off the timetable.', {'n': periods}),
        confirm: context.ce('Remove class'),
      );
      if (!ok) return;
    }
    final before = store.setup;
    await store.removeClass(c.id);
    if (mounted) ceUndoSnack(context, context.ce('{name} removed.', {'name': c.name}), () => unawaited(store.replace(before)));
  }

  // --- 3. Teachers --------------------------------------------------------------------------

  Widget _teachersStep() => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      _heading(context.ce('Who teaches on this board?'), context.ce('Each teacher taps their own card to start a class. No passwords.')),
      Wrap(
        spacing: 12,
        runSpacing: 12,
        children: [
          for (final t in store.teachers)
            _ItemCard(
              key: Key('ce-wizard-teacher-${t.id}'),
              avatar: KxAvatar.initials(t.name),
              colour: CeC.pastel(t.colour),
              title: t.name,
              line: t.subject,
              removeLabel: context.ce('Remove {name}', {'name': t.name}),
              onRemove: () => unawaited(_removeTeacher(t)),
            ),
        ],
      ),
      if (store.teachers.isEmpty) Text(context.ce('No teachers yet. Add the first one below.'), style: ceText(17)),
      const SizedBox(height: 24),
      Container(
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(color: CeC.page, borderRadius: BorderRadius.circular(22)),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(context.ce('Add a teacher'), style: ceHeading(24)),
            _label(context.ce('Name')),
            TextField(
              key: const Key('ce-wizard-teacher-name'),
              controller: _teacherName,
              textCapitalization: TextCapitalization.words,
              style: ceText(22, c: CeC.navy),
              decoration: InputDecoration(hintText: context.ce('e.g. Lakshmi Rao'), border: const OutlineInputBorder(), contentPadding: const EdgeInsets.all(18)),
            ),
            _label(context.ce('Subject')),
            Wrap(spacing: 10, runSpacing: 10, children: [for (final s in ceSubjects) _chip(s, _subject == s, () => setState(() => _subject = _subject == s ? '' : s), key: Key('ce-wizard-subject-$s'))]),
            const SizedBox(height: 24),
            FilledButton.icon(
              key: const Key('ce-wizard-add-teacher'),
              style: ceBigButton(),
              onPressed: _teacherName.text.trim().isEmpty
                  ? null
                  : () async {
                      await store.addTeacher(_teacherName.text, subject: _subject);
                      _teacherName.clear();
                      setState(() => _subject = '');
                    },
              icon: const Icon(Icons.person_add_alt_1_outlined),
              label: Text(context.ce('Add this teacher')),
            ),
          ],
        ),
      ),
    ],
  );

  Future<void> _removeTeacher(CeTeacher t) async {
    final before = store.setup;
    await store.removeTeacher(t.id);
    if (mounted) ceUndoSnack(context, context.ce('{name} removed.', {'name': t.name}), () => unawaited(store.replace(before)));
  }

  // --- 4. Bell times ------------------------------------------------------------------------

  Widget _bellsStep() => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      _heading(context.ce('When do the bells ring?'), context.ce('Pick ready times or set your own. They are used Monday to Saturday; each period on the timetable then starts from a bell.')),
      CeBellEditor(bells: _bells, onChanged: (b) => setState(() => _bells = b)),
    ],
  );

  // --- 5. PIN -------------------------------------------------------------------------------

  Widget _pinStep() => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      _heading(context.ce('The school PIN'), context.ce('Only staff who know it can change settings, teachers and the timetable. Teaching needs no PIN.')),
      if (store.pinIsDefault) ...[
        Text(context.ce('The PIN is still 1234, which everyone knows. Choose the college’s own now; you get a recovery code to print or save for when it is forgotten.'), style: ceText(18, c: CeC.body)),
        const SizedBox(height: 24),
        FilledButton.icon(
          key: const Key('ce-wizard-pin'),
          style: ceBigButton(),
          onPressed: () => unawaited(chooseNewPin(context, store, forced: true)),
          icon: const Icon(Icons.pin_outlined),
          label: Text(context.ce('Choose the PIN')),
        ),
      ] else ...[
        Row(
          children: [
            const Icon(Icons.verified_user_outlined, color: CeC.green, size: 32),
            const SizedBox(width: 12),
            Expanded(child: Text(context.ce('The school PIN is set. Keep the recovery code somewhere safe.'), key: const Key('ce-wizard-pin-set'), style: ceText(19, w: FontWeight.w600, c: CeC.navy))),
          ],
        ),
        const SizedBox(height: 20),
        OutlinedButton.icon(key: const Key('ce-wizard-change-pin'), style: ceSoftButton(), onPressed: () => unawaited(chooseNewPin(context, store)), icon: const Icon(Icons.pin_outlined), label: Text(context.ce('Change PIN'))),
      ],
    ],
  );

  // --- 6. Done ------------------------------------------------------------------------------

  Widget _doneStep() {
    final rows = [
      (Icons.account_balance_outlined, store.college.isEmpty ? context.ce('No college name') : store.college),
      (Icons.groups_outlined, context.ce('Classes: {n}', {'n': store.classes.length})),
      (Icons.people_alt_outlined, context.ce('Teachers: {n}', {'n': store.teachers.length})),
      (Icons.notifications_active_outlined, context.ce('Bell times: {n} periods a day', {'n': store.bells.length})),
    ];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _heading(context.ce('This board is ready'), context.ce('You can change any of this later in Settings (the button at the top right of the start screen).')),
        for (final (icon, text) in rows)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Row(children: [ceIconDot(icon, bg: CeC.mint, size: 48), const SizedBox(width: 16), Expanded(child: Text(text, style: ceText(20, w: FontWeight.w600, c: CeC.navy)))]),
          ),
        const SizedBox(height: 16),
        Text(context.ce('Next: add the periods of the week in Settings → Timetable, or start a class from the start screen now.'), style: ceText(18, c: CeC.body)),
        if (widget.firstRun) ...[
          const SizedBox(height: 16),
          Text(context.ce('New to the board? The short tour shows the Pen, Colours, Undo, Lessons and Class tools on a practice board (two minutes).'), style: ceText(18, c: CeC.body)),
        ],
      ],
    );
  }
}

/// Step 2 of 6 · "Classes" across the top, with a dot per step.
class _StepBar extends StatelessWidget {
  const _StepBar({required this.step, required this.titles});

  final int step;
  final List<String> titles;

  @override
  Widget build(BuildContext context) => Semantics(
    label: context.ce('Step {n} of {total}: {title}', {'n': step + 1, 'total': titles.length, 'title': titles[step]}),
    excludeSemantics: true,
    child: Padding(
      padding: const EdgeInsets.symmetric(horizontal: 48),
      child: Row(
        key: const Key('ce-wizard-steps'),
        children: [
          for (final (i, t) in titles.indexed) ...[
            if (i > 0) Expanded(child: Container(height: 3, color: i <= step ? CeC.accent : CeC.line)),
            Container(
              width: 40,
              height: 40,
              alignment: Alignment.center,
              decoration: BoxDecoration(color: i < step ? CeC.accent : (i == step ? CeC.navy : Colors.white), shape: BoxShape.circle, border: Border.all(color: i <= step ? CeC.navy : CeC.line, width: 2)),
              child: i < step ? const Icon(Icons.check, color: Colors.white, size: 22) : Text('${i + 1}', style: ceText(17, w: FontWeight.w700, c: i == step ? Colors.white : CeC.muted)),
            ),
            const SizedBox(width: 8),
            Text(t, style: ceText(16, w: i == step ? FontWeight.w700 : FontWeight.w500, c: i == step ? CeC.navy : CeC.muted)),
            const SizedBox(width: 8),
          ],
        ],
      ),
    ),
  );
}

/// A class or a teacher in the wizard, with a big Remove.
class _ItemCard extends StatelessWidget {
  const _ItemCard({super.key, this.icon, this.avatar, required this.colour, required this.title, required this.line, required this.removeLabel, required this.onRemove});

  final IconData? icon;
  final String? avatar;
  final Color colour;
  final String title;
  final String line;
  final String removeLabel;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) => Container(
    width: 340,
    padding: const EdgeInsets.fromLTRB(18, 12, 6, 12),
    decoration: BoxDecoration(color: colour, borderRadius: BorderRadius.circular(20)),
    child: Row(
      children: [
        if (avatar != null)
          CircleAvatar(radius: 24, backgroundColor: Colors.white, child: Text(avatar!, style: ceText(16, w: FontWeight.w700, c: CeC.navy)))
        else
          ceIconDot(icon ?? Icons.circle, size: 48),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, maxLines: 1, overflow: TextOverflow.ellipsis, style: ceText(19, w: FontWeight.w700, c: CeC.navy)),
              if (line.isNotEmpty) Text(line, maxLines: 1, overflow: TextOverflow.ellipsis, style: ceText(15, c: CeC.body)),
            ],
          ),
        ),
        IconButton(tooltip: removeLabel, onPressed: onRemove, icon: const Icon(Icons.delete_outline, color: CeC.red)),
      ],
    ),
  );
}

/// − 5, − 1, the number, + 1, + 5: big buttons, no typing (1 to [CeClass.maxRolls]).
class _Stepper extends StatelessWidget {
  const _Stepper({required this.value, required this.onChanged, required this.keyPrefix});

  final int value;
  final ValueChanged<int> onChanged;
  final String keyPrefix;

  @override
  Widget build(BuildContext context) {
    Widget b(int d) => Padding(
      padding: const EdgeInsets.symmetric(horizontal: 4),
      child: OutlinedButton(
        key: Key('$keyPrefix-${d > 0 ? 'plus' : 'minus'}-${d.abs()}'),
        style: ceSoftButton().copyWith(minimumSize: const WidgetStatePropertyAll(Size(84, ceTarget))),
        onPressed: () => onChanged((value + d).clamp(1, CeClass.maxRolls)),
        child: Text('${d > 0 ? '+' : '−'} ${d.abs()}'),
      ),
    );
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        b(-5),
        b(-1),
        Container(width: 110, alignment: Alignment.center, child: Text('$value', key: Key('$keyPrefix-value'), style: ceHeading(36))),
        b(1),
        b(5),
      ],
    );
  }
}

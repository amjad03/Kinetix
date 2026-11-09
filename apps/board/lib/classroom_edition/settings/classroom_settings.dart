import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../backup/backup_page.dart';
import '../local/classroom_store.dart';
import '../past_papers/papers_settings.dart';
import '../start/classroom_start.dart' show editTeacher;
import '../ui/ce_confirm.dart';
import '../ui/ce_style.dart';
import 'pin_pad.dart';

export 'pin_pad.dart' show askSchoolPin, chooseNewPin, CePinPad;

/// The Classroom edition's Settings: the college, teachers, classes (roll numbers), the
/// timetable and the school PIN. Opened after [askSchoolPin].
/// [onPair] (from the start screen) pairs the board with the Teacher App, for a college on the
/// ERP (Advanced); without it Advanced says to pair from the start screen.
Future<void> openClassroomSettings(BuildContext context, ClassroomStore store, {VoidCallback? onPair}) =>
    Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => ClassroomSettingsPage(store: store, onPair: onPair)));

class ClassroomSettingsPage extends StatefulWidget {
  const ClassroomSettingsPage({super.key, required this.store, this.onPair});

  final ClassroomStore store;
  final VoidCallback? onPair;

  @override
  State<ClassroomSettingsPage> createState() => _ClassroomSettingsPageState();
}

class _ClassroomSettingsPageState extends State<ClassroomSettingsPage> {
  ClassroomStore get store => widget.store;

  @override
  Widget build(BuildContext context) => Theme(
    data: ceTheme(context),
    child: DefaultTabController(
      length: 7,
      child: Scaffold(
        key: const Key('ce-settings-page'),
        backgroundColor: CeC.page,
        appBar: AppBar(
          backgroundColor: CeC.page,
          title: Text('College settings', style: ceHeading(24)),
          bottom: const TabBar(
            isScrollable: true,
            tabs: [
              Tab(key: Key('ce-tab-timetable'), text: 'Timetable'),
              Tab(key: Key('ce-tab-teachers'), text: 'Teachers'),
              Tab(key: Key('ce-tab-classes'), text: 'Classes'),
              Tab(key: Key('ce-tab-college'), text: 'College and PIN'),
              Tab(key: Key('ce-tab-backup'), text: 'Backup & restore'),
              Tab(key: Key('ce-tab-board'), text: 'This board'),
              Tab(key: Key('ce-tab-advanced'), text: 'Advanced'),
            ],
          ),
        ),
        body: ListenableBuilder(
          listenable: store,
          builder: (context, _) => TabBarView(children: [_timetable(), _teachers(), _classes(), _collegeTab(), BackupTab(store: store), _boardTab(), _advancedTab()]),
        ),
      ),
    ),
  );

  Widget _list(List<Widget> children, {required String add, required Key addKey, required VoidCallback onAdd, String? empty}) => ListView(
    padding: const EdgeInsets.all(Kx.s24),
    children: [
      Align(
        alignment: Alignment.centerLeft,
        child: FilledButton.icon(key: addKey, style: ceBigButton(), onPressed: onAdd, icon: const Icon(Icons.add), label: Text(add)),
      ),
      const SizedBox(height: Kx.s16),
      if (children.isEmpty && empty != null) Padding(padding: const EdgeInsets.all(Kx.s16), child: Text(empty, style: ceText(17))),
      ...children,
    ],
  );

  Widget _tile({required Key key, required Widget leading, required String title, String? subtitle, required VoidCallback onTap}) => Card(
    key: key,
    color: Colors.white,
    elevation: 0,
    margin: const EdgeInsets.only(bottom: Kx.s8),
    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
    child: ListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: Kx.s16, vertical: Kx.s4),
      leading: leading,
      title: Text(title, style: ceText(18, w: FontWeight.w600, c: CeC.navy)),
      subtitle: subtitle == null || subtitle.isEmpty ? null : Text(subtitle, style: ceText(15)),
      trailing: const Icon(Icons.edit_outlined),
      onTap: onTap,
    ),
  );

  // --- Teachers -----------------------------------------------------------------------------

  Widget _teachers() => _list(
    [
      for (final t in store.teachers)
        _tile(
          key: Key('ce-set-teacher-${t.id}'),
          leading: CircleAvatar(backgroundColor: CeC.pastel(t.colour), child: Text(KxAvatar.initials(t.name), style: ceText(15, w: FontWeight.w600, c: CeC.navy))),
          title: t.name,
          subtitle: [t.subject, store.classesOf(t.id)].where((x) => x.isNotEmpty).join(' · '),
          onTap: () => unawaited(editTeacher(context, store, t, pinChecked: true)),
        ),
    ],
    add: 'Add a teacher',
    addKey: const Key('ce-set-add-teacher'),
    onAdd: () => unawaited(editTeacher(context, store, null)),
    empty: 'No teachers yet. Add each teacher who uses this board; they tap their card to start a class.',
  );

  // --- Classes ------------------------------------------------------------------------------

  Widget _classes() => _list(
    [
      for (final c in store.classes)
        _tile(
          key: Key('ce-set-class-${c.id}'),
          leading: ceIconDot(Icons.groups_outlined, bg: CeC.pastel(c.year == 2 ? 1 : 3), size: 40),
          title: c.name,
          subtitle: [if (c.stream.isNotEmpty) c.stream, 'Roll numbers 1–${c.rollCount}'].join(' · '),
          onTap: () => unawaited(_editClass(c)),
        ),
    ],
    add: 'Add a class',
    addKey: const Key('ce-set-add-class'),
    onAdd: () => unawaited(_editClass(null)),
  );

  Future<void> _editClass(CeClass? c) async {
    var year = c?.year ?? 1;
    final section = TextEditingController(text: c?.section ?? '');
    final stream = TextEditingController(text: c?.stream ?? '');
    final rolls = TextEditingController(text: '${c?.rollCount ?? 40}');
    final result = await showDialog<String>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, set) => AlertDialog(
          key: const Key('ce-class-dialog'),
          title: Text(c == null ? 'Add a class' : 'Edit ${c.name}'),
          content: SizedBox(
            width: 480,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SegmentedButton<int>(
                  key: const Key('ce-class-year'),
                  segments: const [ButtonSegment(value: 1, label: Text('1st PUC')), ButtonSegment(value: 2, label: Text('2nd PUC'))],
                  selected: {year},
                  onSelectionChanged: (v) => set(() => year = v.single),
                ),
                const SizedBox(height: Kx.s12),
                TextField(key: const Key('ce-class-section'), controller: section, textCapitalization: TextCapitalization.characters, decoration: const InputDecoration(labelText: 'Section (A, B, C …)')),
                const SizedBox(height: Kx.s12),
                TextField(key: const Key('ce-class-stream'), controller: stream, textCapitalization: TextCapitalization.words, decoration: const InputDecoration(labelText: 'Stream (optional: Science, Commerce, Arts)')),
                const SizedBox(height: Kx.s12),
                TextField(
                  key: const Key('ce-class-rolls'),
                  controller: rolls,
                  keyboardType: TextInputType.number,
                  inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(3)],
                  decoration: const InputDecoration(labelText: 'Number of students (roll numbers 1 to …)', helperText: 'Only roll numbers are kept on this board, never names.'),
                ),
              ],
            ),
          ),
          actionsAlignment: MainAxisAlignment.spaceBetween,
          actions: [
            if (c != null) ceRemoveAction(key: const Key('ce-class-remove'), label: 'Remove class…', onPressed: () => Navigator.pop(ctx, 'remove')) else const SizedBox(),
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
                const SizedBox(width: Kx.s8),
                FilledButton(key: const Key('ce-class-save'), onPressed: () => Navigator.pop(ctx, 'save'), child: const Text('Save')),
              ],
            ),
          ],
        ),
      ),
    );
    if (result == 'remove' && c != null) return _removeClass(c);
    if (result != 'save' || section.text.trim().isEmpty) return;
    final n = int.tryParse(rolls.text) ?? 40;
    if (c == null) {
      await store.addClass(year: year, section: section.text, stream: stream.text, rollCount: n);
    } else {
      await store.updateClass(c.copyWith(year: year, section: section.text.trim().toUpperCase(), stream: stream.text.trim(), rollCount: n));
    }
  }

  Future<void> _removeClass(CeClass c) async {
    final periods = store.slots.where((s) => s.classId == c.id).length;
    final ok = await ceConfirmRemove(
      context,
      title: 'Remove ${c.name}?',
      body: [
        if (periods > 0) 'Its $periods ${periods == 1 ? 'period comes' : 'periods come'} off the timetable.' else 'It has no periods on the timetable.',
        'Its marks, mock tests and lesson progress stay saved on this board but are not shown while the class is gone.',
      ].join(' '),
      confirm: 'Remove class',
    );
    if (!ok || !mounted) return;
    final before = store.setup;
    await store.removeClass(c.id);
    if (mounted) ceUndoSnack(context, '${c.name} removed.', () => unawaited(store.replace(before)));
  }

  // --- Timetable ----------------------------------------------------------------------------

  static const _days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  Widget _timetable() {
    final byDay = <int, List<CeSlot>>{};
    for (final s in store.slots) {
      (byDay[s.weekday] ??= []).add(s);
    }
    return _list(
      [
        for (var d = 1; d <= 7; d++)
          if (byDay[d] != null) ...[
            Padding(padding: const EdgeInsets.only(top: Kx.s12, bottom: Kx.s8), child: Text(_days[d - 1], style: ceHeading(20))),
            for (final s in byDay[d]!..sort((a, b) => a.startMinute.compareTo(b.startMinute)))
              _tile(
                key: Key('ce-set-slot-${s.id}'),
                leading: Text('${s.start}\n${s.end}', style: ceText(14, w: FontWeight.w600, c: CeC.navy)),
                title: [store.classById(s.classId)?.name ?? '?', s.subject].where((x) => x.isNotEmpty).join(' · '),
                subtitle: [store.teacher(s.teacherId)?.name ?? 'No teacher', s.room, s.topic].where((x) => x.isNotEmpty).join(' · '),
                onTap: () => unawaited(_editSlot(s)),
              ),
          ],
      ],
      add: 'Add a period',
      addKey: const Key('ce-set-add-slot'),
      onAdd: () => unawaited(_editSlot(null)),
      empty: 'No periods yet. Add each period of the week; "Start my class" then opens the period on now.',
    );
  }

  Future<void> _editSlot(CeSlot? s) async {
    if (store.classes.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Add a class first.')));
      return;
    }
    var weekday = s?.weekday ?? store.now().weekday.clamp(1, 6);
    var classId = s?.classId ?? store.classes.first.id;
    String? teacherId = s?.teacherId;
    final start = TextEditingController(text: s?.start ?? '09:00');
    final end = TextEditingController(text: s?.end ?? '09:55');
    final subject = TextEditingController(text: s?.subject ?? store.teacher(teacherId)?.subject ?? '');
    final room = TextEditingController(text: s?.room ?? '');
    final topic = TextEditingController(text: s?.topic ?? '');
    final time = RegExp(r'^([01]?\d|2[0-3]):[0-5]\d$');
    String? error;
    final result = await showDialog<String>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, set) => AlertDialog(
          key: const Key('ce-slot-dialog'),
          title: Text(s == null ? 'Add a period' : 'Edit period'),
          content: SizedBox(
            width: 560,
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Wrap(
                    spacing: 6,
                    children: [
                      for (var d = 1; d <= 7; d++) ChoiceChip(key: Key('ce-slot-day-$d'), label: Text(_days[d - 1]), selected: weekday == d, onSelected: (_) => set(() => weekday = d)),
                    ],
                  ),
                  const SizedBox(height: Kx.s12),
                  Row(
                    children: [
                      Expanded(child: TextField(key: const Key('ce-slot-start'), controller: start, decoration: const InputDecoration(labelText: 'Starts (HH:MM)'))),
                      const SizedBox(width: Kx.s12),
                      Expanded(child: TextField(key: const Key('ce-slot-end'), controller: end, decoration: const InputDecoration(labelText: 'Ends (HH:MM)'))),
                    ],
                  ),
                  const SizedBox(height: Kx.s12),
                  DropdownButtonFormField<String>(
                    key: const Key('ce-slot-class'),
                    initialValue: classId,
                    decoration: const InputDecoration(labelText: 'Class'),
                    items: [for (final c in store.classes) DropdownMenuItem(value: c.id, child: Text(c.name))],
                    onChanged: (v) => set(() => classId = v ?? classId),
                  ),
                  const SizedBox(height: Kx.s12),
                  DropdownButtonFormField<String?>(
                    key: const Key('ce-slot-teacher'),
                    initialValue: teacherId,
                    decoration: const InputDecoration(labelText: 'Teacher'),
                    items: [
                      const DropdownMenuItem<String?>(value: null, child: Text('No teacher')),
                      for (final t in store.teachers) DropdownMenuItem<String?>(value: t.id, child: Text(t.name)),
                    ],
                    onChanged: (v) => set(() {
                      teacherId = v;
                      if (subject.text.trim().isEmpty) subject.text = store.teacher(v)?.subject ?? '';
                    }),
                  ),
                  const SizedBox(height: Kx.s12),
                  TextField(key: const Key('ce-slot-subject'), controller: subject, textCapitalization: TextCapitalization.words, decoration: const InputDecoration(labelText: 'Subject')),
                  const SizedBox(height: Kx.s12),
                  TextField(key: const Key('ce-slot-room'), controller: room, decoration: const InputDecoration(labelText: 'Room (optional)')),
                  const SizedBox(height: Kx.s12),
                  TextField(key: const Key('ce-slot-topic'), controller: topic, decoration: const InputDecoration(labelText: 'Chapter or topic (optional)')),
                  if (error != null) Padding(padding: const EdgeInsets.only(top: Kx.s12), child: Text(error!, style: TextStyle(color: Theme.of(ctx).colorScheme.error))),
                ],
              ),
            ),
          ),
          actionsAlignment: MainAxisAlignment.spaceBetween,
          actions: [
            if (s != null) ceRemoveAction(key: const Key('ce-slot-remove'), label: 'Remove period…', onPressed: () => Navigator.pop(ctx, 'remove')) else const SizedBox(),
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
            const SizedBox(width: Kx.s8),
            FilledButton(
              key: const Key('ce-slot-save'),
              onPressed: () {
                final a = start.text.trim(), b = end.text.trim();
                if (!time.hasMatch(a) || !time.hasMatch(b) || CeSlot.minuteOf(b) <= CeSlot.minuteOf(a)) {
                  set(() => error = 'Times are HH:MM on a 24-hour clock, and the period must end after it starts.');
                  return;
                }
                Navigator.pop(ctx, 'save');
              },
              child: const Text('Save'),
            ),
              ],
            ),
          ],
        ),
      ),
    );
    if (result == 'remove' && s != null) return _removeSlot(s);
    if (result != 'save') return;
    String pad(String t) => t.trim().padLeft(5, '0');
    final slot = CeSlot(
      id: s?.id ?? '',
      weekday: weekday,
      start: pad(start.text),
      end: pad(end.text),
      classId: classId,
      subject: subject.text.trim(),
      teacherId: teacherId,
      room: room.text.trim(),
      topic: topic.text.trim(),
    );
    if (s == null) {
      await store.addSlot(slot);
    } else {
      await store.updateSlot(slot);
    }
  }

  Future<void> _removeSlot(CeSlot s) async {
    final what = [store.classById(s.classId)?.name, s.subject].whereType<String>().where((x) => x.isNotEmpty).join(' · ');
    final when = '${_longDays[s.weekday - 1]} ${CeSlot.short(s.start)}–${CeSlot.short(s.end)}';
    final ok = await ceConfirmRemove(
      context,
      title: 'Remove this period?',
      body: '$when${what.isEmpty ? '' : ', $what'}, comes off the timetable. “Start my class” no longer opens it.',
      confirm: 'Remove period',
    );
    if (!ok || !mounted) return;
    final before = store.setup;
    await store.removeSlot(s.id);
    if (mounted) ceUndoSnack(context, 'Period removed.', () => unawaited(store.replace(before)));
  }

  static const _longDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  // --- College and PIN ----------------------------------------------------------------------

  late final _collegeName = TextEditingController(text: store.college);

  Widget _collegeTab() => ListView(
    padding: const EdgeInsets.all(Kx.s24),
    children: [
      Text('College name', style: ceHeading(20)),
      const SizedBox(height: Kx.s8),
      Row(
        children: [
          Expanded(child: TextField(key: const Key('ce-college-name'), controller: _collegeName, textCapitalization: TextCapitalization.words, decoration: const InputDecoration(hintText: 'e.g. Soundarya PU College'))),
          const SizedBox(width: Kx.s12),
          FilledButton(
            key: const Key('ce-college-save'),
            onPressed: () async {
              await store.replace(store.setup.copyWith(college: _collegeName.text.trim()));
              if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Saved')));
            },
            child: const Text('Save'),
          ),
        ],
      ),
      const SizedBox(height: Kx.s32),
      Text('School PIN', style: ceHeading(20)),
      const SizedBox(height: Kx.s8),
      Text(
        store.pinIsDefault
            ? 'The PIN is still 1234. Choose the college’s own PIN.'
            : 'Only staff who know the PIN can change these settings. After 5 wrong PINs the board waits a minute, and longer after each one more.'
                  '${store.hasRecoveryCode ? '' : ' Change the PIN once to get a recovery code for when it is forgotten.'}',
        style: ceText(16),
      ),
      const SizedBox(height: Kx.s12),
      Align(
        alignment: Alignment.centerLeft,
        child: OutlinedButton.icon(key: const Key('ce-change-pin'), style: ceSoftButton(), onPressed: () => unawaited(_changePin()), icon: const Icon(Icons.pin_outlined), label: const Text('Change PIN')),
      ),
      const SizedBox(height: Kx.s32),
      const PastPapersSettingsEntry(),
    ],
  );

  // --- This board ---------------------------------------------------------------------------

  Widget _boardTab() => ListView(
    padding: const EdgeInsets.all(Kx.s24),
    children: [
      Text('Screen size', style: ceHeading(20)),
      const SizedBox(height: Kx.s8),
      Text('How big buttons and writing are on this board. Saved on this board only.', style: ceText(16)),
      const SizedBox(height: Kx.s12),
      Wrap(
        spacing: Kx.s12,
        runSpacing: Kx.s12,
        children: [
          for (final (s, label, sample) in [(CeScreenSize.smaller, 'Smaller', 20.0), (CeScreenSize.normal, 'Normal', 26.0), (CeScreenSize.larger, 'Larger', 32.0)])
            _SizeChoice(key: Key('ce-screen-size-${s.name}'), label: label, sample: sample, selected: store.screenSize == s, onTap: () => unawaited(store.setScreenSize(s))),
        ],
      ),
    ],
  );

  // --- Advanced -----------------------------------------------------------------------------

  Widget _advancedTab() => ListView(
    padding: const EdgeInsets.all(Kx.s24),
    children: [
      Text('Pair with the Teacher App', style: ceHeading(20)),
      const SizedBox(height: Kx.s8),
      Text(
        'Only for a college that also uses the Zynetix ERP. This board works fully without it: classes, '
        'timetable, lessons and class tools all stay on the board.',
        style: ceText(16),
      ),
      const SizedBox(height: Kx.s12),
      Align(
        alignment: Alignment.centerLeft,
        child: OutlinedButton.icon(
          key: const Key('ce-pair'),
          style: ceSoftButton(),
          onPressed: widget.onPair,
          icon: const Icon(Icons.phonelink_ring_outlined),
          label: const Text('Pair with Teacher App'),
        ),
      ),
      if (widget.onPair == null) ...[
        const SizedBox(height: Kx.s8),
        Text('End the class and open Settings from the start screen to pair.', style: ceText(15)),
      ],
    ],
  );

  Future<void> _changePin() async {
    if (await chooseNewPin(context, store) && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('The school PIN is changed.')));
    }
  }
}

/// One of Smaller / Normal / Larger: a big card with "Aa" at that size.
class _SizeChoice extends StatelessWidget {
  const _SizeChoice({super.key, required this.label, required this.sample, required this.selected, required this.onTap});

  final String label;
  final double sample;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Semantics(
    button: true,
    selected: selected,
    label: label,
    excludeSemantics: true,
    child: Material(
      color: selected ? CeC.blue : Colors.white,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20), side: BorderSide(color: selected ? CeC.accent : CeC.line, width: selected ? 3 : 1.5)),
      child: InkWell(
        borderRadius: BorderRadius.circular(20),
        onTap: onTap,
        child: SizedBox(
          width: 200,
          height: 120,
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text('Aa', style: ceHeading(sample)),
              const SizedBox(height: 6),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  if (selected) ...[const Icon(Icons.check_circle, color: CeC.accent, size: 22), const SizedBox(width: 6)],
                  Text(label, style: ceText(17, w: FontWeight.w600, c: CeC.navy)),
                ],
              ),
            ],
          ),
        ),
      ),
    ),
  );
}

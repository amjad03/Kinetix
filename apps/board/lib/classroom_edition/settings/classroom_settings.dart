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
import '../start/setup_wizard.dart' show openSetupWizard;
import 'timetable_editor.dart';
import '../l10n/ce_strings.dart';

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
  Widget build(BuildContext context) {
    context.ceDependOnLanguage();
    return Theme(
    data: ceTheme(context),
    child: DefaultTabController(
      length: 7,
      child: Scaffold(
        key: const Key('ce-settings-page'),
        backgroundColor: CeC.page,
        appBar: AppBar(
          backgroundColor: CeC.page,
          title: Text(context.ce('College settings'), style: ceHeading(24)),
          bottom: TabBar(
            isScrollable: true,
            tabs: [
              Tab(key: Key('ce-tab-timetable'), height: ceTarget, text: context.ce('Timetable')),
              Tab(key: Key('ce-tab-teachers'), height: ceTarget, text: context.ce('Teachers')),
              Tab(key: Key('ce-tab-classes'), height: ceTarget, text: context.ce('Classes')),
              Tab(key: Key('ce-tab-college'), height: ceTarget, text: context.ce('College and PIN')),
              Tab(key: Key('ce-tab-backup'), height: ceTarget, text: context.ce('Backup & restore')),
              Tab(key: Key('ce-tab-board'), height: ceTarget, text: context.ce('This board')),
              Tab(key: Key('ce-tab-advanced'), height: ceTarget, text: context.ce('Advanced')),
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
  }

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
    add: context.ce('Add a teacher'),
    addKey: const Key('ce-set-add-teacher'),
    onAdd: () => unawaited(editTeacher(context, store, null)),
    empty: context.ce('No teachers yet. Add each teacher who uses this board; they tap their card to start a class.'),
  );

  // --- Classes ------------------------------------------------------------------------------

  Widget _classes() => _list(
    [
      for (final c in store.classes)
        _tile(
          key: Key('ce-set-class-${c.id}'),
          leading: ceIconDot(Icons.groups_outlined, bg: CeC.pastel(c.year == 2 ? 1 : 3), size: 40),
          title: c.name,
          subtitle: [if (c.stream.isNotEmpty) c.stream, context.ce('Roll numbers 1–{n}', {'n': c.rollCount})].join(' · '),
          onTap: () => unawaited(_editClass(c)),
        ),
    ],
    add: context.ce('Add a class'),
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
          title: Text(c == null ? context.ce('Add a class') : context.ce('Edit {name}', {'name': c.name})),
          content: SizedBox(
            width: 480,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SegmentedButton<int>(
                  key: const Key('ce-class-year'),
                  segments: [ButtonSegment(value: 1, label: Text(context.ce('1st PUC'))), ButtonSegment(value: 2, label: Text(context.ce('2nd PUC')))],
                  selected: {year},
                  onSelectionChanged: (v) => set(() => year = v.single),
                ),
                const SizedBox(height: Kx.s12),
                TextField(key: Key('ce-class-section'), controller: section, textCapitalization: TextCapitalization.characters, decoration: InputDecoration(labelText: context.ce('Section (A, B, C …)'))),
                const SizedBox(height: Kx.s12),
                TextField(key: Key('ce-class-stream'), controller: stream, textCapitalization: TextCapitalization.words, decoration: InputDecoration(labelText: context.ce('Stream (optional: Science, Commerce, Arts)'))),
                const SizedBox(height: Kx.s12),
                TextField(
                  key: const Key('ce-class-rolls'),
                  controller: rolls,
                  keyboardType: TextInputType.number,
                  inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(3)],
                  decoration: InputDecoration(labelText: context.ce('Number of students (roll numbers 1 to …)'), helperText: context.ce('Only roll numbers are kept on this board, never names.')),
                ),
              ],
            ),
          ),
          actionsAlignment: MainAxisAlignment.spaceBetween,
          actions: [
            if (c != null) ceRemoveAction(key: Key('ce-class-remove'), label: context.ce('Remove class…'), onPressed: () => Navigator.pop(ctx, 'remove')) else const SizedBox(),
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextButton(onPressed: () => Navigator.pop(ctx), child: Text(context.ce('Cancel'))),
                const SizedBox(width: Kx.s8),
                FilledButton(key: Key('ce-class-save'), onPressed: () => Navigator.pop(ctx, 'save'), child: Text(context.ce('Save'))),
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
      title: context.ce('Remove {name}?', {'name': c.name}),
      body: [
        if (periods == 1) context.ce('Its 1 period comes off the timetable.') else if (periods > 1) context.ce('Its {n} periods come off the timetable.', {'n': periods}) else context.ce('It has no periods on the timetable.'),
        context.ce('Its marks, mock tests and lesson progress stay saved on this board but are not shown while the class is gone.'),
      ].join(' '),
      confirm: context.ce('Remove class'),
    );
    if (!ok || !mounted) return;
    final before = store.setup;
    await store.removeClass(c.id);
    if (mounted) ceUndoSnack(context, context.ce('{name} removed.', {'name': c.name}), () => unawaited(store.replace(before)));
  }

  // --- Timetable ----------------------------------------------------------------------------

  /// The week, Monday to Saturday (Sunday too when it has periods): each day with its periods,
  /// Add a period, Copy this day to… and Clear day; the bell times above; clashes marked.
  Widget _timetable() {
    final byDay = <int, List<CeSlot>>{};
    for (final s in store.slots) {
      (byDay[s.weekday] ??= []).add(s);
    }
    Widget dayAction(String key, IconData icon, String label, VoidCallback onTap) => Padding(
      padding: const EdgeInsets.only(left: Kx.s8),
      child: OutlinedButton.icon(key: Key(key), style: ceSoftButton(), onPressed: onTap, icon: Icon(icon), label: Text(label)),
    );
    // A whole week is a few dozen rows: all built at once, so every day is there to scroll to.
    return SingleChildScrollView(
      key: const Key('ce-timetable'),
      padding: const EdgeInsets.all(Kx.s24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
        Align(
          alignment: Alignment.centerLeft,
          child: FilledButton.icon(key: const Key('ce-set-add-slot'), style: ceBigButton(), onPressed: () => unawaited(_editSlot(null)), icon: const Icon(Icons.add), label: Text(context.ce('Add a period'))),
        ),
        const SizedBox(height: Kx.s16),
        Container(
          key: const Key('ce-bells-card'),
          padding: const EdgeInsets.all(Kx.s16),
          decoration: ceCard(r: 20, shadow: false),
          child: Row(
            children: [
              ceIconDot(Icons.notifications_active_outlined, bg: CeC.butter, size: 48),
              const SizedBox(width: Kx.s16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(context.ce('Bell times'), style: ceHeading(20)),
                    const SizedBox(height: 4),
                    Text(store.bells.isEmpty ? context.ce('None yet. Set them once and every new period offers them.') : store.bells.map(ceBellLabel).join('   ·   '), style: ceText(15)),
                  ],
                ),
              ),
              OutlinedButton.icon(key: const Key('ce-bells-edit'), style: ceSoftButton(), onPressed: () => unawaited(_editBells()), icon: const Icon(Icons.edit_calendar_outlined), label: Text(context.ce('Change bell times'))),
            ],
          ),
        ),
        if (store.hasClashes)
          Padding(
            padding: const EdgeInsets.only(top: Kx.s16),
            child: _clashBox(context.ce('Some periods clash: the same teacher or class twice at the same time. They are marked below.'), key: const Key('ce-timetable-clashes')),
          ),
        if (store.classes.isEmpty) Padding(padding: const EdgeInsets.all(Kx.s16), child: Text(context.ce('Add a class first.'), style: ceText(17))),
        for (var d = 1; d <= 7; d++)
          if (d <= 6 || byDay[d] != null) ...[
            Padding(
              padding: const EdgeInsets.only(top: Kx.s24, bottom: Kx.s8),
              child: Wrap(
                crossAxisAlignment: WrapCrossAlignment.center,
                runSpacing: Kx.s8,
                children: [
                  ConstrainedBox(constraints: const BoxConstraints(minWidth: 180), child: Text(ceDay(context, d), key: Key('ce-day-$d'), style: ceHeading(22))),
                  dayAction('ce-day-add-$d', Icons.add, context.ce('Add a period'), () => unawaited(_editSlot(null, day: d))),
                  if (byDay[d] != null) ...[
                    dayAction('ce-day-copy-$d', Icons.copy_all_outlined, context.ce('Copy this day to…'), () => unawaited(copyDayAsking(context, store, d))),
                    dayAction('ce-day-clear-$d', Icons.clear_all_rounded, context.ce('Clear day'), () => unawaited(clearDayAsking(context, store, d))),
                  ],
                ],
              ),
            ),
            if (byDay[d] == null) Padding(padding: const EdgeInsets.only(left: Kx.s8, bottom: Kx.s8), child: Text(context.ce('No periods.'), style: ceText(15))),
            for (final s in (byDay[d] ?? <CeSlot>[])..sort((a, b) => a.startMinute.compareTo(b.startMinute)))
              _slotTile(s),
          ],
        ],
      ),
    );
  }

  Widget _clashBox(String text, {Key? key}) => Container(
    key: key,
    padding: const EdgeInsets.all(Kx.s12),
    decoration: BoxDecoration(color: CeC.butter, borderRadius: BorderRadius.circular(14), border: Border.all(color: CeC.warning, width: 1.5)),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Icon(Icons.warning_amber_rounded, color: Color(0xFF92400E)),
        const SizedBox(width: Kx.s8),
        Expanded(child: Text(text, style: ceText(16, w: FontWeight.w600, c: CeC.warningText))),
      ],
    ),
  );

  Widget _slotTile(CeSlot s) {
    final clash = ceClashLine(store, s);
    return Card(
      key: Key('ce-set-slot-${s.id}'),
      color: Colors.white,
      elevation: 0,
      margin: const EdgeInsets.only(bottom: Kx.s8),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18), side: clash.isEmpty ? BorderSide.none : const BorderSide(color: Color(0xFFB45309), width: 2)),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: Kx.s16, vertical: Kx.s4),
        leading: SizedBox(width: 92, child: Text('${CeSlot.short(s.start)} –\n${CeSlot.short(s.end)}', style: ceText(16, w: FontWeight.w700, c: CeC.navy))),
        title: Text([store.classById(s.classId)?.name ?? '?', s.subject].where((x) => x.isNotEmpty).join(' · '), style: ceText(18, w: FontWeight.w600, c: CeC.navy)),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text([store.teacher(s.teacherId)?.name ?? context.ce('No teacher'), s.room, s.topic].where((x) => x.isNotEmpty).join(' · '), style: ceText(15)),
            if (clash.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Row(
                  key: Key('ce-slot-clash-${s.id}'),
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Icon(Icons.warning_amber_rounded, size: 20, color: Color(0xFF92400E)),
                    const SizedBox(width: 6),
                    Expanded(child: Text('${context.ce('Clashes with')} $clash', style: ceText(15, w: FontWeight.w600, c: CeC.warningText))),
                  ],
                ),
              ),
          ],
        ),
        trailing: const Icon(Icons.edit_outlined),
        onTap: () => unawaited(_editSlot(s)),
      ),
    );
  }

  Future<bool> _confirmClash(BuildContext ctx, String clash) async =>
      await showDialog<bool>(
        context: ctx,
        builder: (c) => AlertDialog(
          key: const Key('ce-clash-confirm'),
          icon: const Icon(Icons.warning_amber_rounded, size: 40, color: Color(0xFF92400E)),
          title: Text(ceTr('Save a period that clashes?')),
          content: SizedBox(width: 560, child: Text('${ceTr('This period clashes with')}\n$clash', style: ceText(17, c: CeC.navy))),
          actions: [
            TextButton(key: const Key('ce-clash-back'), onPressed: () => Navigator.pop(c, false), child: Text(ceTr('Go back and change it'))),
            FilledButton(key: const Key('ce-clash-save'), onPressed: () => Navigator.pop(c, true), child: Text(ceTr('Save anyway'))),
          ],
        ),
      ) ??
      false;

  Future<void> _editBells() async {
    var bells = store.bells;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, set) => AlertDialog(
          key: const Key('ce-bells-dialog'),
          title: Text(context.ce('Bell times, Monday to Saturday')),
          content: SizedBox(width: 720, child: SingleChildScrollView(child: CeBellEditor(bells: bells, onChanged: (b) => set(() => bells = b)))),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(context.ce('Cancel'))),
            FilledButton(key: const Key('ce-bells-save'), onPressed: () => Navigator.pop(ctx, true), child: Text(context.ce('Save'))),
          ],
        ),
      ),
    );
    if (ok == true) await store.setBells(bells);
  }

  /// Add (or edit [s]) a period: the day, its time from the bell times or the touch time picker
  /// (no typing), class, teacher, subject, room and topic. Clashes are shown as they appear;
  /// saving one asks first.
  Future<void> _editSlot(CeSlot? s, {int? day}) async {
    if (store.classes.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(context.ce('Add a class first.'))));
      return;
    }
    var weekday = s?.weekday ?? day ?? store.now().weekday.clamp(1, 6);
    var classId = s?.classId ?? store.classes.first.id;
    String? teacherId = s?.teacherId;
    // A new period takes the first bell not yet used that day.
    final usedStarts = {for (final x in store.slots.where((x) => x.weekday == weekday)) x.start};
    final firstFree = store.bells.where((b) => !usedStarts.contains(b.start)).firstOrNull;
    var start = s?.start ?? firstFree?.start ?? '09:00';
    var end = s?.end ?? firstFree?.end ?? '09:55';
    final subject = TextEditingController(text: s?.subject ?? store.teacher(teacherId)?.subject ?? '');
    final room = TextEditingController(text: s?.room ?? '');
    final topic = TextEditingController(text: s?.topic ?? '');
    CeSlot draft() => CeSlot(id: s?.id ?? '', weekday: weekday, start: start, end: end, classId: classId, subject: subject.text.trim(), teacherId: teacherId, room: room.text.trim(), topic: topic.text.trim());
    final result = await showDialog<String>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, set) {
          final bad = CeSlot.minuteOf(end) <= CeSlot.minuteOf(start);
          final clash = bad ? '' : ceClashLine(store, draft());
          return AlertDialog(
            key: const Key('ce-slot-dialog'),
            title: Text(s == null ? context.ce('Add a period') : context.ce('Edit period')),
            content: SizedBox(
              width: 640,
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        for (var d = 1; d <= 7; d++) ChoiceChip(key: Key('ce-slot-day-$d'), label: Text(ceDay(context, d, short: true)), selected: weekday == d, onSelected: (_) => set(() => weekday = d)),
                      ],
                    ),
                    if (store.bells.isNotEmpty) ...[
                      const SizedBox(height: Kx.s16),
                      Text(context.ce('Bell times'), style: ceText(15, w: FontWeight.w600, c: CeC.navy)),
                      const SizedBox(height: Kx.s8),
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          for (final (i, b) in store.bells.indexed)
                            ChoiceChip(
                              key: Key('ce-slot-bell-$i'),
                              label: Text(ceBellLabel(b)),
                              selected: b.start == start && b.end == end,
                              onSelected: (_) => set(() {
                                start = b.start;
                                end = b.end;
                              }),
                            ),
                        ],
                      ),
                    ],
                    const SizedBox(height: Kx.s16),
                    Wrap(
                      spacing: Kx.s12,
                      runSpacing: Kx.s12,
                      children: [
                        CeTimeButton(key: const Key('ce-slot-start'), label: context.ce('Starts'), value: start, onChanged: (v) => set(() => start = v)),
                        CeTimeButton(key: const Key('ce-slot-end'), label: context.ce('Ends'), value: end, onChanged: (v) => set(() => end = v)),
                      ],
                    ),
                    if (bad) Padding(padding: const EdgeInsets.only(top: Kx.s8), child: Text(context.ce('The period must end after it starts.'), key: const Key('ce-slot-time-error'), style: ceText(16, w: FontWeight.w600, c: CeC.red))),
                    const SizedBox(height: Kx.s16),
                    DropdownButtonFormField<String>(
                      key: const Key('ce-slot-class'),
                      initialValue: classId,
                      decoration: InputDecoration(labelText: context.ce('Class')),
                      items: [for (final c in store.classes) DropdownMenuItem(value: c.id, child: Text(c.name))],
                      onChanged: (v) => set(() => classId = v ?? classId),
                    ),
                    const SizedBox(height: Kx.s12),
                    DropdownButtonFormField<String?>(
                      key: const Key('ce-slot-teacher'),
                      initialValue: teacherId,
                      decoration: InputDecoration(labelText: context.ce('Teacher')),
                      items: [
                        DropdownMenuItem<String?>(value: null, child: Text(context.ce('No teacher'))),
                        for (final t in store.teachers) DropdownMenuItem<String?>(value: t.id, child: Text(t.name)),
                      ],
                      onChanged: (v) => set(() {
                        teacherId = v;
                        if (subject.text.trim().isEmpty) subject.text = store.teacher(v)?.subject ?? '';
                      }),
                    ),
                    const SizedBox(height: Kx.s12),
                    TextField(key: const Key('ce-slot-subject'), controller: subject, textCapitalization: TextCapitalization.words, decoration: InputDecoration(labelText: context.ce('Subject'))),
                    const SizedBox(height: Kx.s12),
                    TextField(key: const Key('ce-slot-room'), controller: room, decoration: InputDecoration(labelText: context.ce('Room (optional)'))),
                    const SizedBox(height: Kx.s12),
                    TextField(key: const Key('ce-slot-topic'), controller: topic, decoration: InputDecoration(labelText: context.ce('Chapter or topic (optional)'))),
                    if (clash.isNotEmpty) ...[
                      const SizedBox(height: Kx.s12),
                      _clashBox('${context.ce('This period clashes with')}\n$clash', key: const Key('ce-slot-clash')),
                    ],
                  ],
                ),
              ),
            ),
            actionsAlignment: MainAxisAlignment.spaceBetween,
            actions: [
              if (s != null) ceRemoveAction(key: const Key('ce-slot-remove'), label: context.ce('Remove period…'), onPressed: () => Navigator.pop(ctx, 'remove')) else const SizedBox(),
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  TextButton(onPressed: () => Navigator.pop(ctx), child: Text(context.ce('Cancel'))),
                  const SizedBox(width: Kx.s8),
                  FilledButton(
                    key: const Key('ce-slot-save'),
                    onPressed: bad
                        ? null
                        : () async {
                            // A clash is allowed (a combined class, a lab), but only on purpose.
                            if (clash.isNotEmpty && !await _confirmClash(ctx, clash)) return;
                            if (ctx.mounted) Navigator.pop(ctx, 'save');
                          },
                    child: Text(context.ce('Save')),
                  ),
                ],
              ),
            ],
          );
        },
      ),
    );
    if (!mounted) return;
    if (result == 'remove' && s != null) return _removeSlot(s);
    if (result != 'save') return;
    final slot = draft();
    if (s == null) {
      await store.addSlot(slot);
    } else {
      await store.updateSlot(slot);
    }
  }

  Future<void> _removeSlot(CeSlot s) async {
    final what = [store.classById(s.classId)?.name, s.subject].whereType<String>().where((x) => x.isNotEmpty).join(' · ');
    final when = '${ceDay(context, s.weekday)} ${CeSlot.short(s.start)}–${CeSlot.short(s.end)}';
    final ok = await ceConfirmRemove(
      context,
      title: context.ce('Remove this period?'),
      body: context.ce('{when}, comes off the timetable. “Start my class” no longer opens it.', {'when': what.isEmpty ? when : '$when, $what'}),
      confirm: context.ce('Remove period'),
    );
    if (!ok || !mounted) return;
    final before = store.setup;
    await store.removeSlot(s.id);
    if (mounted) ceUndoSnack(context, context.ce('Period removed.'), () => unawaited(store.replace(before)));
  }


  // --- College and PIN ----------------------------------------------------------------------

  late final _collegeName = TextEditingController(text: store.college);

  Widget _collegeTab() => ListView(
    padding: const EdgeInsets.all(Kx.s24),
    children: [
      Text(context.ce('College name'), style: ceHeading(20)),
      const SizedBox(height: Kx.s8),
      Row(
        children: [
          Expanded(child: TextField(key: Key('ce-college-name'), controller: _collegeName, textCapitalization: TextCapitalization.words, decoration: InputDecoration(hintText: context.ce('e.g. Soundarya PU College')))),
          const SizedBox(width: Kx.s12),
          FilledButton(
            key: const Key('ce-college-save'),
            onPressed: () async {
              await store.replace(store.setup.copyWith(college: _collegeName.text.trim()));
              if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(context.ce('Saved'))));
            },
            child: Text(context.ce('Save')),
          ),
        ],
      ),
      const SizedBox(height: Kx.s32),
      Text(context.ce('School PIN'), style: ceHeading(20)),
      const SizedBox(height: Kx.s8),
      Text(
        store.pinIsDefault
            ? context.ce('The PIN is still 1234. Choose the college’s own PIN.')
            : [
                context.ce('Only staff who know the PIN can change these settings. After 5 wrong PINs the board waits a minute, and longer after each one more.'),
                if (!store.hasRecoveryCode) context.ce('Change the PIN once to get a recovery code for when it is forgotten.'),
              ].join(' '),
        style: ceText(16),
      ),
      const SizedBox(height: Kx.s12),
      Align(
        alignment: Alignment.centerLeft,
        child: OutlinedButton.icon(key: Key('ce-change-pin'), style: ceSoftButton(), onPressed: () => unawaited(_changePin()), icon: Icon(Icons.pin_outlined), label: Text(context.ce('Change PIN'))),
      ),
      const SizedBox(height: Kx.s32),
      const PastPapersSettingsEntry(),
    ],
  );

  // --- This board ---------------------------------------------------------------------------

  Widget _boardTab() => ListView(
    padding: const EdgeInsets.all(Kx.s24),
    children: [
      Text(context.ce('Set-up'), style: ceHeading(20)),
      const SizedBox(height: Kx.s8),
      Text(context.ce('Go through the college, classes, teachers, bell times and PIN again, one step at a time.'), style: ceText(16)),
      const SizedBox(height: Kx.s12),
      Align(
        alignment: Alignment.centerLeft,
        child: OutlinedButton.icon(key: const Key('ce-rerun-setup'), style: ceSoftButton(), onPressed: () => unawaited(openSetupWizard(context, store)), icon: const Icon(Icons.auto_fix_high_outlined), label: Text(context.ce('Run the set-up again'))),
      ),
      const SizedBox(height: Kx.s32),
      Text(context.ce('Screen size'), style: ceHeading(20)),
      const SizedBox(height: Kx.s8),
      Text(context.ce('How big buttons and writing are on this board. Saved on this board only.'), style: ceText(16)),
      const SizedBox(height: Kx.s12),
      Wrap(
        spacing: Kx.s12,
        runSpacing: Kx.s12,
        children: [
          for (final (s, label, sample) in [(CeScreenSize.smaller, context.ce('Smaller'), 20.0), (CeScreenSize.normal, context.ce('Normal'), 26.0), (CeScreenSize.larger, context.ce('Larger'), 32.0)])
            _SizeChoice(key: Key('ce-screen-size-${s.name}'), label: label, sample: sample, selected: store.screenSize == s, onTap: () => unawaited(store.setScreenSize(s))),
        ],
      ),
    ],
  );

  // --- Advanced -----------------------------------------------------------------------------

  Widget _advancedTab() => ListView(
    padding: const EdgeInsets.all(Kx.s24),
    children: [
      Text(context.ce('Pair with the Teacher App'), style: ceHeading(20)),
      const SizedBox(height: Kx.s8),
      Text(
        context.ce('Only for a college that also uses the Zynetix ERP. This board works fully without it: classes, timetable, lessons and class tools all stay on the board.'),
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
          label: Text(context.ce('Pair with Teacher App')),
        ),
      ),
      if (widget.onPair == null) ...[
        const SizedBox(height: Kx.s8),
        Text(context.ce('End the class and open Settings from the start screen to pair.'), style: ceText(15)),
      ],
    ],
  );

  Future<void> _changePin() async {
    if (await chooseNewPin(context, store) && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(context.ce('The school PIN is changed.'))));
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
              Text(context.ce('Aa'), style: ceHeading(sample)),
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

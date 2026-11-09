import 'dart:async';

import 'package:flutter/material.dart';

import '../l10n/ce_strings.dart';
import '../local/classroom_store.dart';
import '../ui/ce_confirm.dart';
import '../ui/ce_style.dart';

/// A college's bell times: the periods of a day, the same Monday to Saturday.
@immutable
class CeBellPreset {
  const CeBellPreset({required this.id, required this.name, required this.bells});

  final String id;

  /// English; shown through the string table.
  final String name;
  final List<CeBell> bells;
}

/// Ready bell times for a PU college (the wizard and Settings → Timetable → Bell times).
const ceBellPresets = [
  CeBellPreset(
    id: 'day',
    name: 'Full day, 9:00 to 3:30',
    bells: [
      CeBell('09:00', '09:55'),
      CeBell('09:55', '10:50'),
      CeBell('11:05', '12:00'),
      CeBell('12:00', '12:55'),
      CeBell('13:40', '14:35'),
      CeBell('14:35', '15:30'),
    ],
  ),
  CeBellPreset(
    id: 'early',
    name: 'Early start, 8:00 to 2:30',
    bells: [
      CeBell('08:00', '08:55'),
      CeBell('08:55', '09:50'),
      CeBell('10:05', '11:00'),
      CeBell('11:00', '11:55'),
      CeBell('12:40', '13:35'),
      CeBell('13:35', '14:30'),
    ],
  ),
  CeBellPreset(
    id: 'morning',
    name: 'Morning college, 7:30 to 12:30',
    bells: [
      CeBell('07:30', '08:20'),
      CeBell('08:20', '09:10'),
      CeBell('09:10', '10:00'),
      CeBell('10:15', '11:05'),
      CeBell('11:05', '11:55'),
      CeBell('11:55', '12:30'),
    ],
  ),
];

/// A ready set's name in the board's language.
String ceBellPresetName(CeBellPreset p) => switch (p.id) {
  'day' => ceTr('Full day, 9:00 to 3:30'),
  'early' => ceTr('Early start, 8:00 to 2:30'),
  'morning' => ceTr('Morning college, 7:30 to 12:30'),
  _ => p.name,
};

/// "9:00 – 9:55".
String ceBellLabel(CeBell b) => '${CeSlot.short(b.start)} – ${CeSlot.short(b.end)}';

/// A touch time picker: big hour buttons (7 am to 6 pm) and minutes in fives, no typing.
/// Answers "HH:MM", or null when cancelled.
Future<String?> pickCeTime(BuildContext context, {required String title, String initial = '09:00'}) {
  var minute = CeSlot.minuteOf(initial);
  return showDialog<String>(
    context: context,
    builder: (ctx) => StatefulBuilder(
      builder: (ctx, set) {
        final h = minute ~/ 60, m = minute % 60;
        Widget pick(String label, bool on, VoidCallback tap, String key) => Padding(
          padding: const EdgeInsets.all(4),
          child: Semantics(
            button: true,
            selected: on,
            child: Material(
              key: Key(key),
              color: on ? CeC.navy : Colors.white,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16), side: BorderSide(color: on ? CeC.navy : CeC.line, width: 1.5)),
              child: InkWell(
                borderRadius: BorderRadius.circular(16),
                onTap: tap,
                child: SizedBox(
                  width: 88,
                  height: ceTarget,
                  child: Center(child: Text(label, style: ceText(20, w: FontWeight.w600, c: on ? Colors.white : CeC.navy))),
                ),
              ),
            ),
          ),
        );
        String hourLabel(int hour) => '${hour % 12 == 0 ? 12 : hour % 12}${hour < 12 ? ' am' : ' pm'}';
        return AlertDialog(
          key: const Key('ce-time-picker'),
          title: Text(title),
          content: SizedBox(
            width: 640,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Center(child: Text(CeSlot.short(_hhmm(minute)) + (h < 12 ? ' am' : ' pm'), key: const Key('ce-time-shown'), style: ceHeading(44))),
                const SizedBox(height: 12),
                Text(ceTr('Hour'), style: ceText(16, w: FontWeight.w600, c: CeC.navy)),
                Wrap(children: [for (var hour = 7; hour <= 18; hour++) pick(hourLabel(hour), hour == h, () => set(() => minute = hour * 60 + minute % 60), 'ce-time-h-$hour')]),
                const SizedBox(height: 12),
                Text(ceTr('Minutes'), style: ceText(16, w: FontWeight.w600, c: CeC.navy)),
                Wrap(children: [for (var mm = 0; mm < 60; mm += 5) pick(':${mm.toString().padLeft(2, '0')}', mm == m, () => set(() => minute = minute ~/ 60 * 60 + mm), 'ce-time-m-$mm')]),
              ],
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: Text(ceTr('Cancel'))),
            FilledButton(key: const Key('ce-time-ok'), onPressed: () => Navigator.pop(ctx, _hhmm(minute)), child: Text(ceTr('OK'))),
          ],
        );
      },
    ),
  );
}

String _hhmm(int minute) => '${(minute ~/ 60).toString().padLeft(2, '0')}:${(minute % 60).toString().padLeft(2, '0')}';

/// A big button that shows a time and opens [pickCeTime].
class CeTimeButton extends StatelessWidget {
  const CeTimeButton({super.key, required this.label, required this.value, required this.onChanged});

  final String label;
  final String value;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) => OutlinedButton(
    style: ceSoftButton().copyWith(shape: WidgetStatePropertyAll(RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)))),
    onPressed: () async {
      final t = await pickCeTime(context, title: label, initial: value);
      if (t != null) onChanged(t);
    },
    child: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        const Icon(Icons.schedule_rounded),
        const SizedBox(width: 10),
        Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label, style: ceText(13, w: FontWeight.w600)),
            Text(CeSlot.short(value) + (CeSlot.minuteOf(value) < 12 * 60 ? ' am' : ' pm'), style: ceText(20, w: FontWeight.w700, c: CeC.navy)),
          ],
        ),
      ],
    ),
  );
}

/// Bell times for Monday to Saturday: a ready set, or the college's own (add, change, remove).
/// Answers the new bells, or null when cancelled. Used by the set-up wizard and Settings.
class CeBellEditor extends StatefulWidget {
  const CeBellEditor({super.key, required this.bells, required this.onChanged});

  final List<CeBell> bells;
  final ValueChanged<List<CeBell>> onChanged;

  @override
  State<CeBellEditor> createState() => _CeBellEditorState();
}

class _CeBellEditorState extends State<CeBellEditor> {
  List<CeBell> get bells => widget.bells;

  void _set(List<CeBell> b) => widget.onChanged([...b]..sort((x, y) => x.startMinute.compareTo(y.startMinute)));

  Future<void> _edit(int? i) async {
    final old = i == null ? null : bells[i];
    final prevEnd = bells.isEmpty ? '09:00' : bells.last.end;
    var start = old?.start ?? prevEnd;
    var end = old?.end ?? _hhmm(CeSlot.minuteOf(start) + 55);
    final ok = await showDialog<String>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, set) => AlertDialog(
          key: const Key('ce-bell-dialog'),
          title: Text(old == null ? ceTr('Add a period time') : ceTr('Change this period time')),
          content: Wrap(
            spacing: 16,
            runSpacing: 16,
            children: [
              CeTimeButton(key: const Key('ce-bell-start'), label: ceTr('Starts'), value: start, onChanged: (v) => set(() => start = v)),
              CeTimeButton(key: const Key('ce-bell-end'), label: ceTr('Ends'), value: end, onChanged: (v) => set(() => end = v)),
              if (CeSlot.minuteOf(end) <= CeSlot.minuteOf(start)) Text(ceTr('The period must end after it starts.'), style: ceText(16, c: CeC.red)),
            ],
          ),
          actionsAlignment: MainAxisAlignment.spaceBetween,
          actions: [
            if (old != null) ceRemoveAction(key: const Key('ce-bell-remove'), label: ceTr('Remove'), onPressed: () => Navigator.pop(ctx, 'remove')) else const SizedBox(),
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextButton(onPressed: () => Navigator.pop(ctx), child: Text(ceTr('Cancel'))),
                const SizedBox(width: 8),
                FilledButton(key: const Key('ce-bell-save'), onPressed: CeSlot.minuteOf(end) <= CeSlot.minuteOf(start) ? null : () => Navigator.pop(ctx, 'save'), child: Text(ceTr('Save'))),
              ],
            ),
          ],
        ),
      ),
    );
    if (ok == 'remove' && i != null) return _set([...bells]..removeAt(i));
    if (ok != 'save') return;
    final b = CeBell(start, end);
    _set(i == null ? [...bells, b] : [for (final (j, x) in bells.indexed) j == i ? b : x]);
  }

  @override
  Widget build(BuildContext context) {
    final preset = ceBellPresets.where((p) => _same(p.bells, bells)).firstOrNull;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(ceTr('Ready bell times'), style: ceText(16, w: FontWeight.w600, c: CeC.navy)),
        const SizedBox(height: 8),
        Wrap(
          spacing: 12,
          runSpacing: 12,
          children: [
            for (final p in ceBellPresets)
              ChoiceChip(
                key: Key('ce-bells-preset-${p.id}'),
                label: Text(ceBellPresetName(p)),
                selected: preset?.id == p.id,
                onSelected: (_) => _set(p.bells),
              ),
          ],
        ),
        const SizedBox(height: 18),
        Text(bells.isEmpty ? ceTr('No period times yet. Pick ready ones above, or add your own.') : ceTr('Period times, Monday to Saturday (tap one to change it)'), style: ceText(16, w: FontWeight.w600, c: CeC.navy)),
        const SizedBox(height: 8),
        Wrap(
          spacing: 12,
          runSpacing: 12,
          children: [
            for (final (i, b) in bells.indexed)
              ActionChip(key: Key('ce-bell-$i'), avatar: CircleAvatar(backgroundColor: CeC.lavender, child: Text('${i + 1}', style: ceText(14, w: FontWeight.w700, c: CeC.navy))), label: Text(ceBellLabel(b)), onPressed: () => unawaited(_edit(i))),
            ActionChip(key: const Key('ce-bell-add'), avatar: const Icon(Icons.add), label: Text(ceTr('Add a period time')), onPressed: () => unawaited(_edit(null))),
          ],
        ),
      ],
    );
  }

  static bool _same(List<CeBell> a, List<CeBell> b) => a.length == b.length && [for (var i = 0; i < a.length; i++) a[i] == b[i]].every((x) => x);
}

/// "Copy this day to…": which other days (Monday to Saturday), then a confirmation; their
/// periods are replaced by copies of [from]'s. Undo for 10 seconds.
Future<void> copyDayAsking(BuildContext context, ClassroomStore store, int from) async {
  final picked = <int>{};
  final go = await showDialog<bool>(
    context: context,
    builder: (ctx) => StatefulBuilder(
      builder: (ctx, set) => AlertDialog(
        key: const Key('ce-copy-day-dialog'),
        title: Text(ceTr('Copy {day} to…', {'day': ceDayIn(CeLang.code, from)})),
        content: SizedBox(
          width: 560,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(ceTr('Pick the days. Their periods are replaced by copies of these.'), style: ceText(16)),
              const SizedBox(height: 12),
              Wrap(
                spacing: 10,
                runSpacing: 10,
                children: [
                  for (var d = 1; d <= 6; d++)
                    if (d != from)
                      FilterChip(key: Key('ce-copy-to-$d'), label: Text(ceDayIn(CeLang.code, d)), selected: picked.contains(d), onSelected: (v) => set(() => v ? picked.add(d) : picked.remove(d))),
                ],
              ),
            ],
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(ceTr('Cancel'))),
          FilledButton(key: const Key('ce-copy-day-go'), onPressed: () => Navigator.pop(ctx, picked.isNotEmpty), child: Text(ceTr('Copy'))),
        ],
      ),
    ),
  );
  if (go != true || picked.isEmpty || !context.mounted) return;
  final replaced = store.slots.where((s) => picked.contains(s.weekday)).length;
  final days = (picked.toList()..sort()).map((d) => ceDayIn(CeLang.code, d)).join(', ');
  if (replaced > 0) {
    final ok = await ceConfirmRemove(
      context,
      title: ceTr('Replace the periods on {days}?', {'days': days}),
      body: ceTr('{n} periods there now are replaced by copies of {day}.', {'n': replaced, 'day': ceDayIn(CeLang.code, from)}),
      confirm: ceTr('Replace and copy'),
    );
    if (!ok || !context.mounted) return;
  }
  final before = store.setup;
  await store.copyDay(from, picked);
  if (context.mounted) ceUndoSnack(context, ceTr('{day} copied to {days}.', {'day': ceDayIn(CeLang.code, from), 'days': days}), () => unawaited(store.replace(before)));
}

/// "Clear day": asks first, then Undo for 10 seconds.
Future<void> clearDayAsking(BuildContext context, ClassroomStore store, int day) async {
  final n = store.slots.where((s) => s.weekday == day).length;
  final ok = await ceConfirmRemove(
    context,
    title: ceTr('Clear {day}?', {'day': ceDayIn(CeLang.code, day)}),
    body: ceTr('All {n} periods on {day} come off the timetable. Classes, teachers and marks stay.', {'n': n, 'day': ceDayIn(CeLang.code, day)}),
    confirm: ceTr('Clear day'),
  );
  if (!ok || !context.mounted) return;
  final before = store.setup;
  await store.clearDay(day);
  if (context.mounted) ceUndoSnack(context, ceTr('{day} cleared.', {'day': ceDayIn(CeLang.code, day)}), () => unawaited(store.replace(before)));
}

/// What [s] clashes with: the same teacher, or the same class, at an overlapping time that day.
String ceClashLine(ClassroomStore store, CeSlot s) {
  final lines = [
    for (final c in store.clashesWith(s))
      ceTr('{time} {what} ({why})', {
        'time': '${CeSlot.short(c.slot.start)}–${CeSlot.short(c.slot.end)}',
        'what': [store.classById(c.slot.classId)?.name, c.slot.subject].whereType<String>().where((x) => x.isNotEmpty).join(' · '),
        'why': c.sameTeacher && c.sameClass
            ? ceTr('same teacher and class')
            : c.sameTeacher
            ? ceTr('same teacher: {name}', {'name': store.teacher(s.teacherId)?.name ?? ''})
            : ceTr('same class'),
      }),
  ];
  return lines.join('\n');
}

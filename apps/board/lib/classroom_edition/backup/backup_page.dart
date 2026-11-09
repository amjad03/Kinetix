import 'dart:async';
import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:printing/printing.dart';

import '../../l10n/l10n.dart' show BoardL10n;
import '../../core/crash/crash_log.dart';
import '../class_tools/class_records.dart';
import '../local/classroom_store.dart';
import '../settings/pin_pad.dart';
import '../ui/ce_style.dart';
import 'backup.dart';
import 'marks_export.dart';
import 'public_documents.dart';
import '../l10n/ce_strings.dart';

String _whenIn(BuildContext context, DateTime t) => DateFormat('EEE d MMM yyyy, h:mm a', context.dateLocale).format(t);
String _dateIn(BuildContext context, DateTime t) => DateFormat('d MMM yyyy', context.dateLocale).format(t);

/// How the Backup & restore tab reaches files outside the app (tests replace them): the
/// system's Save dialog (a USB drive, Google Drive, another folder), its Open dialog for a
/// backup, and printing.
abstract final class CeFiles {
  /// Saves [bytes] where the teacher picks (Android: the system's Save dialog, SAF). True
  /// when saved.
  static Future<bool> Function(String name, Uint8List bytes, String mime) saveAs = (name, bytes, mime) async =>
      await FilePicker.saveFile(fileName: name, bytes: bytes, mimeType: mime) != null;

  /// A backup file the teacher picks (from a USB drive or Documents/Zynetix); null when cancelled.
  static Future<Uint8List?> Function() pickBackup = () async {
    final files = await FilePicker.pickFiles(type: FileType.custom, allowedExtensions: const ['zip'], dialogTitle: ceTr('Choose a Zynetix Classroom backup'));
    return files.isEmpty ? null : files.single.readAsBytes();
  };

  static Future<void> Function(Uint8List pdf, String name) print = (pdf, name) => Printing.layoutPdf(onLayout: (_) async => pdf, name: name);
}

/// Restores a backup the teacher picks, after the preview and the school PIN (also offered
/// on the start screen when the set-up could not be read).
Future<void> restoreBackupFlow(BuildContext context, ClassroomStore store, {Uint8List? bytes, BackupService? service}) async {
  final s = service ?? BackupService(store: store);
  ClassroomBackup b;
  try {
    final data = bytes ?? await CeFiles.pickBackup();
    if (data == null) return;
    b = ClassroomBackup.decode(data);
  } on BackupFormatException catch (e) {
    if (context.mounted) _snack(context, e.message);
    return;
  } catch (e) {
    if (context.mounted) _snack(context, context.ce('That file could not be read: {error}', {'error': e}));
    return;
  }
  if (!context.mounted) return;
  final ok = await showDialog<bool>(context: context, builder: (ctx) => _RestorePreview(backup: b, current: store));
  if (ok != true || !context.mounted) return;
  if (!await askSchoolPin(context, store, reason: context.ce('Restoring a backup replaces the college’s set-up, marks and boards on this board. It needs the school PIN.'), okLabel: context.ce('Restore'))) return;
  try {
    await s.restore(b);
    if (context.mounted) _snack(context, context.ce('Restored the backup from {when}. What was on the board before is kept as a backup too.', {'when': _whenIn(context, b.summary.createdAt)}));
  } catch (e) {
    if (context.mounted) _snack(context, context.ce('The backup could not be restored: {error}', {'error': e}));
  }
}

void _snack(BuildContext context, String text, {SnackBarAction? action}) => ScaffoldMessenger.maybeOf(context)?.showSnackBar(
  SnackBar(content: Text(text), action: action, duration: const Duration(seconds: 8), persist: false),
);

/// Settings → Backup & restore.
class BackupTab extends StatefulWidget {
  const BackupTab({super.key, required this.store, this.service});

  final ClassroomStore store;
  final BackupService? service;

  @override
  State<BackupTab> createState() => _BackupTabState();
}

class _BackupTabState extends State<BackupTab> {
  late final BackupService _service = widget.service ?? BackupService(store: widget.store);
  ClassroomStore get store => widget.store;

  BackupResult? _last;
  bool _busy = false;
  List<BackupFile> _onBoard = const [];
  String? _classId;
  ClassRecords? _records;
  int _crashFiles = 0;

  @override
  void initState() {
    super.initState();
    _classId = store.classes.firstOrNull?.id;
    unawaited(_refresh());
    unawaited(_loadRecords());
  }

  Future<void> _refresh() async {
    try {
      final list = await _service.onBoard();
      final logs = await CrashLog.instance.files();
      if (mounted) {
        setState(() {
          _onBoard = list;
          _crashFiles = logs.length;
        });
      }
    } catch (e) {
      debugPrint('Backups not listed: $e');
    }
  }

  Future<void> _loadRecords() async {
    final id = _classId;
    if (id == null) return;
    final s = ClassToolsStore(deviceStore: store.deviceStore, classId: id);
    await s.load();
    if (mounted && id == _classId) setState(() => _records = s.records);
  }

  Future<void> _backUpNow() async {
    setState(() => _busy = true);
    try {
      final r = await _service.backUpNow();
      if (!mounted) return;
      setState(() => _last = r);
      await _refresh();
    } catch (e) {
      if (mounted) _snack(context, context.ce('The backup could not be made: {error}', {'error': e}));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _copyToUsb() async {
    final r = _last;
    if (r == null) return;
    try {
      if (await CeFiles.saveAs(r.name, r.bytes, 'application/zip') && mounted) _snack(context, ceTr('A copy of the backup is saved where you chose.'));
    } catch (e) {
      if (mounted) _snack(context, context.ce('The copy could not be saved: {error}', {'error': e}));
    }
  }

  Future<void> _restoreFrom(BackupFile f) async {
    final bytes = await f.file.readAsBytes();
    if (!mounted) return;
    await restoreBackupFlow(context, store, bytes: bytes, service: _service);
    await _refresh();
  }

  /// Exports to Documents/Zynetix/Marks, with "Copy elsewhere" (a USB drive) in the message.
  Future<void> _export(String name, Uint8List bytes, String mime, {bool printable = false}) async {
    String where;
    try {
      where = await PublicDocuments.instance.save('${PublicDocuments.root}/Marks', name, bytes, mime: mime);
    } catch (e) {
      where = '';
      debugPrint('Marks not saved to Documents: $e');
    }
    if (!mounted) return;
    if (printable) unawaited(CeFiles.print(bytes, name).catchError((Object _) {}));
    _snack(
      context,
      where.isEmpty ? ceTr('Choose where to save {name}.', {'name': name}) : ceTr('Saved to {where}.', {'where': where}),
      action: SnackBarAction(label: context.ce('Copy to USB…'), onPressed: () => unawaited(CeFiles.saveAs(name, bytes, mime))),
    );
    if (where.isEmpty) await CeFiles.saveAs(name, bytes, mime);
  }

  CeClass? get _class => store.classById(_classId);

  @override
  Widget build(BuildContext context) {
    final daily = _onBoard.where((b) => b.kind == 'daily').toList();
    return ListView(
      key: const Key('ce-backup-tab'),
      padding: const EdgeInsets.all(24),
      children: [
        _section(
          icon: Icons.backup_outlined,
          colour: CeC.mint,
          title: context.ce('Back up now'),
          body: context.ce('Everything the college keeps on this board: teachers, classes and timetable, the school PIN, marks and mock tests, lesson progress, saved boards and the crash log. Kept on the board and in Documents/Zynetix, which stays even if the app is removed. Copy it to a USB drive to keep it off the board too.'),
          children: [
            Wrap(
              spacing: 16,
              runSpacing: 12,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                FilledButton.icon(
                  key: const Key('ce-backup-now'),
                  style: ceBigButton(),
                  onPressed: _busy ? null : () => unawaited(_backUpNow()),
                  icon: _busy ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 3, color: Colors.white)) : const Icon(Icons.backup_outlined),
                  label: Text(context.ce('Back up now')),
                ),
                if (_last != null)
                  OutlinedButton.icon(key: Key('ce-backup-usb'), style: ceSoftButton(), onPressed: () => unawaited(_copyToUsb()), icon: Icon(Icons.usb), label: Text(context.ce('Copy to a USB drive…'))),
              ],
            ),
            if (_last case final r?) ...[
              const SizedBox(height: 16),
              Container(
                key: const Key('ce-backup-done'),
                padding: const EdgeInsets.all(16),
                decoration: ceCard(color: CeC.page, shadow: false, r: 16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(context.ce('Backed up: {name}', {'name': r.name}), style: ceText(16, w: FontWeight.w600, c: CeC.navy)),
                    const SizedBox(height: 4),
                    Text(
                      r.publicPath != null ? context.ce('Kept on this board and in {path}.', {'path': r.publicPath}) : context.ce('Kept on this board. It could not go to Documents/Zynetix ({error}); copy it to a USB drive.', {'error': r.publicError}),
                      style: ceText(15),
                    ),
                  ],
                ),
              ),
            ],
          ],
        ),
        _section(
          icon: Icons.event_repeat_outlined,
          colour: CeC.blue,
          title: context.ce('Daily backup'),
          body: context.ce('Each day the board is used it backs itself up, and keeps the last {n} days on the board and in Documents/Zynetix/Daily backups.', {'n': BackupService.keepDaily}),
          children: [
            Text(daily.isEmpty ? context.ce('No daily backup yet: the first one is made when a class starts today.') : context.ce('Last daily backup: {date} ({n} kept).', {'date': _dateIn(context, daily.first.at), 'n': daily.length}), key: const Key('ce-backup-daily'), style: ceText(16, c: CeC.navy)),
          ],
        ),
        _section(
          icon: Icons.settings_backup_restore,
          colour: CeC.peach,
          title: context.ce('Restore'),
          body: context.ce('Puts a backup back on this board in place of what is here now. You see what is in it first, and it needs the school PIN. What is on the board now is backed up first.'),
          children: [
            OutlinedButton.icon(
              key: const Key('ce-restore-file'),
              style: ceSoftButton(),
              onPressed: () => unawaited(restoreBackupFlow(context, store, service: _service).then((_) => _refresh())),
              icon: const Icon(Icons.folder_open_outlined),
              label: Text(context.ce('Choose a backup file (USB drive, Documents)…')),
            ),
            const SizedBox(height: 12),
            for (final b in _onBoard.take(8))
              Card(
                key: Key('ce-backup-${b.name}'),
                color: CeC.page,
                elevation: 0,
                margin: const EdgeInsets.only(bottom: 8),
                child: ListTile(
                  leading: Icon(switch (b.kind) {
                    'daily' => Icons.event_repeat_outlined,
                    'before-restore' => Icons.history,
                    _ => Icons.backup_outlined,
                  }, color: CeC.navy),
                  title: Text(b.kind == 'daily' ? _dateIn(context, b.at) : _whenIn(context, b.at), style: ceText(17, w: FontWeight.w600, c: CeC.navy)),
                  subtitle: Text(switch (b.kind) {
                    'daily' => context.ce('Daily backup'),
                    'before-restore' => context.ce('Made before a restore'),
                    _ => context.ce('Backed up by hand'),
                  }, style: ceText(14)),
                  trailing: TextButton(key: Key('ce-restore-${b.name}'), onPressed: () => unawaited(_restoreFrom(b)), child: Text(context.ce('Restore…'))),
                ),
              ),
          ],
        ),
        _section(icon: Icons.table_chart_outlined, colour: CeC.lavender, title: context.ce('Export marks'), body: context.ce('Marks by roll number for a spreadsheet (CSV) or to print (PDF), saved to Documents/Zynetix/Marks.'), children: [_marks()]),
        Padding(
          padding: const EdgeInsets.only(top: 4, left: 8),
          child: Text(_crashFiles == 0 ? context.ce('Crash log: nothing went wrong on this board.') : context.ce('Crash log: {n} files, carried in every backup.', {'n': _crashFiles}), key: const Key('ce-crash-log-line'), style: ceText(14)),
        ),
      ],
    );
  }

  Widget _marks() {
    final cls = _class;
    final tests = _records == null ? const <MarksTest>[] : marksTests(_records!);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final c in store.classes)
              ChoiceChip(
                key: Key('ce-marks-class-${c.id}'),
                label: Text(c.name),
                selected: c.id == _classId,
                onSelected: (_) {
                  setState(() {
                    _classId = c.id;
                    _records = null;
                  });
                  unawaited(_loadRecords());
                },
              ),
          ],
        ),
        const SizedBox(height: 12),
        if (cls == null)
          Text(context.ce('Add a class first.'), style: ceText(16))
        else if (_records != null && tests.isEmpty)
          Text(context.ce('No marks for {name} yet. Mock tests and class quizzes (Class tools) are kept here.', {'name': cls.name}), key: const Key('ce-marks-empty'), style: ceText(16))
        else ...[
          for (final t in tests.reversed)
            Card(
              key: Key('ce-marks-${t.id}'),
              color: CeC.page,
              elevation: 0,
              margin: const EdgeInsets.only(bottom: 8),
              child: ListTile(
                title: Text('${t.title} · ${_dateIn(context, t.at)}', style: ceText(17, w: FontWeight.w600, c: CeC.navy)),
                subtitle: Text(context.ce('Out of {max} · {n} of {total} marked', {'max': t.outOf % 1 == 0 ? t.outOf.toInt() : t.outOf, 'n': t.marks.length, 'total': cls.rollCount}), style: ceText(14)),
                trailing: Wrap(
                  spacing: 8,
                  children: [
                    OutlinedButton(
                      key: Key('ce-marks-csv-${t.id}'),
                      onPressed: () => unawaited(_export(marksFileName(cls, t, 'csv'), csvBytes(marksCsv(college: store.college, cls: cls, subject: '', test: t)), 'text/csv')),
                      child: Text(context.ce('CSV')),
                    ),
                    OutlinedButton(
                      key: Key('ce-marks-pdf-${t.id}'),
                      onPressed: () async {
                        final pdf = await marksPdf(college: store.college, cls: cls, subject: '', test: t);
                        await _export(marksFileName(cls, t, 'pdf'), pdf, 'application/pdf', printable: true);
                      },
                      child: Text(context.ce('PDF')),
                    ),
                  ],
                ),
              ),
            ),
          if (tests.length > 1)
            TextButton.icon(
              key: const Key('ce-marks-all'),
              onPressed: () => unawaited(_export(marksFileName(cls, null, 'csv'), csvBytes(allMarksCsv(college: store.college, cls: cls, subject: '', tests: tests)), 'text/csv')),
              icon: const Icon(Icons.grid_on_outlined),
              label: Text(context.ce('All {n} tests in one sheet (CSV)', {'n': tests.length})),
            ),
        ],
      ],
    );
  }

  Widget _section({required IconData icon, required Color colour, required String title, required String body, required List<Widget> children}) => Container(
    margin: const EdgeInsets.only(bottom: 20),
    padding: const EdgeInsets.fromLTRB(28, 24, 28, 24),
    decoration: ceCard(shadow: false, r: 24),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        ceIconDot(icon, bg: colour, size: 56),
        const SizedBox(width: 20),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: ceHeading(24)),
              const SizedBox(height: 6),
              Text(body, style: ceText(16)),
              const SizedBox(height: 16),
              ...children,
            ],
          ),
        ),
      ],
    ),
  );
}

/// What a backup holds, beside what is on the board now, before it is restored.
class _RestorePreview extends StatelessWidget {
  const _RestorePreview({required this.backup, required this.current});

  final ClassroomBackup backup;
  final ClassroomStore current;

  @override
  Widget build(BuildContext context) {
    final s = backup.summary;
    final rows = <(IconData, String)>[
      (Icons.account_balance_outlined, s.college.isEmpty ? context.ce('No college name') : s.college),
      (Icons.people_alt_outlined, context.ce('Teachers: {n}', {'n': s.teachers})),
      (Icons.groups_outlined, context.ce('Classes: {n}', {'n': s.classes})),
      (Icons.event_note_outlined, context.ce('Periods on the timetable: {n}', {'n': s.periods})),
      (Icons.fact_check_outlined, s.mockTests + s.quizMarks == 0 ? context.ce('No marks') : context.ce('Marks for {classes} classes: {mocks} mock tests, {quiz} quiz questions', {'classes': s.marksClasses, 'mocks': s.mockTests, 'quiz': s.quizMarks})),
      (Icons.auto_stories_outlined, context.ce('Lesson progress for {n} classes', {'n': s.lessonClasses})),
      (Icons.draw_outlined, context.ce('Saved boards: {n}', {'n': s.boards})),
    ];
    return AlertDialog(
      key: const Key('ce-restore-preview'),
      icon: const Icon(Icons.settings_backup_restore, size: 40),
      title: Text(context.ce('Restore the backup from {when}?', {'when': _whenIn(context, s.createdAt)})),
      content: SizedBox(
        width: 640,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(context.ce('This backup has:'), style: ceText(17, w: FontWeight.w600, c: CeC.navy)),
            const SizedBox(height: 10),
            for (final (i, t) in rows)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Row(children: [Icon(i, size: 22, color: CeC.navy), const SizedBox(width: 12), Expanded(child: Text(t, style: ceText(17, c: CeC.navy)))]),
              ),
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(14),
              decoration: ceCard(color: CeC.butter, shadow: false, r: 16),
              child: Text(
                [
                  context.ce('It replaces what is on this board now ({teachers} teachers, {classes} classes, {periods} periods).', {'teachers': current.teachers.length, 'classes': current.classes.length, 'periods': current.slots.length}),
                  context.ce('What is here now is backed up first.'),
                  if (s.hasPin) context.ce('The school PIN becomes the one in the backup.'),
                ].join(' '),
                style: ceText(16, c: CeC.navy),
              ),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context, false), child: Text(context.ce('Cancel'))),
        FilledButton(key: Key('ce-restore-ok'), onPressed: () => Navigator.pop(context, true), child: Text(context.ce('Restore…'))),
      ],
    );
  }
}

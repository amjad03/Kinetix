import 'dart:async';
import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:printing/printing.dart';

import '../../core/crash/crash_log.dart';
import '../class_tools/class_records.dart';
import '../local/classroom_store.dart';
import '../settings/pin_pad.dart';
import '../ui/ce_style.dart';
import 'backup.dart';
import 'marks_export.dart';
import 'public_documents.dart';

final _when = DateFormat('EEE d MMM yyyy, h:mm a');
final _date = DateFormat('d MMM yyyy');

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
    final files = await FilePicker.pickFiles(type: FileType.custom, allowedExtensions: const ['zip'], dialogTitle: 'Choose a Zynetix Classroom backup');
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
    if (context.mounted) _snack(context, 'That file could not be read: $e');
    return;
  }
  if (!context.mounted) return;
  final ok = await showDialog<bool>(context: context, builder: (ctx) => _RestorePreview(backup: b, current: store));
  if (ok != true || !context.mounted) return;
  if (!await askSchoolPin(context, store, reason: 'Restoring a backup replaces the college’s set-up, marks and boards on this board. It needs the school PIN.', okLabel: 'Restore')) return;
  try {
    await s.restore(b);
    if (context.mounted) _snack(context, 'Restored the backup from ${_when.format(b.summary.createdAt)}. What was on the board before is kept as a backup too.');
  } catch (e) {
    if (context.mounted) _snack(context, 'The backup could not be restored: $e');
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
      if (mounted) _snack(context, 'The backup could not be made: $e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _copyToUsb() async {
    final r = _last;
    if (r == null) return;
    try {
      if (await CeFiles.saveAs(r.name, r.bytes, 'application/zip') && mounted) _snack(context, 'A copy of the backup is saved where you chose.');
    } catch (e) {
      if (mounted) _snack(context, 'The copy could not be saved: $e');
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
      where.isEmpty ? 'Choose where to save $name.' : 'Saved to $where.',
      action: SnackBarAction(label: 'Copy to USB…', onPressed: () => unawaited(CeFiles.saveAs(name, bytes, mime))),
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
          title: 'Back up now',
          body: 'Everything the college keeps on this board: teachers, classes and timetable, the school PIN, marks and mock tests, lesson progress, saved boards and the crash log. '
              'Kept on the board and in Documents/Zynetix, which stays even if the app is removed. Copy it to a USB drive to keep it off the board too.',
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
                  label: const Text('Back up now'),
                ),
                if (_last != null)
                  OutlinedButton.icon(key: const Key('ce-backup-usb'), style: ceSoftButton(), onPressed: () => unawaited(_copyToUsb()), icon: const Icon(Icons.usb), label: const Text('Copy to a USB drive…')),
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
                    Text('Backed up: ${r.name}', style: ceText(16, w: FontWeight.w600, c: CeC.navy)),
                    const SizedBox(height: 4),
                    Text(
                      r.publicPath != null ? 'Kept on this board and in ${r.publicPath}.' : 'Kept on this board. It could not go to Documents/Zynetix (${r.publicError}); copy it to a USB drive.',
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
          title: 'Daily backup',
          body: 'Each day the board is used it backs itself up, and keeps the last ${BackupService.keepDaily} days on the board and in Documents/Zynetix/Daily backups.',
          children: [
            Text(daily.isEmpty ? 'No daily backup yet: the first one is made when a class starts today.' : 'Last daily backup: ${_when.format(daily.first.at)} (${daily.length} kept).', key: const Key('ce-backup-daily'), style: ceText(16, c: CeC.navy)),
          ],
        ),
        _section(
          icon: Icons.settings_backup_restore,
          colour: CeC.peach,
          title: 'Restore',
          body: 'Puts a backup back on this board in place of what is here now. You see what is in it first, and it needs the school PIN. What is on the board now is backed up first.',
          children: [
            OutlinedButton.icon(
              key: const Key('ce-restore-file'),
              style: ceSoftButton(),
              onPressed: () => unawaited(restoreBackupFlow(context, store, service: _service).then((_) => _refresh())),
              icon: const Icon(Icons.folder_open_outlined),
              label: const Text('Choose a backup file (USB drive, Documents)…'),
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
                  title: Text(_when.format(b.at), style: ceText(17, w: FontWeight.w600, c: CeC.navy)),
                  subtitle: Text(switch (b.kind) {
                    'daily' => 'Daily backup',
                    'before-restore' => 'Made before a restore',
                    _ => 'Backed up by hand',
                  }, style: ceText(14)),
                  trailing: TextButton(key: Key('ce-restore-${b.name}'), onPressed: () => unawaited(_restoreFrom(b)), child: const Text('Restore…')),
                ),
              ),
          ],
        ),
        _section(icon: Icons.table_chart_outlined, colour: CeC.lavender, title: 'Export marks', body: 'Marks by roll number for a spreadsheet (CSV) or to print (PDF), saved to Documents/Zynetix/Marks.', children: [_marks()]),
        Padding(
          padding: const EdgeInsets.only(top: 4, left: 8),
          child: Text('Crash log: ${_crashFiles == 0 ? 'nothing went wrong on this board' : '$_crashFiles file${_crashFiles == 1 ? '' : 's'}, carried in every backup'}.', key: const Key('ce-crash-log-line'), style: ceText(14)),
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
          Text('Add a class first.', style: ceText(16))
        else if (_records != null && tests.isEmpty)
          Text('No marks for ${cls.name} yet. Mock tests and class quizzes (Class tools) are kept here.', key: const Key('ce-marks-empty'), style: ceText(16))
        else ...[
          for (final t in tests.reversed)
            Card(
              key: Key('ce-marks-${t.id}'),
              color: CeC.page,
              elevation: 0,
              margin: const EdgeInsets.only(bottom: 8),
              child: ListTile(
                title: Text('${t.title} · ${_date.format(t.at)}', style: ceText(17, w: FontWeight.w600, c: CeC.navy)),
                subtitle: Text('Out of ${t.outOf % 1 == 0 ? t.outOf.toInt() : t.outOf} · ${t.marks.length} of ${cls.rollCount} marked', style: ceText(14)),
                trailing: Wrap(
                  spacing: 8,
                  children: [
                    OutlinedButton(
                      key: Key('ce-marks-csv-${t.id}'),
                      onPressed: () => unawaited(_export(marksFileName(cls, t, 'csv'), csvBytes(marksCsv(college: store.college, cls: cls, subject: '', test: t)), 'text/csv')),
                      child: const Text('CSV'),
                    ),
                    OutlinedButton(
                      key: Key('ce-marks-pdf-${t.id}'),
                      onPressed: () async {
                        final pdf = await marksPdf(college: store.college, cls: cls, subject: '', test: t);
                        await _export(marksFileName(cls, t, 'pdf'), pdf, 'application/pdf', printable: true);
                      },
                      child: const Text('PDF'),
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
              label: Text('All ${tests.length} tests in one sheet (CSV)'),
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
    String n(int v, String one, [String? many]) => '$v ${v == 1 ? one : (many ?? '${one}s')}';
    final rows = <(IconData, String)>[
      (Icons.account_balance_outlined, s.college.isEmpty ? 'No college name' : s.college),
      (Icons.people_alt_outlined, n(s.teachers, 'teacher')),
      (Icons.groups_outlined, n(s.classes, 'class', 'classes')),
      (Icons.event_note_outlined, '${n(s.periods, 'period')} on the timetable'),
      (Icons.fact_check_outlined, s.mockTests + s.quizMarks == 0 ? 'No marks' : 'Marks for ${n(s.marksClasses, 'class', 'classes')}: ${n(s.mockTests, 'mock test')}, ${n(s.quizMarks, 'quiz question')}'),
      (Icons.auto_stories_outlined, 'Lesson progress for ${n(s.lessonClasses, 'class', 'classes')}'),
      (Icons.draw_outlined, n(s.boards, 'saved board')),
    ];
    return AlertDialog(
      key: const Key('ce-restore-preview'),
      icon: const Icon(Icons.settings_backup_restore, size: 40),
      title: Text('Restore the backup from ${_when.format(s.createdAt)}?'),
      content: SizedBox(
        width: 640,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('This backup has:', style: ceText(17, w: FontWeight.w600, c: CeC.navy)),
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
                'It replaces what is on this board now (${n(current.teachers.length, 'teacher')}, ${n(current.classes.length, 'class', 'classes')}, ${n(current.slots.length, 'period')}). '
                'What is here now is backed up first.${s.hasPin ? ' The school PIN becomes the one in the backup.' : ''}',
                style: ceText(16, c: CeC.navy),
              ),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
        FilledButton(key: const Key('ce-restore-ok'), onPressed: () => Navigator.pop(context, true), child: const Text('Restore…')),
      ],
    );
  }
}

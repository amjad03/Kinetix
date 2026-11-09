import 'dart:async';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../class_tools/tool_ui.dart';
import '../local/classroom_store.dart';
import '../settings/pin_pad.dart' show askSchoolPin;
import '../ui/ce_style.dart';
import 'exam_rules.dart';
import 'filename_guess.dart';
import 'paper_library.dart';
import 'paper_model.dart';
import 'paper_pack.dart';
import '../l10n/ce_strings.dart';

/// A file the teacher picked (from a USB stick or a folder).
typedef PickedPaperFile = ({String name, Uint8List bytes});

/// Opens the system file picker for PDFs and paper packs. Tests swap it.
Future<List<PickedPaperFile>> Function() pickPaperFiles = _systemPicker;

Future<List<PickedPaperFile>> _systemPicker() async {
  final files = await FilePicker.pickFiles(dialogTitle: ceTr('Pick papers'), type: FileType.custom, allowedExtensions: const ['pdf', 'zip']);
  return [for (final f in files) (name: f.name, bytes: await f.xFile.readAsBytes())];
}

/// Asks for the school PIN before papers are added or removed (the college's number pad, with
/// its lockout and the first set-up's change from 1234). True when it was right.
Future<bool> askPapersPin(BuildContext context, ClassroomStore store, {String? why}) =>
    askSchoolPin(context, store, reason: why ?? context.ce('Adding papers changes the library for everyone who uses this board.'));

/// The "Add papers" page (after the PIN). [files]: already picked (else it starts by asking).
Future<ImportReport?> openAddPapers(BuildContext context, PaperLibrary lib, {List<PickedPaperFile>? files}) =>
    Navigator.of(context, rootNavigator: true).push(MaterialPageRoute<ImportReport>(builder: (_) => AddPapersPage(lib: lib, files: files)));

/// One picked file and what the teacher says it is.
class ImportItem {
  ImportItem(this.file) : guess = guessFromFileName(file.name) {
    isPack = file.name.toLowerCase().endsWith('.zip');
    final bytes = file.bytes;
    if (!isPack && !looksLikePdf(bytes)) problem = ceTr('This is not a PDF, or it is damaged.');
    hash = PaperLibrary.hashOf(bytes);
    exam = guess.exam ?? Exam.puc2;
    year = guess.year ?? DateTime.now().year - 1;
    session = guess.session;
    subjects = {?guess.subject};
    isKey = guess.isKey;
  }

  final PickedPaperFile file;
  final PaperGuess guess;
  late final bool isPack;
  late final String hash;
  String? problem;

  /// Already in the library (the paper it is, or whose key it is).
  Paper? duplicateOf;

  // The form.
  late Exam exam;
  late int year;
  late String session;
  late Set<String> subjects;
  String language = 'English';
  String source = '';
  late bool isKey;

  /// The paper it is the key for: a paper in the library (id), or another file of this batch.
  String? keyFor;

  bool get skipped => problem != null || duplicateOf != null;
  String get name => file.name;

  /// "NEET 2023 · Physics" for the key's dropdown.
  String get label => [exam.label, '$year', if (session.isNotEmpty) session, if (subjects.isNotEmpty) subjects.join(', ')].join(' · ');
}

/// Picks a paper for each key: one with the same exam and year (and subject, when both say).
void matchKeys(List<ImportItem> items, List<Paper> library) {
  for (final k in items.where((i) => i.isKey && !i.isPack && !i.skipped && i.keyFor == null)) {
    bool same(Exam e, int y, Iterable<String> subs) => e == k.exam && y == k.year && (k.subjects.isEmpty || subs.isEmpty || subs.any(k.subjects.contains));
    final inBatch = items.where((p) => !p.isKey && !p.isPack && !p.skipped && same(p.exam, p.year, p.subjects)).firstOrNull;
    if (inBatch != null) {
      k.keyFor = 'file:${items.indexOf(inBatch)}';
      continue;
    }
    final inLib = library.where((p) => !p.hasKey && same(p.exam, p.year, p.subjects)).firstOrNull ?? library.where((p) => same(p.exam, p.year, p.subjects)).firstOrNull;
    if (inLib != null) k.keyFor = inLib.id;
  }
}

/// Adds [items] to [lib]: packs, then papers, then keys (so a key can name a paper of the same
/// batch). [onProgress]: (done, total, the file being added).
Future<ImportReport> importItems(PaperLibrary lib, List<ImportItem> items, {void Function(int done, int total, String name)? onProgress}) async {
  final r = ImportReport();
  final todo = [
    for (final i in items)
      if (!i.skipped) i,
  ]..sort((a, b) => (a.isPack ? 0 : (a.isKey ? 2 : 1)).compareTo(b.isPack ? 0 : (b.isKey ? 2 : 1)));
  for (final i in items) {
    if (i.duplicateOf != null) r.duplicates.add(i.name);
    if (i.problem != null) r.problems.add('${i.name}: ${i.problem}');
  }
  final added = <int, Paper>{};
  for (final (n, i) in todo.indexed) {
    onProgress?.call(n, todo.length, i.name);
    await Future<void>.delayed(Duration.zero);
    if (i.isPack) {
      r.addAll(await lib.addPack(i.file.bytes, fileName: i.name));
    } else if (!i.isKey) {
      final p = await lib.addPdf(
        i.file.bytes,
        PaperDraft(exam: i.exam, year: i.year, session: i.session, subjects: [for (final s in paperSubjects) if (i.subjects.contains(s)) s], language: i.language, source: i.source),
        fileName: i.name,
        report: r,
      );
      if (p != null) added[items.indexOf(i)] = p;
    } else {
      final target = i.keyFor;
      final id = target == null ? null : (target.startsWith('file:') ? added[int.parse(target.substring(5))]?.id : target);
      if (id == null) {
        r.problems.add('${i.name}: ${ceTr('pick the paper this is the answer key for')}');
      } else {
        await lib.addKey(i.file.bytes, id, fileName: i.name, report: r);
      }
    }
  }
  onProgress?.call(todo.length, todo.length, '');
  return r;
}

class AddPapersPage extends StatefulWidget {
  const AddPapersPage({super.key, required this.lib, this.files});

  final PaperLibrary lib;
  final List<PickedPaperFile>? files;

  @override
  State<AddPapersPage> createState() => _AddPapersPageState();
}

class _AddPapersPageState extends State<AddPapersPage> {
  PaperLibrary get lib => widget.lib;
  var items = <ImportItem>[];
  bool picking = false, adding = false;
  (int, int, String)? progress;
  ImportReport? report;

  @override
  void initState() {
    super.initState();
    if (widget.files != null) _take(widget.files!);
  }

  Future<void> _pick() async {
    setState(() => picking = true);
    try {
      final files = await pickPaperFiles();
      if (mounted) _take(files);
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(context.ce('Could not open the files: {error}', {'error': e}))));
    } finally {
      if (mounted) setState(() => picking = false);
    }
  }

  void _take(List<PickedPaperFile> files) {
    final known = {for (final i in items) i.hash};
    final fresh = <ImportItem>[];
    for (final f in files) {
      final it = ImportItem(f);
      if (known.contains(it.hash)) continue;
      known.add(it.hash);
      if (!it.isPack) it.duplicateOf = lib.withHash(it.hash);
      fresh.add(it);
    }
    setState(() {
      items = [...items, ...fresh];
      report = null;
      matchKeys(items, lib.papers);
    });
  }

  Future<void> _add() async {
    setState(() => adding = true);
    final r = await importItems(lib, items, onProgress: (d, t, n) => mounted ? setState(() => progress = (d, t, n)) : null);
    if (!mounted) return;
    setState(() {
      adding = false;
      report = r;
      items = [];
    });
  }

  int get _toAdd => items.where((i) => !i.skipped).length;

  @override
  Widget build(BuildContext context) => Theme(
    data: ceTheme(context),
    child: Scaffold(
      key: const Key('ce-papers-add'),
      backgroundColor: CeC.page,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(28, 20, 28, 20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  IconButton(
                    key: const Key('ce-papers-add-close'),
                    tooltip: context.ce('Back to the papers'),
                    onPressed: adding ? null : () => Navigator.of(context).pop(report),
                    icon: const Icon(Icons.arrow_back_rounded, color: CeC.navy),
                  ),
                  const SizedBox(width: 4),
                  Text(context.ce('Add papers'), style: ceHeading(34)),
                  const SizedBox(width: 14),
                  toolPill(ceTr('Works offline'), icon: Icons.wifi_off_rounded, bg: CeC.mint),
                  const Spacer(),
                  if (items.isNotEmpty && !adding) ...[
                    toolButton(ceTr('Choose more files'), icon: Icons.add, key: const Key('ce-papers-pick-more'), onPressed: picking ? null : _pick),
                    const SizedBox(width: 12),
                    toolButton(
                      _toAdd == 1 ? ceTr('Add 1 file') : ceTr('Add {n} files', {'n': _toAdd}),
                      icon: Icons.download_done_rounded,
                      filled: true,
                      key: const Key('ce-papers-add-go'),
                      onPressed: _toAdd == 0 ? null : _add,
                    ),
                  ],
                ],
              ),
              const SizedBox(height: 16),
              Expanded(child: _body()),
            ],
          ),
        ),
      ),
    ),
  );

  Widget _body() {
    if (adding) return _progress();
    if (report != null) return _report(report!);
    if (items.isEmpty) return _start();
    return ListView(
      key: const Key('ce-papers-form'),
      children: [
        Text(context.ce('Check what each file is. The board guessed from the file names.'), style: ceText(17)),
        const SizedBox(height: 14),
        for (final (n, i) in items.indexed) Padding(padding: const EdgeInsets.only(bottom: 14), child: _itemCard(n, i)),
      ],
    );
  }

  Widget _start() => Center(
    child: Container(
      key: const Key('ce-papers-add-start'),
      constraints: const BoxConstraints(maxWidth: 760),
      padding: const EdgeInsets.all(36),
      decoration: ceCard(shadow: false),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          ceIconDot(Icons.usb_rounded, bg: CeC.blue, size: 72),
          const SizedBox(height: 18),
          Text(context.ce('Plug in the USB stick with the papers'), textAlign: TextAlign.center, style: ceHeading(28)),
          const SizedBox(height: 12),
          Text(
            ceTr('Then tap Choose files and open the USB stick (or a folder on the board). Pick one or more PDFs, or a Zynetix paper pack (a .zip file).'),
            textAlign: TextAlign.center,
            style: ceText(18, height: 1.45),
          ),
          const SizedBox(height: 26),
          toolButton(picking ? ceTr('Opening…') : ceTr('Choose files'), icon: Icons.folder_open_rounded, filled: true, key: const Key('ce-papers-pick'), onPressed: picking ? null : _pick),
        ],
      ),
    ),
  );

  Widget _progress() {
    final (done, total, name) = progress ?? (0, 1, '');
    return Center(
      child: Container(
        key: const Key('ce-papers-progress'),
        constraints: const BoxConstraints(maxWidth: 680),
        padding: const EdgeInsets.all(36),
        decoration: ceCard(shadow: false),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(done >= total ? ceTr('Almost done…') : ceTr('Adding {n} of {total}', {'n': done + 1, 'total': total}), style: ceHeading(28)),
            const SizedBox(height: 8),
            Text(name, maxLines: 1, overflow: TextOverflow.ellipsis, style: ceText(16)),
            const SizedBox(height: 22),
            ClipRRect(
              borderRadius: BorderRadius.circular(99),
              child: LinearProgressIndicator(value: total == 0 ? null : done / total, minHeight: 16, backgroundColor: CeC.lavender),
            ),
            const SizedBox(height: 14),
            Text(context.ce('Keep the USB stick in until this is done.'), style: ceText(16)),
          ],
        ),
      ),
    );
  }

  Widget _report(ImportReport r) => ListView(
    key: const Key('ce-papers-report'),
    children: [
      infoCard(
        icon: r.nothingNew ? Icons.info_outline : Icons.check_circle_outline,
        colour: r.nothingNew ? CeC.butter : CeC.mint,
        title: r.nothingNew
            ? ceTr('Nothing new was added')
            : [
                if (r.added.isNotEmpty) r.added.length == 1 ? ceTr('1 paper added') : ceTr('{n} papers added', {'n': r.added.length}),
                if (r.keysAdded.isNotEmpty) r.keysAdded.length == 1 ? ceTr('1 answer key added') : ceTr('{n} answer keys added', {'n': r.keysAdded.length}),
              ].join(', '),
        line: [...r.added, ...r.keysAdded.map((k) => ceTr('Answer key: {name}', {'name': k}))].join('\n'),
      ),
      if (r.duplicates.isNotEmpty) ...[
        const SizedBox(height: 14),
        infoCard(icon: Icons.copy_all_outlined, colour: CeC.blue, title: context.ce('Already on this board, so skipped'), line: r.duplicates.join('\n')),
      ],
      if (r.problems.isNotEmpty) ...[
        const SizedBox(height: 14),
        infoCard(icon: Icons.error_outline, colour: CeC.pink, title: context.ce('Not added'), line: r.problems.join('\n')),
      ],
      const SizedBox(height: 22),
      Row(
        children: [
          toolButton(ceTr('Add more papers'), icon: Icons.add, onPressed: () => setState(() => report = null)),
          const SizedBox(width: 12),
          toolButton(ceTr('Done'), icon: Icons.check, filled: true, key: const Key('ce-papers-add-done'), onPressed: () => Navigator.of(context).pop(r)),
        ],
      ),
    ],
  );

  Widget _itemCard(int n, ImportItem i) {
    Widget label(String t) => SizedBox(width: 150, child: Text(t, style: ceText(17, w: FontWeight.w600, c: CeC.navy)));
    final head = Row(
      children: [
        ceIconDot(i.isPack ? Icons.inventory_2_outlined : Icons.picture_as_pdf_outlined, bg: i.skipped ? CeC.line : CeC.lavender, size: 46),
        const SizedBox(width: 14),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(i.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: ceHeading(20)),
              Text(
                i.problem ??
                    (i.duplicateOf != null
                        ? ceTr('Already on this board ({title}). It will be skipped.', {'title': i.duplicateOf!.longTitle})
                        : i.isPack
                        ? ceTr('A paper pack: its papers, answer keys and questions come in as they are.')
                        : '${_size(i.file.bytes.length)} PDF'),
                style: ceText(15, c: i.problem != null ? CeC.red : CeC.muted),
              ),
            ],
          ),
        ),
        IconButton(
          tooltip: context.ce('Leave this file out'),
          onPressed: () => setState(() {
            items = [...items]..removeAt(n);
            for (final k in items) {
              if (k.keyFor?.startsWith('file:') ?? false) k.keyFor = null;
            }
            matchKeys(items, lib.papers);
          }),
          icon: const Icon(Icons.close_rounded, color: CeC.muted),
        ),
      ],
    );
    final children = <Widget>[head];
    if (!i.skipped && !i.isPack) {
      final papersInBatch = [
        for (final (j, p) in items.indexed)
          if (!p.isPack && !p.isKey && !p.skipped) ('file:$j', '${p.label} (${ceTr('new: {name}', {'name': p.name})})'),
      ];
      final keyChoices = [...papersInBatch, for (final p in lib.papers) (p.id, p.longTitle)];
      children.addAll([
        const SizedBox(height: 16),
        Row(
          children: [
            label(ceTr('This file is')),
            choiceChip(ceTr('A question paper'), on: !i.isKey, offIcon: null, key: Key('ce-papers-is-paper-$n'), onTap: () => setState(() => i.isKey = false)),
            const SizedBox(width: 10),
            choiceChip(ceTr('An answer key'), on: i.isKey, offIcon: null, key: Key('ce-papers-is-key-$n'), onTap: () => setState(() {
              i.isKey = true;
              matchKeys(items, lib.papers);
            })),
          ],
        ),
        const SizedBox(height: 14),
        if (i.isKey)
          Row(
            children: [
              label(ceTr('The answer key for')),
              Expanded(
                child: keyChoices.isEmpty
                    ? Text(context.ce('Add the question paper first (in this batch or earlier).'), style: ceText(16, c: CeC.red))
                    : DropdownButtonFormField<String>(
                        key: Key('ce-papers-key-for-$n'),
                        initialValue: keyChoices.any((c) => c.$1 == i.keyFor) ? i.keyFor : null,
                        isExpanded: true,
                        hint: Text(context.ce('Pick the paper')),
                        items: [for (final (id, t) in keyChoices) DropdownMenuItem(value: id, child: Text(t, overflow: TextOverflow.ellipsis))],
                        onChanged: (v) => setState(() => i.keyFor = v),
                      ),
              ),
            ],
          )
        else ...[
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              label(ceTr('Exam')),
              Expanded(
                child: Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [for (final e in Exam.values) choiceChip(e.label, on: i.exam == e, offIcon: null, tick: false, key: Key('ce-papers-exam-$n-${e.id}'), onTap: () => setState(() => i.exam = e))],
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              label(ceTr('Year')),
              _yearStepper(i.year, key: Key('ce-papers-year-$n'), onChanged: (v) => setState(() => i.year = v)),
              const SizedBox(width: 32),
              Text(context.ce('Shift or session'), style: ceText(17, w: FontWeight.w600, c: CeC.navy)),
              const SizedBox(width: 12),
              SizedBox(
                width: 260,
                child: TextFormField(
                  key: Key('ce-papers-session-$n'),
                  initialValue: i.session,
                  decoration: InputDecoration(hintText: context.ce('e.g. Shift 1 (if any)'), isDense: true),
                  onChanged: (v) => i.session = v,
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              label(ceTr('Subject')),
              Expanded(
                child: Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    choiceChip(ceTr('All subjects'), on: i.subjects.isEmpty, offIcon: null, tick: false, onTap: () => setState(() => i.subjects = {})),
                    for (final s in paperSubjects.take(6))
                      choiceChip(s, on: i.subjects.contains(s), offIcon: null, key: Key('ce-papers-subject-$n-$s'), onTap: () => setState(() => i.subjects.contains(s) ? i.subjects.remove(s) : i.subjects.add(s))),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              label(ceTr('Language')),
              for (final l in const ['English', 'Kannada', 'Hindi']) ...[
                choiceChip(l, on: i.language == l, offIcon: null, tick: false, onTap: () => setState(() => i.language = l)),
                const SizedBox(width: 8),
              ],
              const SizedBox(width: 24),
              Text(context.ce('Source'), style: ceText(17, w: FontWeight.w600, c: CeC.navy)),
              const SizedBox(width: 12),
              Expanded(
                child: TextFormField(
                  key: Key('ce-papers-source-$n'),
                  initialValue: i.source,
                  decoration: InputDecoration(hintText: context.ce('Where it is from, e.g. the exam board\'s website'), isDense: true),
                  onChanged: (v) => i.source = v,
                ),
              ),
            ],
          ),
        ],
      ]);
    }
    return Container(
      key: Key('ce-papers-item-$n'),
      padding: const EdgeInsets.all(20),
      decoration: ceCard(shadow: false),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: children),
    );
  }
}

/// "2.4 MB", "180 KB".
String _size(int bytes) => bytes >= 1048576 ? '${(bytes / 1048576).toStringAsFixed(1)} MB' : '${(bytes / 1024).ceil()} KB';

/// − 2023 + with big round buttons.
Widget _yearStepper(int year, {required ValueChanged<int> onChanged, Key? key}) {
  final last = DateTime.now().year + 1;
  Widget b(IconData icon, VoidCallback? onTap) => Material(
    color: Colors.white,
    shape: const CircleBorder(side: BorderSide(color: CeC.line)),
    child: InkWell(
      customBorder: const CircleBorder(),
      onTap: onTap,
      child: Padding(padding: const EdgeInsets.all(10), child: Icon(icon, size: 22, color: onTap == null ? CeC.line : CeC.navy)),
    ),
  );
  return Row(
    key: key,
    mainAxisSize: MainAxisSize.min,
    children: [
      b(Icons.remove, year > 1990 ? () => onChanged(year - 1) : null),
      SizedBox(width: 84, child: Text('$year', textAlign: TextAlign.center, style: ceHeading(24))),
      b(Icons.add, year < last ? () => onChanged(year + 1) : null),
    ],
  );
}

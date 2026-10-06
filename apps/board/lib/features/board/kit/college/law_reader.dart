import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';
import 'package:pdfrx/pdfrx.dart';

import '../../../../l10n/l10n.dart';
import '../../../insert/device_files.dart';
import '../../chrome.dart';
import '../builders.dart' show wrapWords;
import 'college_builders.dart' show noteColors;
import '../../panel/panel_host.dart';

/// A few provisions of Indian statutes, as enacted (Acts of the Government of India are not
/// copyrighted). Only provisions whose wording is certain are included; teachers paste or
/// import the rest. No case reports are shipped.
const sampleProvisions = <(String, String)>[
  (
    'Constitution of India, Article 14',
    '14. Equality before law.—The State shall not deny to any person equality before the law or the equal protection of the laws within the territory of India.',
  ),
  (
    'Constitution of India, Article 21',
    '21. Protection of life and personal liberty.—No person shall be deprived of his life or personal liberty except according to procedure established by law.',
  ),
  (
    'Constitution of India, Article 21A',
    '21A. Right to education.—The State shall provide free and compulsory education to all children of the age of six to fourteen years in such manner as the State may, by law, determine.',
  ),
  ('Indian Contract Act, 1872, section 2(e)', '(e) every promise and every set of promises, forming the consideration for each other, is an agreement;'),
  ('Indian Contract Act, 1872, section 2(h)', '(h) an agreement enforceable by law is a contract;'),
  (
    'Indian Contract Act, 1872, section 10 (first paragraph)',
    '10. What agreements are contracts.—All agreements are contracts if they are made by the free consent of parties competent to contract, for a lawful consideration and with a lawful object, and are not hereby expressly declared to be void.',
  ),
];

/// Text split into paragraphs at blank lines (or at single new lines when it has none).
List<String> paragraphsOf(String text) {
  final t = text.replaceAll('\r', '').trim();
  if (t.isEmpty) return const [];
  final blocks = t.split(RegExp(r'\n\s*\n'));
  final parts = blocks.length > 1 ? blocks : t.split('\n');
  return [for (final p in parts) if (p.trim().isNotEmpty) p.trim().replaceAll(RegExp(r'\s*\n\s*'), ' ')];
}

/// Highlighted paragraphs and their notes as sticky notes for the board, top to bottom: each
/// paragraph in its highlight colour, its note beside it.
List<BoardElement> readerNotes(String title, List<String> paras, Map<int, int> marks, Map<int, String> notes, Color accent) {
  final out = <BoardElement>[];
  var y = 0.0;
  if (title.trim().isNotEmpty) {
    final s = measureBoardText(title, 26, bold: true);
    out.add(TextElement(id: newElementId(), position: Offset.zero, text: title, color: accent, fontSize: 26, size: s, bold: true));
    y = s.height + 16;
  }
  final keys = marks.keys.toList()..sort();
  for (final i in keys) {
    final text = wrapWords(paras[i], 56);
    final h = (text.split('\n').length * 27.5 + 40).clamp(80, 900).toDouble();
    out.add(NoteElement(id: newElementId(), rect: Rect.fromLTWH(0, y, 720, h), text: text, color: noteColors[marks[i]! % noteColors.length], fontSize: 20));
    final note = notes[i];
    if (note != null && note.trim().isNotEmpty) {
      out.add(NoteElement(id: newElementId(), rect: Rect.fromLTWH(740, y, 340, h.clamp(80, 400)), text: wrapWords('✎ ${note.trim()}', 26), color: noteColors[3], fontSize: 18));
    }
    y += h + 16;
  }
  return out;
}

/// Opens the reader; what the teacher highlights goes on [wb].
Future<void> openLawReader(BuildContext context, WhiteboardController wb, Color accent) async {
  final els = await showPanelDialog<List<BoardElement>>(context: context, builder: (_) => BoardChromeTheme(child: LawReaderDialog(accent: accent)));
  if (els != null && els.isNotEmpty) wb.insert(els);
}

/// Reads a bare act or a judgment: paste it or import a PDF, tap paragraphs to highlight them
/// (tap again for another colour, then off), add notes, and put the highlights on the board.
class LawReaderDialog extends StatefulWidget {
  const LawReaderDialog({super.key, required this.accent, this.initialText = ''});
  final Color accent;
  final String initialText;

  @override
  State<LawReaderDialog> createState() => _LawReaderDialogState();
}

class _LawReaderDialogState extends State<LawReaderDialog> {
  late final _text = TextEditingController(text: widget.initialText);
  final _title = TextEditingController();
  late bool _reading = widget.initialText.isNotEmpty;
  List<String> _paras = const [];
  final _marks = <int, int>{};
  final _notes = <int, String>{};

  /// The highlight colours paragraphs cycle through.
  static const _highlights = [0, 1, 2];

  @override
  void initState() {
    super.initState();
    if (_reading) _paras = paragraphsOf(_text.text);
  }

  @override
  void dispose() {
    _text.dispose();
    _title.dispose();
    super.dispose();
  }

  void _read() => setState(() {
    _paras = paragraphsOf(_text.text);
    _marks.clear();
    _notes.clear();
    _reading = _paras.isNotEmpty;
  });

  Future<void> _paste() async {
    final data = await Clipboard.getData(Clipboard.kTextPlain);
    if (data?.text == null) return;
    _text.text = data!.text!;
    _read();
  }

  Future<void> _importPdf() async {
    final l = context.l10n;
    final messenger = ScaffoldMessenger.maybeOf(context);
    final file = await DeviceFiles.instance.pickDocument();
    if (file == null) return;
    var text = '';
    try {
      await pdfrxFlutterInitialize();
      final doc = await PdfDocument.openData(file.bytes);
      try {
        final out = StringBuffer();
        for (final page in doc.pages.take(200)) {
          final t = await page.loadText();
          if (t != null) out.writeln('${t.fullText}\n');
        }
        text = out.toString();
      } finally {
        await doc.dispose();
      }
    } catch (e) {
      debugPrint('PDF text import failed: $e');
    }
    if (!mounted) return;
    if (text.trim().isEmpty) {
      messenger?.showSnackBar(SnackBar(content: Text(l.lawNoText)));
      return;
    }
    _title.text = file.name.replaceAll(RegExp(r'\.pdf$', caseSensitive: false), '');
    _text.text = text;
    _read();
  }

  void _sample((String, String) s) {
    _title.text = s.$1;
    _text.text = s.$2;
    _read();
  }

  void _tap(int i) => setState(() {
    final cur = _marks[i];
    if (cur == null) {
      _marks[i] = _highlights.first;
    } else if (cur == _highlights.last) {
      _marks.remove(i);
    } else {
      _marks[i] = _highlights[_highlights.indexOf(cur) + 1];
    }
  });

  Future<void> _note(int i) async {
    final t = await showPanelDialog<String>(context: context, builder: (_) => _NoteDialog(initial: _notes[i] ?? ''));
    if (t == null) return;
    setState(() {
      if (t.trim().isEmpty) {
        _notes.remove(i);
      } else {
        _notes[i] = t;
        _marks.putIfAbsent(i, () => _highlights.first);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return Dialog.fullscreen(
      key: const Key('law-reader'),
      child: Scaffold(
        appBar: AppBar(
          title: Text(l.lawReader),
          leading: IconButton(tooltip: l.close, onPressed: () => Navigator.pop(context), icon: const Icon(Icons.close)),
          actions: [
            PopupMenuButton<(String, String)>(
              key: const Key('law-samples'),
              tooltip: l.lawSamples,
              icon: const Icon(Icons.gavel_outlined),
              itemBuilder: (_) => [for (final s in sampleProvisions) PopupMenuItem(value: s, child: Text(s.$1))],
              onSelected: _sample,
            ),
            IconButton(key: const Key('law-paste'), tooltip: l.lawPaste, onPressed: _paste, icon: const Icon(Icons.content_paste)),
            IconButton(key: const Key('law-import'), tooltip: l.lawImportPdf, onPressed: _importPdf, icon: const Icon(Icons.picture_as_pdf_outlined)),
            if (_reading) IconButton(key: const Key('law-edit'), tooltip: l.lawEditText, onPressed: () => setState(() => _reading = false), icon: const Icon(Icons.edit_note)),
            const SizedBox(width: Kx.s8),
          ],
        ),
        body: Padding(
          padding: const EdgeInsets.all(Kx.s16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              TextField(controller: _title, decoration: InputDecoration(isDense: true, prefixIcon: const Icon(Icons.title), hintText: l.lawReader)),
              const SizedBox(height: Kx.s12),
              Expanded(
                child: _reading
                    ? ListView.builder(
                        itemCount: _paras.length,
                        itemBuilder: (_, i) {
                          final mark = _marks[i];
                          return Card(
                            key: Key('law-para-$i'),
                            color: mark == null ? null : noteColors[mark].withValues(alpha: 0.9),
                            child: InkWell(
                              onTap: () => _tap(i),
                              child: Padding(
                                padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s12, 4, Kx.s12),
                                child: Row(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment: CrossAxisAlignment.start,
                                        children: [
                                          Text(_paras[i], style: context.text.bodyLarge?.copyWith(color: mark == null ? null : Colors.black87, height: 1.5)),
                                          if (_notes[i] case final n?)
                                            Padding(
                                              padding: const EdgeInsets.only(top: Kx.s8),
                                              child: Text('✎ $n', style: context.text.bodyMedium?.copyWith(fontStyle: FontStyle.italic, color: Colors.black87)),
                                            ),
                                        ],
                                      ),
                                    ),
                                    IconButton(key: Key('law-note-$i'), tooltip: l.lawAddNote, onPressed: () => _note(i), icon: const Icon(Icons.sticky_note_2_outlined)),
                                  ],
                                ),
                              ),
                            ),
                          );
                        },
                      )
                    : TextField(
                        key: const Key('law-text'),
                        controller: _text,
                        expands: true,
                        maxLines: null,
                        textAlignVertical: TextAlignVertical.top,
                        decoration: InputDecoration(hintText: l.lawReaderEmpty, border: const OutlineInputBorder()),
                      ),
              ),
              const SizedBox(height: Kx.s12),
              Align(
                alignment: Alignment.centerRight,
                child: _reading
                    ? FilledButton.icon(
                        key: const Key('law-send'),
                        onPressed: () {
                          if (_marks.isEmpty) {
                            ScaffoldMessenger.maybeOf(context)?.showSnackBar(SnackBar(content: Text(l.lawNothingHighlighted)));
                            return;
                          }
                          Navigator.pop(context, readerNotes(_title.text, _paras, _marks, _notes, widget.accent));
                        },
                        icon: const Icon(Icons.dashboard_customize_outlined),
                        label: Text(l.lawSendToBoard),
                      )
                    : FilledButton.icon(key: const Key('law-read'), onPressed: _read, icon: const Icon(Icons.chrome_reader_mode_outlined), label: Text(l.lawRead)),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _NoteDialog extends StatefulWidget {
  const _NoteDialog({required this.initial});
  final String initial;

  @override
  State<_NoteDialog> createState() => _NoteDialogState();
}

class _NoteDialogState extends State<_NoteDialog> {
  late final _ctl = TextEditingController(text: widget.initial);

  @override
  void dispose() {
    _ctl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return AlertDialog(
      title: Text(l.lawAddNote),
      content: TextField(key: const Key('law-note-text'), controller: _ctl, autofocus: true, minLines: 3, maxLines: 8),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: Text(l.cancel)),
        FilledButton(key: const Key('law-note-save'), onPressed: () => Navigator.pop(context, _ctl.text), child: Text(l.save)),
      ],
    );
  }
}

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../runner/protocol.dart';
import '../runner/runners.dart';
import '../runner/sample_databases.dart';
import '../runner/samples.dart';
import '../runner/sql_runner.dart';
import '../strings.dart';
import 'draw.dart';

/// What to put on the board from the code lab.
enum CodePut { code, codeAndOutput, output }

/// The elements for [put]: the code as a coloured code card, the output as a plain one below.
List<BoardElement> codeLabElements(CodePut put, {required String code, required CodeLanguage language, required String output, double fontSize = 22, Color accent = const Color(0xFF006879)}) => stack([
  if (put != CodePut.output) [codeCard(code.trimRight(), language: language.id, color: accent, fontSize: fontSize)],
  if (put != CodePut.code && output.trim().isNotEmpty) [codeCard(output.trimRight(), language: 'output', color: accent, fontSize: fontSize)],
], gap: 16);

/// The code lab: an editor with colouring, input, Run/Stop, the output, sample programs, a
/// text size for the class, and "Put on board". Python, JavaScript and SQL run on the device;
/// C, C++ and Java on the server ([server], null when the app has none).
class CodeLab extends StatefulWidget {
  const CodeLab({super.key, this.server, this.onInsert, this.initialLanguage = CodeLanguage.python, this.accent = const Color(0xFF006879), this.webRunner});

  final ServerRunner? server;

  /// Null where there is no board (the Student App): the button is then hidden.
  final void Function(List<BoardElement> elements)? onInsert;
  final CodeLanguage initialLanguage;
  final Color accent;

  /// Tests pass a WebRunner with a fake page.
  final WebRunner? webRunner;

  @override
  State<CodeLab> createState() => _CodeLabState();
}

class _CodeLabState extends State<CodeLab> {
  late final HybridRunner _runner = HybridRunner(web: widget.webRunner ?? WebRunner(), sql: SqlRunner(), server: widget.server);
  late CodeLanguage _lang = widget.initialLanguage;
  late final _code = CodeEditingController(language: _lang.id);
  final _stdin = TextEditingController();
  String? _database = 'students';
  double _font = 18;
  bool _running = false;
  bool _startingPython = false;
  RunResult? _result;
  StreamSubscription<String>? _loading;

  @override
  void initState() {
    super.initState();
    _sample(samplesFor(_lang).first);
    _loading = _runner.web.loading.listen((t) {
      if (mounted) setState(() => _startingPython = t.isNotEmpty);
    });
    if (_lang == CodeLanguage.python) unawaited(_runner.web.warm());
  }

  @override
  void dispose() {
    _loading?.cancel();
    _runner.dispose();
    _code.dispose();
    _stdin.dispose();
    super.dispose();
  }

  void _setLanguage(CodeLanguage l) {
    if (l == _lang) return;
    _runner.stop();
    setState(() {
      _lang = l;
      _code.language = l.id;
      _result = null;
    });
    _sample(samplesFor(l).first);
    if (l == CodeLanguage.python) unawaited(_runner.web.warm());
  }

  void _sample(Sample s) {
    setState(() {
      _code.text = s.code;
      _stdin.text = s.stdin;
      if (s.language == CodeLanguage.sql) _database = s.database;
      _result = null;
    });
  }

  Future<void> _run() async {
    if (_running) {
      _runner.stop();
      return;
    }
    setState(() {
      _running = true;
      _result = null;
    });
    final r = await _runner.run(RunRequest(_lang, _code.text, stdin: _stdin.text, database: _database));
    if (!mounted) return;
    setState(() {
      _running = false;
      _startingPython = false;
      _result = r;
    });
  }

  String _why(CsStrings s, RunResult r) {
    final m = r.message ?? '';
    if (m.startsWith('signIn')) return s.t('why_signIn');
    if (m.startsWith('noServer')) return s.t('why_noServer');
    if (m.startsWith('noWebView')) return s.t('why_noWebView');
    if (m.startsWith('offline')) return s.t('why_offline');
    return s.t('why_server');
  }

  @override
  Widget build(BuildContext context) {
    final s = CsStrings.of(context);
    final mono = TextStyle(fontFamily: KxFonts.code, fontFamilyFallback: KxFonts.fallback, fontSize: _font, height: 1.4);
    final r = _result;
    final output = r == null
        ? ''
        : r.status == RunStatus.unavailable
        ? _why(s, r)
        : (r.combined.isEmpty && r.ok ? s.t('noOutput') : r.combined);
    final statusColor = r == null ? null : (r.ok ? const Color(0xFF188038) : const Color(0xFFD93025));
    return Stack(
      children: [
        // The WebView that runs Python and JavaScript must be in the tree on Android.
        Positioned(left: 0, top: 0, width: 1, height: 1, child: IgnorePointer(child: _runner.web.view())),
        Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Wrap(
              spacing: 8,
              runSpacing: 8,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                SegmentedButton<CodeLanguage>(
                  key: const Key('code-language'),
                  showSelectedIcon: false,
                  segments: [for (final l in CodeLanguage.values) ButtonSegment(value: l, label: Text(l.label))],
                  selected: {_lang},
                  onSelectionChanged: (v) => _setLanguage(v.first),
                ),
                Chip(
                  avatar: Icon(_lang.onDevice ? Icons.offline_bolt_outlined : Icons.cloud_outlined, size: 18),
                  label: Text(s.t(_lang.onDevice ? 'onDevice' : 'onServer')),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                PopupMenuButton<Sample>(
                  key: const Key('code-samples'),
                  tooltip: s.t('samples'),
                  onSelected: _sample,
                  itemBuilder: (_) => [for (final x in samplesFor(_lang)) PopupMenuItem(value: x, child: Text(s.t(x.key)))],
                  child: Chip(avatar: const Icon(Icons.library_books_outlined, size: 18), label: Text(s.t('samples'))),
                ),
                if (_lang == CodeLanguage.sql) ...[
                  const SizedBox(width: 8),
                  DropdownButton<String?>(
                    key: const Key('code-database'),
                    value: _database,
                    items: [
                      for (final d in sampleDatabases.keys) DropdownMenuItem(value: d, child: Text('${s.t('database')}: ${s.t('db$d')}')),
                      DropdownMenuItem(value: null, child: Text(s.t('emptyDb'))),
                    ],
                    onChanged: (v) => setState(() => _database = v),
                  ),
                ],
                const Spacer(),
                Text(s.t('textSize')),
                IconButton(tooltip: '−', icon: const Icon(Icons.text_decrease), onPressed: _font > 12 ? () => setState(() => _font -= 2) : null),
                IconButton(tooltip: '+', icon: const Icon(Icons.text_increase), onPressed: _font < 40 ? () => setState(() => _font += 2) : null),
              ],
            ),
            const SizedBox(height: 8),
            Expanded(
              flex: 3,
              child: _DarkPane(
                child: TextField(
                  key: const Key('code-editor'),
                  controller: _code,
                  expands: true,
                  maxLines: null,
                  style: mono.copyWith(color: CodeTheme.dark.plain),
                  cursorColor: CodeTheme.dark.plain,
                  keyboardType: TextInputType.multiline,
                  autocorrect: false,
                  enableSuggestions: false,
                  inputFormatters: [_TabToSpaces()],
                  decoration: const InputDecoration(border: InputBorder.none, contentPadding: EdgeInsets.all(14), filled: false),
                ),
              ),
            ),
            const SizedBox(height: 8),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: TextField(
                    key: const Key('code-stdin'),
                    controller: _stdin,
                    minLines: 1,
                    maxLines: 3,
                    style: mono.copyWith(fontSize: _font * 0.85),
                    decoration: InputDecoration(labelText: _lang == CodeLanguage.sql ? null : s.t('input'), hintText: s.t('inputHint'), isDense: true, enabled: _lang != CodeLanguage.sql),
                  ),
                ),
                const SizedBox(width: 12),
                FilledButton.icon(
                  key: const Key('code-run'),
                  style: FilledButton.styleFrom(backgroundColor: _running ? const Color(0xFFD93025) : widget.accent, minimumSize: const Size(120, 52)),
                  icon: Icon(_running ? Icons.stop : Icons.play_arrow),
                  label: Text(s.t(_running ? 'stop' : 'run')),
                  onPressed: _run,
                ),
                if (widget.onInsert != null) ...[
                  const SizedBox(width: 8),
                  PopupMenuButton<CodePut>(
                    key: const Key('code-put'),
                    tooltip: s.t('putOnBoard'),
                    onSelected: (p) => widget.onInsert!(
                      codeLabElements(p, code: _code.text, language: _lang, output: r == null ? '' : output, fontSize: _font + 4, accent: widget.accent),
                    ),
                    itemBuilder: (_) => [
                      PopupMenuItem(value: CodePut.code, child: Text(s.t('putCode'))),
                      PopupMenuItem(value: CodePut.codeAndOutput, enabled: r != null, child: Text(s.t('putCodeOutput'))),
                      PopupMenuItem(value: CodePut.output, enabled: r != null, child: Text(s.t('putOutput'))),
                    ],
                    child: Chip(avatar: const Icon(Icons.add_to_photos_outlined, size: 18), label: Text(s.t('putOnBoard'))),
                  ),
                ],
              ],
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Text(s.t('output'), style: Theme.of(context).textTheme.titleSmall),
                const SizedBox(width: 12),
                if (_running) ...[
                  const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2)),
                  const SizedBox(width: 8),
                  Text(s.t(_startingPython ? 'startingPython' : 'running')),
                ],
                if (r != null) ...[
                  Text(s.t('status_${r.status.wire}'), key: const Key('code-status'), style: TextStyle(color: statusColor, fontWeight: FontWeight.w700)),
                  if (r.timeMs > 0) Text('  ·  ${s.t('timeMs', [r.timeMs])}'),
                ],
              ],
            ),
            const SizedBox(height: 4),
            Expanded(
              flex: 2,
              child: _DarkPane(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.all(14),
                  child: SelectableText(output, key: const Key('code-output'), style: mono.copyWith(color: r != null && !r.ok ? const Color(0xFFFFB4AB) : CodeTheme.dark.plain)),
                ),
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class _DarkPane extends StatelessWidget {
  const _DarkPane({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) => DecoratedBox(
    decoration: BoxDecoration(color: CodeTheme.dark.background, borderRadius: BorderRadius.circular(12)),
    child: Theme(data: Theme.of(context).copyWith(textSelectionTheme: const TextSelectionThemeData(selectionColor: Color(0x664F8CFF))), child: child),
  );
}

/// Tab inserts four spaces (Python cares; panels' on-screen keyboards have no Tab anyway).
class _TabToSpaces extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(TextEditingValue oldValue, TextEditingValue newValue) {
    if (!newValue.text.contains('\t')) return newValue;
    final before = newValue.selection.baseOffset;
    final tabsBefore = before < 0 ? 0 : '\t'.allMatches(newValue.text.substring(0, before.clamp(0, newValue.text.length))).length;
    final text = newValue.text.replaceAll('\t', '    ');
    final at = before < 0 ? text.length : before + tabsBefore * 3;
    return TextEditingValue(text: text, selection: TextSelection.collapsed(offset: at));
  }
}

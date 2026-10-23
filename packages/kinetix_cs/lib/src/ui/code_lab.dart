import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../runner/code_box.dart';
import '../runner/issues.dart';
import '../runner/protocol.dart';
import '../runner/python_runtime.dart';
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
/// text size for the class, and "Put on board". Python, JavaScript and SQL run on the device,
/// offline; C, C++ and Java on the school code box ([box]) or else the Zynetix server
/// ([server]); each run says where it ran (HybridRunner).
class CodeLab extends StatefulWidget {
  const CodeLab({
    super.key,
    this.server,
    this.box,
    this.python,
    this.subject,
    this.onOpenSettings,
    this.onInsert,
    this.initialLanguage = CodeLanguage.python,
    this.accent = const Color(0xFF006879),
    this.webRunner,
    this.initialSample,
  });

  final ServerRunner? server;

  /// The school code box to use (null: none is looked for).
  final CodeBox? box;

  /// Where Python comes from on this device (null: PythonRuntime.shared).
  final PythonRuntime? python;

  /// The curriculum subject (CurriculumSubject id, e.g. `dbms`): its samples come first, and
  /// its language is the first one shown.
  final String? subject;

  /// Opens the app's settings at the code box (null: the button is hidden).
  final VoidCallback? onOpenSettings;

  /// Null where there is no board (the Student App): the button is then hidden.
  final void Function(List<BoardElement> elements)? onInsert;
  final CodeLanguage initialLanguage;
  final Color accent;

  /// Tests pass a WebRunner with a fake page.
  final WebRunner? webRunner;

  /// Code to open with instead of the first sample (e.g. CREATE TABLEs from an ER diagram).
  final Sample? initialSample;

  @override
  State<CodeLab> createState() => _CodeLabState();
}

class _CodeLabState extends State<CodeLab> {
  late final PythonRuntime _python = widget.python ?? PythonRuntime.shared;
  late final HybridRunner _runner = HybridRunner(
    web: widget.webRunner ?? WebRunner(),
    sql: SqlRunner(),
    server: widget.server,
    box: widget.box == null ? null : CodeBoxRunner(widget.box),
    // A test's fake page has Python; a real one asks the runtime.
    python: widget.webRunner == null ? _python : null,
  );
  late CodeLanguage _lang = widget.initialSample?.language ?? languageForSubject(widget.subject) ?? widget.initialLanguage;
  List<RunPlace>? _plan;
  List<CodeIssue> _issues = const [];
  late final _code = CodeEditingController(language: _lang.id);
  final _stdin = TextEditingController();
  final _editorFocus = FocusNode();
  String? _database = 'students';
  double _font = 18;
  bool _running = false;
  bool _startingPython = false;
  RunResult? _result;
  StreamSubscription<String>? _loading;

  @override
  void initState() {
    super.initState();
    _sample(widget.initialSample ?? samplesFor(_lang, subject: widget.subject).first);
    _python.state.addListener(_pythonChanged);
    unawaited(_replan());
    _loading = _runner.web.loading.listen((t) {
      if (mounted) setState(() => _startingPython = t.isNotEmpty);
    });
    if (_lang == CodeLanguage.python) unawaited(_runner.web.warm());
  }

  /// Where the current language would run, for the chip.
  Future<void> _replan() async {
    final l = _lang;
    final p = await _runner.plan(l);
    if (mounted && l == _lang) setState(() => _plan = p);
  }

  void _pythonChanged() {
    if (mounted) setState(() {});
  }

  Future<void> _getPython() async {
    if (await _python.download()) {
      _runner.web.reset();
      if (mounted) setState(() => _result = null);
      await _replan();
    }
  }

  @override
  void dispose() {
    _python.state.removeListener(_pythonChanged);
    _loading?.cancel();
    _runner.dispose();
    _code.dispose();
    _stdin.dispose();
    _editorFocus.dispose();
    super.dispose();
  }

  void _setLanguage(CodeLanguage l) {
    if (l == _lang) return;
    _runner.stop();
    setState(() {
      _lang = l;
      _code.language = l.id;
      _result = null;
      _plan = null;
    });
    _sample(samplesFor(l, subject: widget.subject).first);
    unawaited(_replan());
    if (l == CodeLanguage.python) unawaited(_runner.web.warm());
  }

  void _sample(Sample s) {
    setState(() {
      _code.text = s.code;
      _stdin.text = s.stdin;
      if (s.language == CodeLanguage.sql) _database = s.database;
      _result = null;
      _issues = const [];
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
      _issues = const [];
    });
    final source = _code.text;
    final r = await _runner.run(RunRequest(_lang, source, stdin: _stdin.text, database: _database));
    if (!mounted) return;
    setState(() {
      _running = false;
      _startingPython = false;
      _result = r;
      _issues = r.ok ? const [] : issuesOf(_lang, r, source: source);
    });
    if (r.status == RunStatus.unavailable || r.place != null) unawaited(_replan());
  }

  /// Puts the cursor at the start of [line] in the editor.
  void _goToLine(int line) {
    final at = offsetOfLine(_code.text, line);
    final end = _code.text.indexOf('\n', at);
    _code.selection = TextSelection(baseOffset: at, extentOffset: end < 0 ? _code.text.length : end);
    _editorFocus.requestFocus();
  }

  String _place(CsStrings s, RunPlace? p) => switch (p) {
    RunPlace.device => s.t('place_device'),
    RunPlace.box => [s.t('place_box'), if (widget.box?.current.value?.host case final h?) '($h)'].join(' '),
    RunPlace.server => s.t('place_server'),
    null => s.t('place_none'),
  };

  void _boxHelp(CsStrings s) => showDialog<void>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text(s.t('boxHelpTitle')),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            for (final (i, k) in ['boxHelp1', 'boxHelp2', 'boxHelp3'].indexed)
              Padding(padding: const EdgeInsets.only(bottom: 10), child: SelectableText('${i + 1}. ${s.t(k)}')),
          ],
        ),
      ),
      actions: [
        if (widget.onOpenSettings != null)
          TextButton(
            onPressed: () {
              Navigator.pop(ctx);
              widget.onOpenSettings!();
            },
            child: Text(s.t('openSettings')),
          ),
        FilledButton(onPressed: () => Navigator.pop(ctx), child: Text(s.t('close'))),
      ],
    ),
  );

  String _why(CsStrings s, RunResult r) {
    final m = r.message ?? '';
    if (m == 'needsBox') return s.t('why_needsBox', [_lang.label]);
    if (m == 'needsPython') return s.t('why_needsPython');
    if (m == 'boxKey') return s.t('why_boxKey');
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
                // Scrolls sideways on phones.
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: SegmentedButton<CodeLanguage>(
                    key: const Key('code-language'),
                    showSelectedIcon: false,
                    segments: [for (final l in CodeLanguage.values) ButtonSegment(value: l, label: Text(l.label))],
                    selected: {_lang},
                    onSelectionChanged: (v) => _setLanguage(v.first),
                  ),
                ),
                Chip(
                  key: const Key('code-place'),
                  avatar: Icon(switch (_plan?.firstOrNull) {
                    RunPlace.device => Icons.offline_bolt_outlined,
                    RunPlace.box => Icons.dns_outlined,
                    RunPlace.server => Icons.cloud_outlined,
                    null => _plan == null ? Icons.hourglass_empty : Icons.block,
                  }, size: 18),
                  label: Text(_plan == null ? s.t(_lang.onDevice ? 'onDevice' : 'onServer') : _place(s, _plan!.firstOrNull)),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Wrap(
              crossAxisAlignment: WrapCrossAlignment.center,
              spacing: 8,
              children: [
                PopupMenuButton<Sample>(
                  key: const Key('code-samples'),
                  tooltip: s.t('samples'),
                  onSelected: _sample,
                  itemBuilder: (_) => [for (final x in samplesFor(_lang, subject: widget.subject)) PopupMenuItem(value: x, child: Text(s.t(x.key)))],
                  child: Chip(avatar: const Icon(Icons.library_books_outlined, size: 18), label: Text(s.t('samples'))),
                ),
                if (_lang == CodeLanguage.sql) ...[
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
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(s.t('textSize')),
                    IconButton(tooltip: '−', icon: const Icon(Icons.text_decrease), onPressed: _font > 12 ? () => setState(() => _font -= 2) : null),
                    IconButton(tooltip: '+', icon: const Icon(Icons.text_increase), onPressed: _font < 40 ? () => setState(() => _font += 2) : null),
                  ],
                ),
              ],
            ),
            const SizedBox(height: 8),
            Expanded(
              flex: 3,
              child: _DarkPane(
                child: TextField(
                  key: const Key('code-editor'),
                  controller: _code,
                  focusNode: _editorFocus,
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
                  if (r.place != null) Flexible(child: Text('  ·  ${s.t('ranOn', [_place(s, r.place)])}', key: const Key('code-ran-on'), overflow: TextOverflow.ellipsis)),
                ],
              ],
            ),
            if (r?.status == RunStatus.unavailable && (r!.message == 'needsPython' || r.message == 'needsBox' || r.message == 'boxKey'))
              Padding(padding: const EdgeInsets.only(top: 4), child: _actions(s, r)),
            if (_issues.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Wrap(
                  key: const Key('code-issues'),
                  spacing: 6,
                  runSpacing: 4,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    Text(s.t('issues')),
                    for (final i in _issues)
                      ActionChip(
                        avatar: Icon(i.error ? Icons.error_outline : Icons.warning_amber, size: 16, color: i.error ? const Color(0xFFD93025) : const Color(0xFFB06000)),
                        label: Text(s.t('issueLine', [i.line, i.message.length > 70 ? '${i.message.substring(0, 70)}…' : i.message])),
                        onPressed: () => _goToLine(i.line),
                      ),
                  ],
                ),
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

extension on _CodeLabState {
  /// "Get Python for offline use" and the code box's setup, under a run that could not happen.
  Widget _actions(CsStrings s, RunResult r) {
    final py = _python.state.value;
    return Wrap(
      spacing: 8,
      runSpacing: 6,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        if (r.message == 'needsPython' && _python.canDownload)
          py.status == PythonStatus.downloading
              ? Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    SizedBox(width: 120, child: LinearProgressIndicator(value: py.progress)),
                    const SizedBox(width: 8),
                    Text(s.t('gettingPython', [(py.progress * 100).round()])),
                  ],
                )
              : FilledButton.icon(key: const Key('code-get-python'), onPressed: _getPython, icon: const Icon(Icons.download), label: Text(s.t('getPython'))),
        if (r.message == 'needsPython' && py.status == PythonStatus.failed) Text(s.t('pythonFailed'), style: const TextStyle(color: Color(0xFFD93025))),
        if (r.message == 'needsPython' && py.status == PythonStatus.ready) Text(s.t('pythonReady')),
        if (r.message != 'needsPython' || !_python.canDownload)
          OutlinedButton.icon(key: const Key('code-box-help'), onPressed: () => _boxHelp(s), icon: const Icon(Icons.help_outline), label: Text(s.t('boxHelp'))),
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

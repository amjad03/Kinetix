import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:kinetix_cs/kinetix_cs.dart';
import 'package:kinetix_ui/kinetix_ui.dart';
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../../core/board_controller.dart';
import '../../../../l10n/feature_strings.dart';

/// Where the board's code lab runs code (packages/kinetix_cs HybridRunner): Python, JavaScript
/// and SQL on the board, offline; C, C++ and Java on the school code box
/// (docs/operations/school-code-box.md), else the KINETIX server.
///
/// This sets up [CodeBox.shared] (this board's box address and key from Board settings → School
/// code box, the institution's `codeBoxUrl` from the board config, mDNS, the school server) and
/// [PythonRuntime.shared] (the Pyodide the Board already ships with JupyterLite, else a copy
/// fetched once from the code box, the KINETIX server or jsDelivr and kept on the board).
abstract final class CodeBoxSettings {
  static const _urlKey = 'kinetix.codeBox.url', _keyKey = 'kinetix.codeBox.key', _instKey = 'kinetix.codeBox.institution';

  /// The Board's own copy of Pyodide (assets/simhub/jupyterlite/pyodide, used by JupyterLite too).
  static const boardPyodide = PythonBundle('assets/simhub/jupyterlite/pyodide/', module: true);

  static BoardController? _board;
  static bool _attached = false;

  /// Bumped when the settings change, for the settings section.
  static final changes = ValueNotifier<int>(0);

  /// Reads the saved settings and follows [board]'s server and config. Safe to call often.
  static Future<void> attach(BoardController? board) async {
    final box = CodeBox.shared;
    if (board != null && board != _board) {
      _board?.removeListener(_follow);
      _board = board..addListener(_follow);
      _follow();
    }
    if (_attached) return;
    _attached = true;
    BoardController.configListeners.add(applyConfig);
    // No multicast under flutter test.
    if (!Platform.environment.containsKey('FLUTTER_TEST')) box.discover = discoverCodeBoxes;
    final py = PythonRuntime.shared
      ..bundled = [boardPyodide, ...PythonRuntime.shared.bundled.where((b) => b.prefix != boardPyodide.prefix)]
      ..cacheRoot = _supportDir;
    box.current.addListener(_pythonServers);
    _pythonServers();
    try {
      final p = await SharedPreferences.getInstance();
      box
        ..own = CodeBox.clean(p.getString(_urlKey))
        ..key = p.getString(_keyKey)
        ..institution = CodeBox.clean(p.getString(_instKey));
    } catch (_) {
      // No saved settings (tests without the plugin).
    }
    changes.value++;
    unawaited(py.locate());
  }

  static Future<Directory?> _supportDir() async {
    try {
      return await getApplicationSupportDirectory();
    } catch (_) {
      return null;
    }
  }

  static void _follow() {
    final api = _board?.serverUrl;
    if (api == CodeBox.shared.apiBase) return;
    CodeBox.shared
      ..apiBase = api
      ..forget();
    _pythonServers();
  }

  /// Python is fetched from the code box first, then the KINETIX server, then jsDelivr.
  static void _pythonServers() {
    const v = PythonRuntime.version;
    PythonRuntime.shared.servers = [
      if (CodeBox.shared.current.value case final b?) '${b.base}/assets/pyodide/$v/',
      if (CodeBox.shared.apiBase case final a?) '$a/assets/pyodide/$v/',
    ];
  }

  /// The institution's code box from the board config (`codeBoxUrl`), kept for offline.
  static void applyConfig(Map<String, dynamic> config) {
    final v = config['codeBoxUrl'];
    final url = v is String ? CodeBox.clean(v) : null;
    if (url == CodeBox.shared.institution) return;
    CodeBox.shared
      ..institution = url
      ..forget();
    changes.value++;
    unawaited(_save(_instKey, url));
  }

  /// Saves this board's box address (empty clears it) and key. Returns whether [url] was usable.
  static Future<bool> save(String url, String key) async {
    final clean = CodeBox.clean(url);
    if (url.trim().isNotEmpty && clean == null) return false;
    CodeBox.shared
      ..own = clean
      ..key = key.trim().isEmpty ? null : key.trim()
      ..forget();
    changes.value++;
    await _save(_urlKey, clean);
    await _save(_keyKey, CodeBox.shared.key);
    return true;
  }

  static Future<void> _save(String k, String? v) async {
    try {
      final p = await SharedPreferences.getInstance();
      v == null ? await p.remove(k) : await p.setString(k, v);
    } catch (_) {}
  }

  /// Tests start clean.
  @visibleForTesting
  static void reset() {
    _board?.removeListener(_follow);
    _board = null;
    if (_attached) {
      BoardController.configListeners.remove(applyConfig);
      CodeBox.shared.current.removeListener(_pythonServers);
    }
    _attached = false;
    CodeBox.shared = CodeBox();
    PythonRuntime.shared = PythonRuntime();
  }
}

FeatureStrings codeBoxStrings(String lang) => FeatureStrings(lang, codeBoxStringTable);

const codeBoxStringTable = <String, Map<String, String>>{
  'en': {
    'title': 'School code box',
    'hint': 'Python, JavaScript and SQL run on this board, offline. C, C++ and Java run on the school code box: a spare PC on the school network (docs/operations/school-code-box.md). The board looks for it in this order: the address below, your institution\'s setting, the network, the school server.',
    'field': 'Code box address',
    'fieldHint': 'For example 192.168.1.20 or http://lab-pc.local:8181',
    'key': 'Box key (if the box has one)',
    'save': 'Save',
    'find': 'Find',
    'finding': 'Looking for the code box…',
    'invalid': 'Enter an address like 192.168.1.20 or http://lab-pc:8181',
    'found': 'Code box found: {n}',
    'none': 'No code box found. C, C++ and Java will use the KINETIX server when it can be reached.',
    'runs': 'Runs: {n}',
    'python': 'Python on this board',
    'pyBundled': 'Ready (comes with the board app)',
    'pyDownloaded': 'Ready (kept on this board)',
    'pyMissing': 'Not on this board yet',
    'pyGet': 'Get Python for offline use',
    'pyGetting': 'Getting Python… {n}%',
    'pyFailed': 'Could not get Python. Connect to the internet or the code box, and try again.',
    'setup': 'Set up a code box: on a spare PC with Docker, run docker compose -f infra/school-code-box/docker-compose.yml up -d, then press Find here.',
  },
  'hi': {
    'title': 'स्कूल कोड बॉक्स',
    'hint': 'Python, JavaScript और SQL इसी बोर्ड पर बिना इंटरनेट चलते हैं। C, C++ और Java स्कूल के कोड बॉक्स पर चलते हैं: स्कूल नेटवर्क पर एक खाली PC (docs/operations/school-code-box.md)। बोर्ड इसे इस क्रम में खोजता है: नीचे दिया पता, आपके संस्थान की सेटिंग, नेटवर्क, स्कूल सर्वर।',
    'field': 'कोड बॉक्स का पता',
    'fieldHint': 'उदाहरण: 192.168.1.20 या http://lab-pc.local:8181',
    'key': 'बॉक्स की कुंजी (यदि बॉक्स में है)',
    'save': 'सहेजें',
    'find': 'खोजें',
    'finding': 'कोड बॉक्स खोजा जा रहा है…',
    'invalid': '192.168.1.20 या http://lab-pc:8181 जैसा पता लिखें',
    'found': 'कोड बॉक्स मिला: {n}',
    'none': 'कोई कोड बॉक्स नहीं मिला। C, C++ और Java पहुँच में होने पर KINETIX सर्वर पर चलेंगे।',
    'runs': 'चलाता है: {n}',
    'python': 'इस बोर्ड पर Python',
    'pyBundled': 'तैयार (बोर्ड ऐप के साथ आता है)',
    'pyDownloaded': 'तैयार (इस बोर्ड पर रखा है)',
    'pyMissing': 'अभी इस बोर्ड पर नहीं है',
    'pyGet': 'ऑफ़लाइन उपयोग के लिए Python लें',
    'pyGetting': 'Python आ रहा है… {n}%',
    'pyFailed': 'Python नहीं मिल सका। इंटरनेट या कोड बॉक्स से जुड़ें और फिर कोशिश करें।',
    'setup': 'कोड बॉक्स सेट करें: Docker वाले किसी खाली PC पर docker compose -f infra/school-code-box/docker-compose.yml up -d चलाएँ, फिर यहाँ खोजें दबाएँ।',
  },
  'kn': {
    'title': 'ಶಾಲಾ ಕೋಡ್ ಬಾಕ್ಸ್',
    'hint': 'Python, JavaScript ಮತ್ತು SQL ಈ ಬೋರ್ಡ್‌ನಲ್ಲೇ ಇಂಟರ್ನೆಟ್ ಇಲ್ಲದೆ ನಡೆಯುತ್ತವೆ. C, C++ ಮತ್ತು Java ಶಾಲೆಯ ಕೋಡ್ ಬಾಕ್ಸ್‌ನಲ್ಲಿ ನಡೆಯುತ್ತವೆ: ಶಾಲಾ ನೆಟ್‌ವರ್ಕ್‌ನ ಒಂದು ಬಿಡುವಿನ PC (docs/operations/school-code-box.md). ಬೋರ್ಡ್ ಇದನ್ನು ಈ ಕ್ರಮದಲ್ಲಿ ಹುಡುಕುತ್ತದೆ: ಕೆಳಗಿನ ವಿಳಾಸ, ನಿಮ್ಮ ಸಂಸ್ಥೆಯ ಸೆಟ್ಟಿಂಗ್, ನೆಟ್‌ವರ್ಕ್, ಶಾಲಾ ಸರ್ವರ್.',
    'field': 'ಕೋಡ್ ಬಾಕ್ಸ್ ವಿಳಾಸ',
    'fieldHint': 'ಉದಾಹರಣೆ: 192.168.1.20 ಅಥವಾ http://lab-pc.local:8181',
    'key': 'ಬಾಕ್ಸ್ ಕೀ (ಬಾಕ್ಸ್‌ನಲ್ಲಿ ಇದ್ದರೆ)',
    'save': 'ಉಳಿಸಿ',
    'find': 'ಹುಡುಕಿ',
    'finding': 'ಕೋಡ್ ಬಾಕ್ಸ್ ಹುಡುಕಲಾಗುತ್ತಿದೆ…',
    'invalid': '192.168.1.20 ಅಥವಾ http://lab-pc:8181 ರೀತಿಯ ವಿಳಾಸ ಬರೆಯಿರಿ',
    'found': 'ಕೋಡ್ ಬಾಕ್ಸ್ ಸಿಕ್ಕಿದೆ: {n}',
    'none': 'ಯಾವ ಕೋಡ್ ಬಾಕ್ಸ್ ಸಿಗಲಿಲ್ಲ. ತಲುಪಲು ಸಾಧ್ಯವಾದಾಗ C, C++ ಮತ್ತು Java KINETIX ಸರ್ವರ್‌ನಲ್ಲಿ ನಡೆಯುತ್ತವೆ.',
    'runs': 'ನಡೆಸುವುದು: {n}',
    'python': 'ಈ ಬೋರ್ಡ್‌ನಲ್ಲಿ Python',
    'pyBundled': 'ಸಿದ್ಧ (ಬೋರ್ಡ್ ಆ್ಯಪ್ ಜೊತೆ ಬರುತ್ತದೆ)',
    'pyDownloaded': 'ಸಿದ್ಧ (ಈ ಬೋರ್ಡ್‌ನಲ್ಲಿ ಇರಿಸಲಾಗಿದೆ)',
    'pyMissing': 'ಇನ್ನೂ ಈ ಬೋರ್ಡ್‌ನಲ್ಲಿ ಇಲ್ಲ',
    'pyGet': 'ಆಫ್‌ಲೈನ್ ಬಳಕೆಗೆ Python ಪಡೆಯಿರಿ',
    'pyGetting': 'Python ಬರುತ್ತಿದೆ… {n}%',
    'pyFailed': 'Python ಪಡೆಯಲಾಗಲಿಲ್ಲ. ಇಂಟರ್ನೆಟ್ ಅಥವಾ ಕೋಡ್ ಬಾಕ್ಸ್‌ಗೆ ಸಂಪರ್ಕಿಸಿ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.',
    'setup': 'ಕೋಡ್ ಬಾಕ್ಸ್ ಹೊಂದಿಸಿ: Docker ಇರುವ ಬಿಡುವಿನ PC ಯಲ್ಲಿ docker compose -f infra/school-code-box/docker-compose.yml up -d ನಡೆಸಿ, ನಂತರ ಇಲ್ಲಿ ಹುಡುಕಿ ಒತ್ತಿರಿ.',
  },
};

/// Board settings → School code box: the box's address and key, Find, what it runs, and
/// whether Python is on this board.
class CodeBoxSection extends StatefulWidget {
  const CodeBoxSection({super.key, this.board});

  final BoardController? board;

  @override
  State<CodeBoxSection> createState() => _CodeBoxSectionState();
}

class _CodeBoxSectionState extends State<CodeBoxSection> {
  final _url = TextEditingController();
  final _key = TextEditingController();
  String? _error;
  bool _finding = false;

  @override
  void initState() {
    super.initState();
    unawaited(
      CodeBoxSettings.attach(widget.board).then((_) {
        if (!mounted) return;
        _url.text = CodeBox.shared.own ?? '';
        _key.text = CodeBox.shared.key ?? '';
        unawaited(_find());
      }),
    );
  }

  @override
  void dispose() {
    _url.dispose();
    _key.dispose();
    super.dispose();
  }

  Future<void> _find() async {
    setState(() => _finding = true);
    await CodeBox.shared.find(refresh: true);
    if (mounted) setState(() => _finding = false);
  }

  Future<void> _save(FeatureStrings s) async {
    final ok = await CodeBoxSettings.save(_url.text, _key.text);
    if (!mounted) return;
    setState(() => _error = ok ? null : s['invalid']);
    if (ok) {
      _url.text = CodeBox.shared.own ?? '';
      await _find();
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = codeBoxStrings(boardLang(context));
    final hint = context.text.bodyMedium?.copyWith(color: context.colors.onSurfaceVariant);
    final py = PythonRuntime.shared;
    return Column(
      key: const Key('code-box-settings'),
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(s['title'], style: context.text.titleSmall),
        const SizedBox(height: Kx.s4),
        Text(s['hint'], style: hint),
        const SizedBox(height: Kx.s8),
        TextField(
          key: const Key('code-box-url'),
          controller: _url,
          keyboardType: TextInputType.url,
          autocorrect: false,
          decoration: InputDecoration(labelText: s['field'], hintText: s['fieldHint'], errorText: _error, isDense: true),
          onSubmitted: (_) => _save(s),
        ),
        const SizedBox(height: Kx.s8),
        TextField(
          key: const Key('code-box-key'),
          controller: _key,
          autocorrect: false,
          obscureText: true,
          decoration: InputDecoration(labelText: s['key'], isDense: true),
          onSubmitted: (_) => _save(s),
        ),
        const SizedBox(height: Kx.s8),
        Wrap(
          spacing: Kx.s8,
          runSpacing: Kx.s8,
          children: [
            FilledButton(key: const Key('code-box-save'), onPressed: () => _save(s), child: Text(s['save'])),
            OutlinedButton.icon(key: const Key('code-box-find'), onPressed: _finding ? null : _find, icon: const Icon(Icons.wifi_find), label: Text(s['find'])),
          ],
        ),
        const SizedBox(height: Kx.s8),
        ValueListenableBuilder<CodeBoxInfo?>(
          valueListenable: CodeBox.shared.current,
          builder: (context, box, _) {
            if (_finding) return Text(s['finding'], style: hint);
            if (box == null) return Text(s['none'], key: const Key('code-box-none'), style: hint);
            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(s.n('found', [?box.name, box.host].join(' · ')), key: const Key('code-box-found')),
                Text(s.n('runs', [for (final l in CodeLanguage.values) if (box.languages.contains(l)) l.label].join(', ')), style: hint),
              ],
            );
          },
        ),
        const SizedBox(height: Kx.s12),
        ValueListenableBuilder<PythonState>(
          valueListenable: py.state,
          builder: (context, st, _) => Wrap(
            spacing: Kx.s8,
            runSpacing: Kx.s4,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              Text('${s['python']}: '),
              switch (st.status) {
                PythonStatus.ready => Text(st.source?.downloaded ?? false ? s['pyDownloaded'] : s['pyBundled'], key: const Key('code-box-python')),
                PythonStatus.downloading => Text(s.n('pyGetting', (st.progress * 100).round())),
                PythonStatus.failed => Text(s['pyFailed'], style: TextStyle(color: context.colors.error)),
                _ => Text(s['pyMissing'], key: const Key('code-box-python')),
              },
              if ((st.status == PythonStatus.missing || st.status == PythonStatus.failed) && py.canDownload)
                TextButton(onPressed: () => unawaited(py.download()), child: Text(s['pyGet'])),
            ],
          ),
        ),
        const SizedBox(height: Kx.s8),
        SelectableText(s['setup'], style: hint),
      ],
    );
  }
}

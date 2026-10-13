import 'dart:async';

import 'package:flutter/material.dart';
import 'package:kinetix_3d/kinetix_3d.dart' show RemoteModels;
import 'package:kinetix_ui/kinetix_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../core/board_controller.dart';
import '../../l10n/feature_strings.dart';

/// Where the board downloads 3D models from, tried in order before GitHub: this board's own
/// setting (Board settings → 3D model downloads), the institution's school server (the API's
/// board config, `modelsBase`) and the board's own KINETIX server (`<API>/assets/models`,
/// served by services/api). A school server only needs the files of
/// packages/kinetix_3d/remote_models under the same names.
abstract final class ModelServer {
  static const _key = 'kinetix.models.base', _instKey = 'kinetix.models.institution';

  /// This board's own model server, or null.
  static String? own;

  /// The institution's model server from the board config, or null.
  static String? institution;

  /// The board's KINETIX server, or null (demo and not set up).
  static String? apiBase;

  /// Bumped whenever the servers change, for the settings section.
  static final changes = ValueNotifier<int>(0);

  static BoardController? _board;

  /// The servers tried before GitHub, in order.
  static List<String> get servers => [
    ?own,
    ?institution,
    if (apiBase case final a?) '$a/assets/models',
  ];

  /// The API's model folder for [apiBase] (what the board uses with nothing set).
  static String? get apiModels => apiBase == null ? null : '$apiBase/assets/models';

  /// Reads the saved servers and follows [board]'s server and its config.
  static Future<void> attach(BoardController board) async {
    if (_board == null) BoardController.configListeners.add(applyConfig);
    _board?.removeListener(_follow);
    _board = board..addListener(_follow);
    apiBase = RemoteModels.cleanServer(board.serverUrl);
    try {
      final p = await SharedPreferences.getInstance();
      own = RemoteModels.cleanServer(p.getString(_key));
      institution = RemoteModels.cleanServer(p.getString(_instKey));
    } catch (_) {
      // No saved settings (a test without the plugin): the defaults stand.
    }
    _apply();
  }

  static void _follow() {
    final a = RemoteModels.cleanServer(_board?.serverUrl);
    if (a == apiBase) return;
    apiBase = a;
    _apply();
  }

  /// The institution's server from the board config (null or absent clears it); kept for offline.
  static void applyConfig(Map<String, dynamic> config) {
    final v = config['modelsBase'];
    institution = v is String ? RemoteModels.cleanServer(v) : null;
    _apply();
    unawaited(_save(_instKey, institution));
  }

  /// Sets this board's own server; empty or invalid text clears it. Returns whether [url] was used.
  static Future<bool> setOwn(String? url) async {
    final clean = RemoteModels.cleanServer(url);
    if ((url ?? '').trim().isNotEmpty && clean == null) return false;
    own = clean;
    _apply();
    await _save(_key, own);
    return true;
  }

  static Future<void> _save(String key, String? value) async {
    try {
      final p = await SharedPreferences.getInstance();
      value == null ? await p.remove(key) : await p.setString(key, value);
    } catch (_) {}
  }

  static void _apply() {
    RemoteModels.servers = servers;
    changes.value++;
  }

  /// Tests start clean.
  @visibleForTesting
  static void reset() {
    _board?.removeListener(_follow);
    _board = null;
    own = institution = apiBase = null;
    RemoteModels.servers = const [];
    BoardController.configListeners.remove(applyConfig);
  }
}

FeatureStrings modelServerStrings(String lang) => FeatureStrings(lang, modelServerStringTable);

const modelServerStringTable = <String, Map<String, String>>{
  'en': {
    'title': '3D model downloads',
    'hint': 'Models not in the app are downloaded once and kept for offline use. The board tries these servers in order, then the KINETIX copy on GitHub.',
    'field': "This board's model server",
    'fieldHint': 'For example http://10.0.0.5/models',
    'save': 'Save',
    'clear': 'Use the default',
    'invalid': 'Enter an address that starts with http:// or https://',
    'own': 'This board',
    'institution': 'Your institution',
    'api': 'KINETIX server',
    'github': 'GitHub (always last)',
    'saved': 'Saved. New downloads use this server first.',
  },
  'hi': {
    'title': '3D मॉडल डाउनलोड',
    'hint': 'जो मॉडल ऐप में नहीं हैं, वे एक बार डाउनलोड होकर ऑफ़लाइन उपयोग के लिए रखे जाते हैं। बोर्ड इन सर्वरों को क्रम से आज़माता है, फिर गिटहब पर रखी कायनेटिक्स प्रति को।',
    'field': 'इस बोर्ड का मॉडल सर्वर',
    'fieldHint': 'उदाहरण: http://10.0.0.5/models',
    'save': 'सहेजें',
    'clear': 'डिफ़ॉल्ट उपयोग करें',
    'invalid': 'http:// या https:// से शुरू होने वाला पता लिखें',
    'own': 'यह बोर्ड',
    'institution': 'आपका संस्थान',
    'api': 'कायनेटिक्स सर्वर',
    'github': 'गिटहब (हमेशा अंत में)',
    'saved': 'सहेजा गया। नए डाउनलोड पहले इसी सर्वर से होंगे।',
  },
  'kn': {
    'title': '3D ಮಾದರಿ ಡೌನ್‌ಲೋಡ್‌ಗಳು',
    'hint': 'ಆ್ಯಪ್‌ನಲ್ಲಿ ಇಲ್ಲದ ಮಾದರಿಗಳು ಒಮ್ಮೆ ಡೌನ್‌ಲೋಡ್ ಆಗಿ ಆಫ್‌ಲೈನ್ ಬಳಕೆಗಾಗಿ ಉಳಿಯುತ್ತವೆ. ಬೋರ್ಡ್ ಈ ಸರ್ವರ್‌ಗಳನ್ನು ಕ್ರಮವಾಗಿ ಪ್ರಯತ್ನಿಸುತ್ತದೆ, ನಂತರ ಗಿಟ್‌ಹಬ್‌ನಲ್ಲಿರುವ ಕೈನೆಟಿಕ್ಸ್ ಪ್ರತಿಯನ್ನು.',
    'field': 'ಈ ಬೋರ್ಡ್‌ನ ಮಾದರಿ ಸರ್ವರ್',
    'fieldHint': 'ಉದಾಹರಣೆ: http://10.0.0.5/models',
    'save': 'ಉಳಿಸಿ',
    'clear': 'ಡೀಫಾಲ್ಟ್ ಬಳಸಿ',
    'invalid': 'http:// ಅಥವಾ https:// ನಿಂದ ಆರಂಭವಾಗುವ ವಿಳಾಸ ಬರೆಯಿರಿ',
    'own': 'ಈ ಬೋರ್ಡ್',
    'institution': 'ನಿಮ್ಮ ಸಂಸ್ಥೆ',
    'api': 'ಕೈನೆಟಿಕ್ಸ್ ಸರ್ವರ್',
    'github': 'ಗಿಟ್‌ಹಬ್ (ಯಾವಾಗಲೂ ಕೊನೆಯಲ್ಲಿ)',
    'saved': 'ಉಳಿಸಲಾಗಿದೆ. ಹೊಸ ಡೌನ್‌ಲೋಡ್‌ಗಳು ಮೊದಲು ಈ ಸರ್ವರ್‌ನಿಂದ ಆಗುತ್ತವೆ.',
  },
};

/// Board settings → 3D model downloads: this board's own server and the order the board tries.
class ModelServerSection extends StatefulWidget {
  const ModelServerSection({super.key});

  @override
  State<ModelServerSection> createState() => _ModelServerSectionState();
}

class _ModelServerSectionState extends State<ModelServerSection> {
  late final _field = TextEditingController(text: ModelServer.own ?? '');
  String? _error, _note;

  @override
  void dispose() {
    _field.dispose();
    super.dispose();
  }

  Future<void> _save(FeatureStrings s, String text) async {
    final ok = await ModelServer.setOwn(text);
    if (!mounted) return;
    setState(() {
      _error = ok ? null : s['invalid'];
      _note = ok ? s['saved'] : null;
      if (ok) _field.text = ModelServer.own ?? '';
    });
  }

  @override
  Widget build(BuildContext context) {
    final s = modelServerStrings(boardLang(context));
    final hint = context.text.bodyMedium?.copyWith(color: context.colors.onSurfaceVariant);
    return ValueListenableBuilder<int>(
      valueListenable: ModelServer.changes,
      builder: (context, _, _) {
        final order = <(String, String)>[
          if (ModelServer.own case final o?) (s['own'], o),
          if (ModelServer.institution case final i?) (s['institution'], i),
          if (ModelServer.apiModels case final a?) (s['api'], a),
          (s['github'], 'https://github.com/amjad03/Kinetix'),
        ];
        return Column(
          key: const Key('model-server'),
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(s['title'], style: context.text.titleSmall),
            const SizedBox(height: Kx.s4),
            Text(s['hint'], style: hint),
            const SizedBox(height: Kx.s12),
            TextField(
              key: const Key('model-server-field'),
              controller: _field,
              keyboardType: TextInputType.url,
              decoration: InputDecoration(labelText: s['field'], hintText: s['fieldHint'], errorText: _error, isDense: true, border: const OutlineInputBorder()),
              onSubmitted: (v) => unawaited(_save(s, v)),
            ),
            const SizedBox(height: Kx.s8),
            Wrap(
              spacing: Kx.s8,
              children: [
                FilledButton.tonal(key: const Key('model-server-save'), onPressed: () => unawaited(_save(s, _field.text)), child: Text(s['save'])),
                if (ModelServer.own != null)
                  TextButton(key: const Key('model-server-clear'), onPressed: () => unawaited(_save(s, '')), child: Text(s['clear'])),
              ],
            ),
            if (_note != null) Padding(padding: const EdgeInsets.only(top: Kx.s4), child: Text(_note!, key: const Key('model-server-note'), style: hint)),
            const SizedBox(height: Kx.s8),
            for (final (i, (who, url)) in order.indexed)
              Padding(
                padding: const EdgeInsets.only(top: 2),
                child: Text('${i + 1}. $who: $url', key: Key('model-server-$i'), style: hint),
              ),
          ],
        );
      },
    );
  }
}

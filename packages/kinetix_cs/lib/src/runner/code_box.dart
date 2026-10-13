import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

import 'protocol.dart';
import 'sample_databases.dart';

/// The school code box: a spare PC on the school network running services/code-runner (with
/// its gateway, infra/school-code-box/) that compiles and runs C, C++ and Java, and Python,
/// JavaScript and SQL too, with no internet (docs/operations/school-code-box.md).
///
/// The board finds it, in order: this board's setting ([own]), the institution's setting from
/// the board config ([institution], `codeBoxUrl`), the network (mDNS `_kinetix-code._tcp`,
/// [discover]) and the school server's own address on the box's port ([apiBase]). Each
/// candidate's GET /health says whether it is up and which languages it runs.
class CodeBox {
  CodeBox({this.own, this.key, this.institution, this.apiBase, this.discover, http.Client Function()? newClient, this.healthTimeout = const Duration(seconds: 2), this.remember = const Duration(minutes: 1)})
    : newClient = newClient ?? http.Client.new;

  /// The box this app uses (the Board sets it up from its settings and config).
  static CodeBox shared = CodeBox();

  /// The gateway's port (infra/school-code-box/docker-compose.yml).
  static const port = 8181;

  /// The mDNS service the box announces.
  static const service = '_kinetix-code._tcp';

  String? own;

  /// The box's key (CODE_BOX_KEY), sent as x-code-box-key; null when the box has none.
  String? key;
  String? institution;

  /// The board's KINETIX server; a school server on the local network may host the box too.
  String? apiBase;

  /// Looks for boxes on the network (mDNS); null: not looked for.
  Future<List<Uri>> Function()? discover;
  final http.Client Function() newClient;
  final Duration healthTimeout;

  /// How long a found box (or finding none) is trusted before looking again.
  final Duration remember;

  /// The box in use, for the code lab and the settings (null: none found).
  final current = ValueNotifier<CodeBoxInfo?>(null);
  DateTime? _checked;
  Future<CodeBoxInfo?>? _finding;

  /// A clean http(s) base without trailing slashes, or null.
  static String? clean(String? url) {
    var t = (url ?? '').trim().replaceAll(RegExp(r'/+$'), '');
    if (t.isEmpty) return null;
    if (!t.contains('://')) t = 'http://$t';
    final u = Uri.tryParse(t);
    if (u == null || !(u.isScheme('http') || u.isScheme('https')) || u.host.isEmpty) return null;
    return u.hasPort || u.isScheme('https') ? t : '${u.scheme}://${u.host}:$port${u.path}';
  }

  /// The school server's address on the box's port, when it is on the local network.
  static String? onSchoolServer(String? api) {
    final u = Uri.tryParse(api ?? '');
    if (u == null || u.host.isEmpty || !isLocalHost(u.host)) return null;
    return 'http://${u.host}:$port';
  }

  /// A private (RFC 1918), link-local or .local address: a school network, not the internet.
  static bool isLocalHost(String host) {
    if (host.endsWith('.local') || host.endsWith('.lan') || host == 'localhost') return true;
    final p = host.split('.').map(int.tryParse).toList();
    if (p.length != 4 || p.any((x) => x == null)) return false;
    final (a, b) = (p[0]!, p[1]!);
    return a == 10 || a == 127 || (a == 172 && b >= 16 && b <= 31) || (a == 192 && b == 168) || (a == 169 && b == 254);
  }

  /// The places to try, in order, without repeats.
  Future<List<String>> candidates() async {
    final out = <String>[];
    void add(String? u) {
      final c = clean(u);
      if (c != null && !out.contains(c)) out.add(c);
    }

    add(own);
    add(institution);
    if (discover != null) {
      try {
        for (final u in await discover!()) {
          add(u.toString());
        }
      } catch (e) {
        debugPrint('Code box discovery: $e');
      }
    }
    add(onSchoolServer(apiBase));
    return out;
  }

  /// The first box that answers, remembered for [remember]; [refresh] looks again now.
  Future<CodeBoxInfo?> find({bool refresh = false}) {
    if (!refresh && _checked != null && DateTime.now().difference(_checked!) < remember) return Future.value(current.value);
    return _finding ??= () async {
      try {
        CodeBoxInfo? found;
        for (final c in await candidates()) {
          found = await health(c);
          if (found != null) break;
        }
        current.value = found;
        _checked = DateTime.now();
        return found;
      } finally {
        _finding = null;
      }
    }();
  }

  /// Forgets the box found, e.g. after the settings change or a run that could not reach it.
  void forget() {
    _checked = null;
    current.value = null;
  }

  /// GET [base]/health: the box and its languages, or null when it does not answer as a box.
  Future<CodeBoxInfo?> health(String base) async {
    final client = newClient();
    try {
      final res = await client.get(Uri.parse('$base/health'), headers: _headers).timeout(healthTimeout);
      if (res.statusCode != 200) return null;
      final j = jsonDecode(utf8.decode(res.bodyBytes));
      if (j is! Map || j['ok'] != true || j['languages'] is! List) return null;
      final langs = {for (final l in j['languages'] as List) ?CodeLanguage.byId('$l')};
      if (langs.isEmpty) return null;
      return CodeBoxInfo(base: base, languages: langs, name: j['name'] is String ? j['name'] as String : null);
    } catch (_) {
      return null;
    } finally {
      client.close();
    }
  }

  Map<String, String> get _headers => {if ((key ?? '').isNotEmpty) 'x-code-box-key': key!};

  /// Runs [r] on [box]. SQL starts from the chosen sample database (sent ahead of the program).
  Future<RunResult> run(CodeBoxInfo box, RunRequest r, {http.Client? client}) async {
    final c = client ?? newClient();
    final db = r.language == CodeLanguage.sql ? sampleDatabases[r.database] : null;
    final body = {...r.toJson(), if (db != null) 'source': '$db\n${r.source}'};
    try {
      final res = await c
          .post(Uri.parse('${box.base}/run'), headers: {..._headers, 'content-type': 'application/json'}, body: jsonEncode(body))
          .timeout(const Duration(seconds: 45));
      if (res.statusCode == 401 || res.statusCode == 403) return const RunResult(status: RunStatus.unavailable, message: 'boxKey');
      if (res.statusCode == 429) return const RunResult(status: RunStatus.rateLimited);
      if (res.statusCode != 200) return RunResult(status: RunStatus.unavailable, message: 'box ${res.statusCode}');
      final result = RunResult.fromJson(jsonDecode(utf8.decode(res.bodyBytes)) as Map<String, dynamic>);
      if (db == null) return result;
      // SQLite counts the sample database's lines too.
      final skip = '$db\n'.split('\n').length - 1;
      final stderr = result.stderr.replaceAllMapped(RegExp(r'line (\d+)'), (m) => 'line ${(int.parse(m[1]!) - skip).clamp(1, 1 << 30)}');
      return RunResult(status: result.status, stdout: result.stdout, stderr: stderr, compileOutput: result.compileOutput, exitCode: result.exitCode, timeMs: result.timeMs);
    } catch (e) {
      forget();
      return RunResult(status: RunStatus.unavailable, message: 'boxOffline: $e');
    } finally {
      if (client == null) c.close();
    }
  }
}

class CodeBoxInfo {
  const CodeBoxInfo({required this.base, required this.languages, this.name});

  final String base;
  final Set<CodeLanguage> languages;
  final String? name;

  /// The host, for the "ran on" label.
  String get host => Uri.parse(base).host;
}

/// Runs on the school code box ([CodeBox.shared] unless given another).
class CodeBoxRunner implements CodeRunner {
  CodeBoxRunner([CodeBox? box]) : box = box ?? CodeBox.shared;

  final CodeBox box;
  http.Client? _client;
  bool _stopped = false;

  /// The languages the box runs now (null: no box).
  Future<Set<CodeLanguage>?> languages() async => (await box.find())?.languages;

  @override
  Future<RunResult> run(RunRequest r) async {
    stop();
    _stopped = false;
    final found = await box.find();
    if (found == null || !found.languages.contains(r.language)) return const RunResult(status: RunStatus.unavailable, message: 'needsBox');
    final client = _client = box.newClient();
    try {
      final res = await box.run(found, r, client: client);
      return _stopped ? const RunResult(status: RunStatus.stopped) : res;
    } finally {
      client.close();
      if (_client == client) _client = null;
    }
  }

  @override
  void stop() {
    _stopped = _client != null;
    _client?.close();
  }

  @override
  void dispose() => stop();
}

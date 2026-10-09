import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

/// One signed, time-boxed code the institution issued for this board (`POST /v1/pairing/offline-codes`).
/// The Teacher App checks the signature with the institution's public key and needs no network to do it.
class OfflineCode {
  const OfflineCode({required this.token, required this.validFrom, required this.validUntil});

  factory OfflineCode.fromJson(Map<String, dynamic> j) => OfflineCode(
    token: j['token'] as String,
    validFrom: DateTime.parse(j['validFrom'] as String),
    validUntil: DateTime.parse(j['validUntil'] as String),
  );

  final String token;
  final DateTime validFrom;
  final DateTime validUntil;

  Map<String, dynamic> toJson() => {'token': token, 'validFrom': validFrom.toUtc().toIso8601String(), 'validUntil': validUntil.toUtc().toIso8601String()};

  bool coversNow(DateTime now) => !now.isBefore(validFrom) && now.isBefore(validUntil);
}

/// The codes kept on the board so it can still show one when the cloud cannot be reached.
class OfflineCodes {
  static const _key = 'offline.codes';

  /// Fetch a fresh batch when less than this much of the cached coverage is left.
  static const refreshBelow = Duration(hours: 4);

  static List<OfflineCode> parse(Map<String, dynamic> body) => [for (final c in (body['codes'] as List? ?? const [])) OfflineCode.fromJson(c as Map<String, dynamic>)];

  /// The code whose window is open now, or null when the cache has run out.
  static OfflineCode? current(List<OfflineCode> codes, DateTime now) {
    for (final c in codes) {
      if (c.coversNow(now)) return c;
    }
    return null;
  }

  /// True when the cache is empty or its last window ends within [refreshBelow].
  static bool needsRefresh(List<OfflineCode> codes, DateTime now) {
    if (codes.isEmpty) return true;
    final last = codes.map((c) => c.validUntil).reduce((a, b) => a.isAfter(b) ? a : b);
    return last.difference(now) < refreshBelow;
  }

  static Future<List<OfflineCode>> load() async {
    final raw = (await SharedPreferences.getInstance()).getString(_key);
    if (raw == null) return const [];
    try {
      return [for (final c in jsonDecode(raw) as List) OfflineCode.fromJson(c as Map<String, dynamic>)];
    } catch (_) {
      return const [];
    }
  }

  static Future<void> save(List<OfflineCode> codes, DateTime now) async {
    final live = [
      for (final c in codes)
        if (c.validUntil.isAfter(now)) c.toJson(),
    ];
    await (await SharedPreferences.getInstance()).setString(_key, jsonEncode(live));
  }
}

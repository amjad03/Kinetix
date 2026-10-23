import 'package:flutter/foundation.dart';

/// An app update the Zynetix dashboard rolled out to this board (docs/zynetix/BOARD_PLAN.md, W4).
@immutable
class UpdateOffer {
  const UpdateOffer({required this.releaseId, required this.version, required this.url, this.channel = 'stable', this.notes, this.fileName, this.bytes, this.sha256});

  final String releaseId;
  final String version;
  final String channel;
  final String? notes;
  final String? fileName;
  final int? bytes;

  /// Hex SHA-256 of the file; the download is checked against it before installing.
  final String? sha256;

  /// Where the board fetches the file, with its device token (a path on the API server).
  final String url;

  static UpdateOffer? fromJson(Object? j) {
    if (j is! Map) return null;
    final id = j['releaseId'], v = j['version'], url = j['url'];
    if (id is! String || v is! String || url is! String) return null;
    return UpdateOffer(
      releaseId: id,
      version: v,
      url: url,
      channel: j['channel'] as String? ?? 'stable',
      notes: j['notes'] as String?,
      fileName: j['fileName'] as String?,
      bytes: (j['bytes'] as num?)?.toInt(),
      sha256: j['sha256'] as String?,
    );
  }

  @override
  bool operator ==(Object other) => other is UpdateOffer && other.releaseId == releaseId;

  @override
  int get hashCode => releaseId.hashCode;
}

/// An app the panel home shows (an Android package the admin allow-listed).
@immutable
class LauncherApp {
  const LauncherApp({required this.package, required this.label, this.iconUrl});

  final String package;
  final String label;
  final String? iconUrl;

  static List<LauncherApp> listFrom(Object? j) {
    final apps = j is Map ? j['apps'] : j;
    if (apps is! List) return const [];
    return [
      for (final a in apps)
        if (a is Map && a['package'] is String && a['label'] is String) LauncherApp(package: a['package'] as String, label: a['label'] as String, iconUrl: a['iconUrl'] as String?),
    ];
  }

  Map<String, Object?> toJson() => {'package': package, 'label': label, 'iconUrl': iconUrl};

  @override
  bool operator ==(Object other) => other is LauncherApp && other.package == package && other.label == label && other.iconUrl == iconUrl;

  @override
  int get hashCode => Object.hash(package, label, iconUrl);
}

/// An app installed on the panel (Android), with its icon as PNG bytes when the system gave one.
@immutable
class InstalledApp {
  const InstalledApp({required this.package, required this.label, this.icon});

  final String package;
  final String label;
  final Uint8List? icon;
}

/// Orders app versions such as `1.4.0` or `1.4.0+12` (as the API does): < 0 when [a] is older.
int compareVersions(String a, String b) {
  List<int> parts(String v) {
    final s = v.trim().replaceFirst(RegExp('^[vV]'), '').split('+');
    final nums = s.first.split(RegExp(r'[.-]')).map((p) => int.tryParse(p) ?? 0).toList();
    while (nums.length < 3) {
      nums.add(0);
    }
    return [...nums.take(3), s.length > 1 ? int.tryParse(s[1]) ?? 0 : 0];
  }

  final x = parts(a), y = parts(b);
  for (var i = 0; i < 4; i++) {
    if (x[i] != y[i]) return x[i] - y[i];
  }
  return 0;
}

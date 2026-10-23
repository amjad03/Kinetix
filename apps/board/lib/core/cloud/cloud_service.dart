import 'dart:typed_data';

import '../api_client.dart';

/// Google Drive or OneDrive.
enum CloudProvider {
  google('google'),
  microsoft('microsoft');

  const CloudProvider(this.id);
  final String id;
}

/// What the board can bring in from a drive.
enum CloudFileKind { folder, pdf, pptx, image, video }

class CloudFile {
  const CloudFile({required this.id, required this.name, required this.kind, this.size});

  factory CloudFile.fromJson(Map<String, dynamic> j) => CloudFile(
    id: j['id'] as String,
    name: j['name'] as String? ?? '',
    kind: CloudFileKind.values.firstWhere((k) => k.name == j['kind'], orElse: () => CloudFileKind.pdf),
    size: (j['size'] as num?)?.toInt(),
  );

  final String id;
  final String name;
  final CloudFileKind kind;
  final int? size;
}

/// One service's state for this teacher: set up by the institution, and connected by them.
class CloudAccount {
  const CloudAccount({this.configured = false, this.connected = false, this.account});

  factory CloudAccount.fromJson(Object? j) {
    final m = j is Map ? j.cast<String, dynamic>() : const <String, dynamic>{};
    return CloudAccount(configured: m['configured'] == true, connected: m['connected'] == true, account: m['account'] as String?);
  }

  final bool configured;
  final bool connected;
  final String? account;
}

class CloudStatus {
  const CloudStatus({this.google = const CloudAccount(), this.microsoft = const CloudAccount(), this.moodle = false});

  factory CloudStatus.fromJson(Map<String, dynamic> j) =>
      CloudStatus(google: CloudAccount.fromJson(j['google']), microsoft: CloudAccount.fromJson(j['microsoft']), moodle: (j['moodle'] as Map?)?['configured'] == true);

  final CloudAccount google;
  final CloudAccount microsoft;

  /// Moodle is set up (an institution-wide web service token; nothing to connect per teacher).
  final bool moodle;

  CloudAccount of(CloudProvider p) => p == CloudProvider.google ? google : microsoft;
}

/// A course to share notes to (Google Classroom or Moodle).
class ShareCourse {
  const ShareCourse(this.id, this.name, [this.detail]);
  final String id;
  final String name;
  final String? detail;
}

/// Where notes were posted.
class SharedTo {
  const SharedTo(this.id, this.link);
  final String id;
  final String? link;
}

/// The error code the API sends when the institution has not set a service up (Zynetix dashboard → Integrations).
const cloudNotConfigured = 'CLOUD_NOT_CONFIGURED';
const cloudNotConnected = 'CLOUD_NOT_CONNECTED';
const moodleNotConfigured = 'MOODLE_NOT_CONFIGURED';

/// The board's cloud drives and sharing, through the Zynetix server (the board never holds cloud tokens).
/// Tests use a fake.
abstract class CloudService {
  Future<CloudStatus> status();

  /// The sign-in page to show as a QR; the teacher finishes on their phone.
  Future<Uri> connectUrl(CloudProvider p);
  Future<void> disconnect(CloudProvider p);
  Future<List<CloudFile>> list(CloudProvider p, {String? folder, String? query});
  Future<({String name, String mimeType, Uint8List bytes})> download(CloudProvider p, String id);
  Future<String?> save(CloudProvider p, String name, String mimeType, Uint8List bytes);
  Future<List<ShareCourse>> classroomCourses();
  Future<SharedTo> postToClassroom(String courseId, String title, String name, String mimeType, Uint8List bytes);
  Future<List<ShareCourse>> moodleCourses();
  Future<SharedTo> postToMoodle(String courseId, String title, String name, String mimeType, Uint8List bytes);
}

class ApiCloudService implements CloudService {
  ApiCloudService(this.api);
  final ApiClient api;

  static String _q(Map<String, String?> q) {
    final s = q.entries.where((e) => e.value != null && e.value!.isNotEmpty).map((e) => '${e.key}=${Uri.encodeQueryComponent(e.value!)}').join('&');
    return s.isEmpty ? '' : '?$s';
  }

  @override
  Future<CloudStatus> status() async => CloudStatus.fromJson(await api.getJson('/v1/cloud') as Map<String, dynamic>);

  @override
  Future<Uri> connectUrl(CloudProvider p) async => Uri.parse((await api.sendJson('POST', '/v1/cloud/${p.id}/connect') as Map)['url'] as String);

  @override
  Future<void> disconnect(CloudProvider p) async => api.sendJson('DELETE', '/v1/cloud/${p.id}');

  @override
  Future<List<CloudFile>> list(CloudProvider p, {String? folder, String? query}) async {
    final j = await api.getJson('/v1/cloud/${p.id}/files${_q({'folder': folder, 'q': query})}') as Map<String, dynamic>;
    return [for (final f in j['files'] as List<dynamic>) CloudFile.fromJson((f as Map).cast<String, dynamic>())];
  }

  @override
  Future<({String name, String mimeType, Uint8List bytes})> download(CloudProvider p, String id) => api.getBytes('/v1/cloud/${p.id}/files/${Uri.encodeComponent(id)}');

  @override
  Future<String?> save(CloudProvider p, String name, String mimeType, Uint8List bytes) async =>
      (await api.postBytes('/v1/cloud/${p.id}/files${_q({'name': name})}', mimeType, bytes) as Map)['webUrl'] as String?;

  List<ShareCourse> _courses(Object? j, String detailKey) => [
    for (final c in ((j as Map)['courses'] as List<dynamic>).cast<Map<dynamic, dynamic>>()) ShareCourse(c['id'] as String, c['name'] as String? ?? '', c[detailKey] as String?),
  ];

  @override
  Future<List<ShareCourse>> classroomCourses() async => _courses(await api.getJson('/v1/share/classroom/courses'), 'section');

  @override
  Future<SharedTo> postToClassroom(String courseId, String title, String name, String mimeType, Uint8List bytes) async {
    final j = await api.postBytes('/v1/share/classroom/courses/${Uri.encodeComponent(courseId)}${_q({'title': title, 'name': name})}', mimeType, bytes) as Map;
    return SharedTo(j['id'] as String, j['link'] as String?);
  }

  @override
  Future<List<ShareCourse>> moodleCourses() async => _courses(await api.getJson('/v1/share/moodle/courses'), 'shortName');

  @override
  Future<SharedTo> postToMoodle(String courseId, String title, String name, String mimeType, Uint8List bytes) async {
    final j = await api.postBytes('/v1/share/moodle/courses/${Uri.encodeComponent(courseId)}${_q({'title': title, 'name': name})}', mimeType, bytes) as Map;
    return SharedTo(j['id'] as String, j['link'] as String?);
  }
}

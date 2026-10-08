/// A STUN or TURN server the API hands out for a cast (packages/shared `IceServer`).
class IceServer {
  const IceServer({required this.urls, this.username, this.credential});

  factory IceServer.fromJson(Map<String, dynamic> j) => IceServer(
    urls: [for (final u in (j['urls'] as List<dynamic>? ?? const [])) u as String],
    username: j['username'] as String?,
    credential: j['credential'] as String?,
  );

  final List<String> urls;
  final String? username;
  final String? credential;

  /// The shape `createPeerConnection` wants.
  Map<String, dynamic> toMap() => {'urls': urls, if (username != null) 'username': username, if (credential != null) 'credential': credential};

  static List<IceServer> list(Object? v) => [for (final j in (v as List<dynamic>? ?? const [])) IceServer.fromJson(Map<String, dynamic>.from(j as Map))];
}

/// A board with a class open that this person may cast to (GET /v1/cast/boards).
class CastBoard {
  const CastBoard({required this.deviceId, required this.name, this.room, this.teacher = '', this.section, this.subject, this.needsApproval = true});

  factory CastBoard.fromJson(Map<String, dynamic> j) => CastBoard(
    deviceId: j['deviceId'] as String,
    name: j['name'] as String,
    room: j['room'] as String?,
    teacher: j['teacher'] as String? ?? '',
    section: j['section'] as String?,
    subject: j['subject'] as String?,
    needsApproval: j['needsApproval'] as bool? ?? true,
  );

  final String deviceId;
  final String name;
  final String? room;
  final String teacher;
  final String? section;
  final String? subject;

  /// False for the class teacher casting to their own board.
  final bool needsApproval;

  String get classLabel => [subject, section].whereType<String>().join(' · ');
}

/// The answer to `cast.request`.
class CastRequestResult {
  const CastRequestResult({required this.ok, this.error, this.castId, this.approved = false, this.iceServers = const []});

  factory CastRequestResult.fromJson(Object? j) {
    if (j is! Map) return const CastRequestResult(ok: false, error: 'No answer from KINETIX Cloud');
    return CastRequestResult(
      ok: j['ok'] == true,
      error: j['error'] as String?,
      castId: j['castId'] as String?,
      approved: j['approved'] == true,
      iceServers: IceServer.list(j['iceServers']),
    );
  }

  final bool ok;
  final String? error;
  final String? castId;
  final bool approved;
  final List<IceServer> iceServers;
}

/// Why a cast ended (packages/shared `CastEndReason`).
enum CastEndReason {
  stopped,
  declined,
  classEnded,
  senderLeft,
  boardLeft;

  static CastEndReason parse(String? s) => switch (s) {
    'declined' => declined,
    'class_ended' => classEnded,
    'sender_left' => senderLeft,
    'board_left' => boardLeft,
    _ => stopped,
  };
}

import 'package:flutter/widgets.dart' show BuildContext;
import 'package:kinetix_ink/kinetix_ink.dart';

/// Where an after-class job (transcript, summary) has got to.
enum Processing {
  none,
  queued,
  done,
  failed;

  static Processing parse(Object? v) => Processing.values.asNameMap()[v] ?? Processing.none;
}

/// The summary written from the transcript: a paragraph and the key points.
class LessonSummary {
  const LessonSummary({required this.summary, required this.keyPoints});

  static LessonSummary? fromJson(Object? j) {
    if (j is! Map) return null;
    final text = (j['summary'] as String?)?.trim() ?? '';
    final points = [
      for (final p in (j['keyPoints'] as List? ?? const []))
        if (p is String && p.trim().isNotEmpty) p.trim(),
    ];
    if (text.isEmpty && points.isEmpty) return null;
    return LessonSummary(summary: text, keyPoints: points);
  }

  final String summary;
  final List<String> keyPoints;
}

/// A lesson recording as `GET /v1/recordings`, `GET /v1/recordings/:id` and the parent
/// summary return it. [transcript] and [summary] are only in the single-recording response.
class RecordingInfo {
  const RecordingInfo({
    required this.id,
    required this.title,
    required this.startedAt,
    required this.duration,
    this.hasAudio = false,
    this.sectionId,
    this.sectionName,
    this.subjectName,
    this.teacherName,
    this.transcriptState = Processing.none,
    this.summaryState = Processing.none,
    this.sharedAt,
    this.finishedAt,
    this.missed = false,
    this.transcript,
    this.summary,
    this.keep = false,
    this.expiresOn,
  });

  factory RecordingInfo.fromJson(Map<String, dynamic> j) => RecordingInfo(
    id: j['id'] as String,
    title: j['title'] as String? ?? 'Lesson',
    startedAt: _instant(j['startedAt']) ?? DateTime.now(),
    duration: Duration(milliseconds: (j['durationMs'] as num?)?.toInt() ?? 0),
    hasAudio: j['hasAudio'] as bool? ?? false,
    sectionId: j['sectionId'] as String?,
    sectionName: j['sectionName'] as String?,
    subjectName: j['subjectName'] as String?,
    teacherName: j['teacherName'] as String?,
    transcriptState: Processing.parse(j['transcriptState']),
    summaryState: Processing.parse(j['summaryState']),
    sharedAt: _instant(j['sharedAt']),
    finishedAt: _instant(j['finishedAt']),
    missed: j['missed'] as bool? ?? false,
    transcript: (j['transcript'] as String?)?.trim().isEmpty ?? true ? null : (j['transcript'] as String).trim(),
    summary: LessonSummary.fromJson(j['summary']),
    keep: j['keep'] as bool? ?? false,
    expiresOn: _date(j['expiresOn']),
  );

  final String id;
  final String title;
  final DateTime startedAt;
  final Duration duration;
  final bool hasAudio;
  final String? sectionId;
  final String? sectionName;
  final String? subjectName;
  final String? teacherName;
  final Processing transcriptState;
  final Processing summaryState;
  final DateTime? sharedAt;

  /// Null while the board is still uploading it.
  final DateTime? finishedAt;

  /// The child was absent for the recorded period (parent summary only).
  final bool missed;
  final String? transcript;
  final LessonSummary? summary;

  /// The teacher keeps it past the end of its term: it is never deleted automatically.
  final bool keep;

  /// The day it will be deleted (end of term plus the grace period), or null when it is kept
  /// or has no term. A calendar date, not an instant.
  final DateTime? expiresOn;

  bool get isShared => sharedAt != null;
  bool get isFinished => finishedAt != null;

  /// [expiresOn] is only replaced when [replaceExpiresOn] is true (it may become null).
  RecordingInfo copyWith({DateTime? sharedAt, bool? missed, bool? keep, DateTime? expiresOn, bool replaceExpiresOn = false}) => RecordingInfo(
    id: id,
    title: title,
    startedAt: startedAt,
    duration: duration,
    hasAudio: hasAudio,
    sectionId: sectionId,
    sectionName: sectionName,
    subjectName: subjectName,
    teacherName: teacherName,
    transcriptState: transcriptState,
    summaryState: summaryState,
    sharedAt: sharedAt ?? this.sharedAt,
    finishedAt: finishedAt,
    missed: missed ?? this.missed,
    transcript: transcript,
    summary: summary,
    keep: keep ?? this.keep,
    expiresOn: replaceExpiresOn ? expiresOn : this.expiresOn,
  );

  /// "2026-12-31" as a local calendar date.
  static DateTime? _date(Object? v) {
    if (v is! String) return null;
    final m = RegExp(r'^(\d{4})-(\d{2})-(\d{2})').firstMatch(v);
    return m == null ? null : DateTime(int.parse(m[1]!), int.parse(m[2]!), int.parse(m[3]!));
  }

  static DateTime? _instant(Object? v) => v is String ? DateTime.tryParse(v)?.toLocal() : null;
}

/// The audio of a recording: an address and the headers it needs (the sign-in token).
class LessonAudioLocation {
  const LessonAudioLocation(this.uri, {this.headers = const {}});

  final Uri uri;
  final Map<String, String> headers;
}

/// A problem loading a recording, in words the viewer can act on.
class LessonLoadException implements Exception {
  const LessonLoadException(this.message, {this.describe});

  /// The problem in English (and the fallback when [describe] is null).
  final String message;

  /// The problem in the viewer's language, for apps that localise their errors.
  final String Function(BuildContext context)? describe;

  @override
  String toString() => message;
}

/// What the player needs from an app: each app wraps its own API client in one of these.
/// Throw [LessonLoadException] with a plain-language message when something fails.
abstract class LessonSource {
  /// `GET /v1/recordings/:id`: details with transcript and summary.
  Future<RecordingInfo> recording(String id);

  /// `GET /v1/recordings/:id/events`, decoded with [Lesson.fromJson].
  Future<Lesson> lesson(String id);

  /// `GET /v1/recordings/:id/audio`, or null when the app cannot stream it.
  LessonAudioLocation? audio(String id);
}

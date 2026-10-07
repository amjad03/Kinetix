/// Concept videos: short explainers from the KINETIX YouTube channel that the platform team links
/// to library topics (services/api: GET /v1/devices/me/concept-videos and
/// /v1/content/topics/:id/videos). The board only ever keeps the YouTube id: videos play in
/// YouTube's own embedded player and are never downloaded.
library;

/// One video, in the class's language first (the server orders them).
class ConceptVideo {
  const ConceptVideo({
    required this.id,
    required this.topicId,
    required this.youtubeVideoId,
    required this.title,
    required this.language,
    this.durationSeconds,
    this.topicTitle,
    this.source = 'platform',
  });

  factory ConceptVideo.fromJson(Map<String, dynamic> j) => ConceptVideo(
    id: j['id'] as String,
    topicId: j['topicId'] as String,
    youtubeVideoId: j['youtubeVideoId'] as String,
    title: j['title'] as String,
    language: j['language'] as String? ?? 'en',
    durationSeconds: (j['durationSeconds'] as num?)?.toInt(),
    topicTitle: j['topicTitle'] as String?,
    source: j['source'] as String? ?? 'platform',
  );

  final String id;
  final String topicId;
  final String youtubeVideoId;
  final String title;

  /// en, hi or kn.
  final String language;
  final int? durationSeconds;
  final String? topicTitle;

  /// Who linked it: platform (KINETIX), institution (the school's admin) or teacher.
  final String source;

  /// YouTube's own thumbnail (i.ytimg.com, 320×180).
  String get thumbnailUrl => 'https://i.ytimg.com/vi/$youtubeVideoId/mqdefault.jpg';

  /// 4:05 or 1:02:03; empty when unknown.
  String get durationLabel => formatVideoDuration(durationSeconds);
}

String formatVideoDuration(int? seconds) {
  if (seconds == null || seconds <= 0) return '';
  final h = seconds ~/ 3600, m = (seconds % 3600) ~/ 60, s = (seconds % 60).toString().padLeft(2, '0');
  return h > 0 ? '$h:${m.toString().padLeft(2, '0')}:$s' : '$m:$s';
}

/// Where the period's topic came from.
enum PeriodTopicSource { lessonPlan, yearPlan, syllabus }

/// The board's current (or next) period today and its topic's videos.
class PeriodVideos {
  const PeriodVideos({this.period, this.source, this.topics = const [], this.videos = const []});

  factory PeriodVideos.fromJson(Map<String, dynamic> j) {
    final p = j['period'] as Map<String, dynamic>?;
    return PeriodVideos(
      period: p == null
          ? null
          : PeriodInfo(
              slotId: p['slotId'] as String,
              date: p['date'] as String,
              startsAt: p['startsAt'] as String,
              endsAt: p['endsAt'] as String,
              isNow: p['isNow'] as bool? ?? false,
              sectionId: (p['section'] as Map?)?['id'] as String? ?? '',
              sectionName: (p['section'] as Map?)?['displayName'] as String? ?? '',
              subjectName: (p['subject'] as Map?)?['name'] as String? ?? '',
            ),
      source: switch (j['source']) {
        'lesson_plan' => PeriodTopicSource.lessonPlan,
        'year_plan' => PeriodTopicSource.yearPlan,
        'syllabus' => PeriodTopicSource.syllabus,
        _ => null,
      },
      topics: [for (final t in (j['topics'] as List? ?? const [])) (id: (t as Map)['id'] as String, title: t['title'] as String)],
      videos: [for (final v in (j['videos'] as List? ?? const [])) ConceptVideo.fromJson(v as Map<String, dynamic>)],
    );
  }

  final PeriodInfo? period;
  final PeriodTopicSource? source;
  final List<({String id, String title})> topics;
  final List<ConceptVideo> videos;

  /// "slot|date": a period the teacher has dismissed the suggestion for.
  String? get key => period == null ? null : '${period!.slotId}|${period!.date}';
}

class PeriodInfo {
  const PeriodInfo({
    required this.slotId,
    required this.date,
    required this.startsAt,
    required this.endsAt,
    required this.isNow,
    this.sectionId = '',
    required this.sectionName,
    required this.subjectName,
  });

  final String slotId;

  /// YYYY-MM-DD in the institution's time zone.
  final String date;

  /// HH:MM:SS, local.
  final String startsAt;
  final String endsAt;
  final bool isNow;
  final String sectionId;
  final String sectionName;
  final String subjectName;

  /// "10:00".
  String get startLabel => startsAt.length >= 5 ? startsAt.substring(0, 5) : startsAt;

  /// [time] (HH:MM:SS) on [date] as local wall-clock time.
  static DateTime at(String date, String time) {
    final d = DateTime.parse(date);
    final p = time.split(':').map(int.parse).toList();
    return DateTime(d.year, d.month, d.day, p[0], p.length > 1 ? p[1] : 0, p.length > 2 ? p[2] : 0);
  }

  DateTime get start => at(date, startsAt);
  DateTime get end => at(date, endsAt);
}

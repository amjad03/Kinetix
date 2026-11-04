import 'dart:typed_data';

/// Announcements from the institution (`GET /v1/announcements/inbox?app=…`) and the light rich text
/// they are written in. Kept the same in the Parent, Student and Teacher apps.

DateTime? _instant(Object? v) => v == null ? null : DateTime.parse(v as String).toLocal();

/// A photo or PDF attached to an announcement or a chat message.
class AttachedFile {
  const AttachedFile({required this.id, required this.name, required this.type, required this.size});

  factory AttachedFile.fromJson(Map<String, dynamic> j, {String? id}) => AttachedFile(
    id: id ?? j['id'] as String? ?? '',
    name: j['name'] as String? ?? '',
    type: j['type'] as String? ?? 'application/octet-stream',
    size: (j['size'] as num?)?.toInt() ?? 0,
  );

  final String id;
  final String name;
  final String type;
  final int size;

  bool get isImage => type.startsWith('image/');
  bool get isPdf => type == 'application/pdf';

  /// "240 KB" / "1.2 MB".
  String get sizeLabel => size >= 1000000 ? '${(size / 1000000).toStringAsFixed(1)} MB' : '${(size / 1024).round().clamp(1, 999999)} KB';
}

/// One announcement in the inbox. Important ones stay pinned until they expire or are acknowledged.
class Announcement {
  Announcement({
    required this.id,
    required this.title,
    required this.body,
    required this.important,
    required this.requiresAck,
    required this.canAcknowledge,
    required this.sentAt,
    required this.senderName,
    required this.attachments,
    required this.pinned,
    this.expiresAt,
    this.readAt,
    this.acknowledgedAt,
    this.emergency = false,
    this.language = 'en',
    this.poll,
  });

  factory Announcement.fromJson(Map<String, dynamic> j) => Announcement(
    id: j['id'] as String,
    title: j['title'] as String? ?? '',
    body: j['body'] as String? ?? '',
    important: j['priority'] == 'important',
    requiresAck: j['requiresAck'] as bool? ?? false,
    canAcknowledge: j['canAcknowledge'] as bool? ?? false,
    sentAt: _instant(j['sentAt']) ?? DateTime.now(),
    expiresAt: _instant(j['expiresAt']),
    senderName: ((j['sender'] as Map?)?['fullName'] as String?) ?? '',
    attachments: [for (final a in (j['attachments'] as List? ?? const [])) AttachedFile.fromJson((a as Map).cast<String, dynamic>())],
    readAt: _instant(j['readAt']),
    acknowledgedAt: _instant(j['acknowledgedAt']),
    pinned: j['pinned'] as bool? ?? false,
    emergency: j['emergency'] as bool? ?? j['priority'] == 'emergency',
    language: j['language'] as String? ?? 'en',
    poll: j['poll'] is Map ? AnnouncementPoll.fromJson((j['poll'] as Map).cast<String, dynamic>()) : null,
  );

  final String id;
  final String title;
  final String body;
  final bool important;
  final bool requiresAck;

  /// Shows the Acknowledge button (it is required, or the message is important).
  final bool canAcknowledge;
  final DateTime sentAt;
  final DateTime? expiresAt;
  final String senderName;
  final List<AttachedFile> attachments;
  final DateTime? readAt;
  final DateTime? acknowledgedAt;
  final bool pinned;

  /// Sent as an emergency: pinned, rings through do-not-disturb, must be acknowledged.
  final bool emergency;

  /// The language the text is in (the reader's own when the sender translated it).
  final String language;
  final AnnouncementPoll? poll;

  bool get unread => readAt == null;
}

/// A one-question poll on a notice. `results` comes once the reader has answered (or the poll closed).
class AnnouncementPoll {
  AnnouncementPoll({required this.question, required this.options, required this.closed, this.closesAt, this.myVote, this.results});

  factory AnnouncementPoll.fromJson(Map<String, dynamic> j) => AnnouncementPoll(
    question: j['question'] as String? ?? '',
    options: [for (final o in (j['options'] as List? ?? const [])) o as String],
    closesAt: _instant(j['closesAt']),
    closed: j['closed'] as bool? ?? false,
    myVote: (j['myVote'] as num?)?.toInt(),
    results: j['results'] is List ? [for (final r in j['results'] as List) PollResult.fromJson((r as Map).cast<String, dynamic>())] : null,
  );

  final String question;
  final List<String> options;
  final DateTime? closesAt;
  final bool closed;
  final int? myVote;
  final List<PollResult>? results;
}

class PollResult {
  const PollResult({required this.option, required this.votes, required this.pct});

  factory PollResult.fromJson(Map<String, dynamic> j) => PollResult(option: j['option'] as String? ?? '', votes: (j['votes'] as num?)?.toInt() ?? 0, pct: (j['pct'] as num?)?.toInt() ?? 0);

  final String option;
  final int votes;
  final int pct;
}

/// The inbox: pinned first, then newest; with the unread count for the badge.
class AnnouncementInbox {
  AnnouncementInbox({required this.unread, required this.items});

  factory AnnouncementInbox.fromJson(Map<String, dynamic> j) => AnnouncementInbox(
    unread: (j['unread'] as num?)?.toInt() ?? 0,
    items: [for (final a in (j['items'] as List? ?? const [])) Announcement.fromJson((a as Map).cast<String, dynamic>())],
  );

  final int unread;
  final List<Announcement> items;
}

/// What the apps need from the API for announcements.
abstract class AnnouncementSource {
  Future<AnnouncementInbox> announcements();
  Future<Announcement> markAnnouncementRead(String id);
  Future<Announcement> acknowledgeAnnouncement(String id);
  Future<Uint8List> announcementFile(String id, String fileId);

  /// Answers the notice's poll (or changes the answer while it is open).
  Future<Announcement> voteAnnouncement(String id, int option);
}

// ---- Light rich text: **bold**, "- " / "1. " lists, [text](https://link) ----

sealed class RichRun {
  const RichRun(this.text);
  final String text;
}

class PlainRun extends RichRun {
  const PlainRun(super.text);
}

class BoldRun extends RichRun {
  const BoldRun(super.text);
}

class LinkRun extends RichRun {
  const LinkRun(super.text, this.url);
  final String url;
}

enum RichBlockKind { paragraph, bullets, numbers }

class RichBlock {
  RichBlock(this.kind, this.lines);
  final RichBlockKind kind;

  /// Paragraph lines, or list items.
  final List<List<RichRun>> lines;
}

final _inline = RegExp(r'\*\*([^*]+)\*\*|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)');
final _bullet = RegExp(r'^\s*[-*]\s+(.*)$');
final _number = RegExp(r'^\s*\d+[.)]\s+(.*)$');

/// Splits a line into plain, bold and link runs. Only http(s) links become links.
List<RichRun> parseRuns(String line) {
  final out = <RichRun>[];
  var last = 0;
  for (final m in _inline.allMatches(line)) {
    if (m.start > last) out.add(PlainRun(line.substring(last, m.start)));
    if (m.group(1) != null) {
      out.add(BoldRun(m.group(1)!));
    } else {
      out.add(LinkRun(m.group(2)!, m.group(3)!));
    }
    last = m.end;
  }
  if (last < line.length) out.add(PlainRun(line.substring(last)));
  return out;
}

/// Paragraphs (blank-line separated) and bulleted or numbered lists.
List<RichBlock> parseRich(String body) {
  final blocks = <RichBlock>[];
  for (final raw in body.replaceAll('\r\n', '\n').split('\n')) {
    final line = raw.trimRight();
    final b = _bullet.firstMatch(line);
    final n = _number.firstMatch(line);
    final last = blocks.isEmpty ? null : blocks.last;
    if (b != null) {
      if (last?.kind == RichBlockKind.bullets) {
        last!.lines.add(parseRuns(b.group(1)!));
      } else {
        blocks.add(RichBlock(RichBlockKind.bullets, [parseRuns(b.group(1)!)]));
      }
    } else if (n != null) {
      if (last?.kind == RichBlockKind.numbers) {
        last!.lines.add(parseRuns(n.group(1)!));
      } else {
        blocks.add(RichBlock(RichBlockKind.numbers, [parseRuns(n.group(1)!)]));
      }
    } else if (line.trim().isEmpty) {
      blocks.add(RichBlock(RichBlockKind.paragraph, []));
    } else if (last?.kind == RichBlockKind.paragraph) {
      last!.lines.add(parseRuns(line));
    } else {
      blocks.add(RichBlock(RichBlockKind.paragraph, [parseRuns(line)]));
    }
  }
  return blocks.where((b) => b.lines.isNotEmpty).toList();
}

/// The text without markup, for previews in lists and notifications.
String plainText(String body) => body
    .replaceAllMapped(RegExp(r'\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)'), (m) => m.group(1)!)
    .replaceAllMapped(RegExp(r'\*\*([^*]+)\*\*'), (m) => m.group(1)!)
    .replaceAll(RegExp(r'^\s*[-*]\s+', multiLine: true), '• ')
    .replaceAll(RegExp(r'\s+'), ' ')
    .trim();

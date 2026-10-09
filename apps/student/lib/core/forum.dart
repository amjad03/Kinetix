/// Course discussions (`/v1/lms/courses/:id/forum`, `/v1/lms/forum/:id`): threads, posts and replying.
library;

String _s(Object? v) => v == null ? '' : '$v';

class ForumThreadRow {
  const ForumThreadRow({required this.id, required this.title, required this.author, required this.replies, required this.pinned, required this.locked, this.lastPostAt});

  factory ForumThreadRow.fromJson(Map<String, dynamic> j) => ForumThreadRow(
    id: _s(j['id']),
    title: _s(j['title']),
    author: _s(j['author']),
    replies: (j['replies'] as num?)?.toInt() ?? 0,
    pinned: j['pinned'] == true,
    locked: j['locked'] == true,
    lastPostAt: j['lastPostAt'] as String?,
  );

  final String id, title, author;
  final int replies;
  final bool pinned, locked;
  final String? lastPostAt;
}

class ForumPost {
  const ForumPost({required this.id, required this.body, required this.author, required this.createdAt});

  factory ForumPost.fromJson(Map<String, dynamic> j) => ForumPost(id: _s(j['id']), body: _s(j['body']), author: _s(j['author']), createdAt: _s(j['createdAt']));

  final String id, body, author, createdAt;
}

class ForumThread {
  const ForumThread({required this.id, required this.title, required this.body, required this.author, required this.locked, required this.posts});

  factory ForumThread.fromJson(Map<String, dynamic> j) => ForumThread(
    id: _s(j['id']),
    title: _s(j['title']),
    body: _s(j['body']),
    author: _s(j['author']),
    locked: j['locked'] == true,
    posts: [for (final p in (j['posts'] as List? ?? const [])) ForumPost.fromJson((p as Map).cast<String, dynamic>())],
  );

  final String id, title, body, author;
  final bool locked;
  final List<ForumPost> posts;
}

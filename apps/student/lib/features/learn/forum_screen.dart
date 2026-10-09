import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/forum.dart';
import '../../l10n/l10n.dart';
import '../../widgets/common.dart';

/// A course's discussion: the threads (pinned first), a button to ask a question, and each thread with its replies.
class ForumScreen extends StatefulWidget {
  const ForumScreen({super.key, required this.api, required this.courseId, required this.title});

  final StudentApi api;
  final String courseId;
  final String title;

  @override
  State<ForumScreen> createState() => _ForumScreenState();
}

class _ForumScreenState extends State<ForumScreen> {
  List<ForumThreadRow>? _threads;
  ApiException? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final r = await widget.api.forumThreads(widget.courseId);
      if (mounted) setState(() => _threads = r);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  Future<void> _ask() async {
    final l = context.l10n;
    final title = TextEditingController();
    final body = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(l.forumAsk),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(key: const Key('forumTitle'), controller: title, decoration: InputDecoration(labelText: l.forumTitleLabel)),
            const SizedBox(height: Kx.s8),
            TextField(key: const Key('forumBody'), controller: body, minLines: 3, maxLines: 6, decoration: InputDecoration(labelText: l.forumBodyLabel)),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(l.cancel)),
          FilledButton(key: const Key('forumPost'), onPressed: () => Navigator.pop(ctx, true), child: Text(l.forumPost)),
        ],
      ),
    );
    if (ok != true || title.text.trim().length < 3 || body.text.trim().isEmpty || !mounted) return;
    try {
      await widget.api.startThread(widget.courseId, title.text.trim(), body.text.trim());
      await _load();
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context)..hideCurrentSnackBar()..showSnackBar(SnackBar(content: Text(context.errorText(e))));
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final items = _threads;
    return Scaffold(
      appBar: AppBar(title: Text(widget.title)),
      floatingActionButton: FloatingActionButton.extended(key: const Key('forumAsk'), onPressed: _ask, icon: const Icon(Icons.add_comment_outlined), label: Text(l.forumAsk)),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s16, Kx.s16, 96),
          children: [
            if (_error != null) ErrorBanner(_error!, onRetry: _load),
            if (items == null && _error == null) const KxLoading(),
            if (items != null && items.isEmpty) KxEmptyState(icon: Icons.forum_outlined, message: l.forumNone),
            if (items != null)
              for (final t in items)
                ListTile(
                  key: Key('thread-${t.id}'),
                  contentPadding: EdgeInsets.zero,
                  leading: Icon(t.pinned ? Icons.push_pin_outlined : t.locked ? Icons.lock_outline : Icons.chat_bubble_outline),
                  title: Text(t.title),
                  subtitle: Text('${t.author} · ${l.forumReplies(t.replies)}'),
                  onTap: () async {
                    await Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => ThreadScreen(api: widget.api, threadId: t.id)));
                    await _load();
                  },
                ),
          ],
        ),
      ),
    );
  }
}

class ThreadScreen extends StatefulWidget {
  const ThreadScreen({super.key, required this.api, required this.threadId});

  final StudentApi api;
  final String threadId;

  @override
  State<ThreadScreen> createState() => _ThreadScreenState();
}

class _ThreadScreenState extends State<ThreadScreen> {
  ForumThread? _thread;
  ApiException? _error;
  final _reply = TextEditingController();
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _reply.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final r = await widget.api.forumThread(widget.threadId);
      if (mounted) setState(() => _thread = r);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  Future<void> _send() async {
    final text = _reply.text.trim();
    if (text.isEmpty) return;
    setState(() => _busy = true);
    try {
      await widget.api.replyToThread(widget.threadId, text);
      _reply.clear();
      await _load();
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context)..hideCurrentSnackBar()..showSnackBar(SnackBar(content: Text(context.errorText(e))));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final t = _thread;
    return Scaffold(
      appBar: AppBar(title: Text(t?.title ?? l.forumTitle)),
      body: Column(
        children: [
          Expanded(
            child: ListView(
              padding: const EdgeInsets.all(Kx.s16),
              children: [
                if (_error != null) ErrorBanner(_error!, onRetry: _load),
                if (t == null && _error == null) const KxLoading(),
                if (t != null) ...[
                  Text(t.author, style: context.text.labelMedium),
                  Text(t.body, key: const Key('threadBody')),
                  const Divider(height: Kx.s24),
                  for (final p in t.posts)
                    ListTile(
                      key: Key('post-${p.id}'),
                      contentPadding: EdgeInsets.zero,
                      title: Text(p.body),
                      subtitle: Text(p.author),
                    ),
                ],
              ],
            ),
          ),
          if (t != null)
            SafeArea(
              child: Padding(
                padding: const EdgeInsets.all(Kx.s12),
                child: t.locked
                    ? Text(l.forumLocked, key: const Key('threadLocked'))
                    : Row(
                        children: [
                          Expanded(child: TextField(key: const Key('replyField'), controller: _reply, decoration: InputDecoration(hintText: l.forumReplyHint))),
                          IconButton(key: const Key('replySend'), onPressed: _busy ? null : _send, icon: const Icon(Icons.send)),
                        ],
                      ),
              ),
            ),
        ],
      ),
    );
  }
}

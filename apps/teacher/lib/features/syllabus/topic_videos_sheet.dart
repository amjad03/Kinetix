import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/l10n.dart';
import '../../core/models.dart';

/// The teacher's own YouTube videos for a syllabus topic: paste a link to add one for this class
/// (the title comes from YouTube), and ask for it to be shared with the whole institution. Until
/// the principal approves, only this class sees it.
class TopicVideosSheet extends StatefulWidget {
  const TopicVideosSheet({super.key, required this.api, required this.topic, required this.section});

  final TeacherApi api;
  final SyllabusTopic topic;
  final Ref section;

  static Future<void> show(BuildContext context, {required TeacherApi api, required SyllabusTopic topic, required Ref section}) => showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (_) => TopicVideosSheet(api: api, topic: topic, section: section),
  );

  @override
  State<TopicVideosSheet> createState() => _TopicVideosSheetState();
}

class _TopicVideosSheetState extends State<TopicVideosSheet> {
  final _link = TextEditingController();
  List<TopicVideo>? _videos;
  bool _failed = false;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _link.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final v = await widget.api.topicVideos(widget.topic.id);
      if (mounted) setState(() => _videos = v);
    } catch (_) {
      if (mounted) setState(() => _failed = true);
    }
  }

  void _say(String text) => ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(text)));

  Future<void> _add() async {
    final l = context.l10n;
    setState(() => _busy = true);
    try {
      final v = await widget.api.addTopicVideo(topicId: widget.topic.id, url: _link.text.trim(), sectionId: widget.section.id);
      if (!mounted) return;
      _link.clear();
      setState(() => _videos = [...?_videos, v]);
      _say(l.topicVideoAdded);
    } catch (_) {
      if (mounted) _say(l.topicVideoNotAdded);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _share(TopicVideo video) async {
    final l = context.l10n;
    setState(() => _busy = true);
    try {
      final updated = await widget.api.shareTopicVideo(video.id);
      if (!mounted) return;
      setState(() => _videos = [for (final v in _videos!) v.id == video.id ? updated : v]);
      _say(l.topicVideoShareSent);
    } catch (e) {
      if (mounted) _say(e is ApiException ? l.errorText(e) : l.topicVideoNotAdded);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _remove(TopicVideo video) async {
    setState(() => _busy = true);
    try {
      await widget.api.removeTopicVideo(video.id);
      if (mounted) setState(() => _videos = [for (final v in _videos!) if (v.id != video.id) v]);
    } catch (_) {
      // Left in the list; try again.
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  String _status(AppLocalizations l, String s) => switch (s) {
    'pending' => l.topicVideoStatusPending,
    'approved' => l.topicVideoStatusApproved,
    'rejected' => l.topicVideoStatusRejected,
    _ => l.topicVideoStatusNone,
  };

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final c = context.colors;
    final videos = _videos;
    return Padding(
      key: const Key('topicVideosSheet'),
      padding: EdgeInsets.only(left: Kx.s16, right: Kx.s16, top: Kx.s16, bottom: MediaQuery.viewInsetsOf(context).bottom + Kx.s16),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(l.topicVideosTitle, style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w500)),
          Text('${widget.section.name} · ${widget.topic.title}', style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant)),
          const SizedBox(height: Kx.s12),
          TextField(
            key: const Key('topicVideoLink'),
            controller: _link,
            keyboardType: TextInputType.url,
            decoration: InputDecoration(labelText: l.topicVideoLink, helperText: l.topicVideoLinkHelp, helperMaxLines: 3),
            onChanged: (_) => setState(() {}),
          ),
          const SizedBox(height: Kx.s8),
          Align(
            alignment: AlignmentDirectional.centerEnd,
            child: FilledButton.icon(
              key: const Key('topicVideoAdd'),
              onPressed: _busy || _link.text.trim().isEmpty ? null : _add,
              icon: const Icon(Icons.add_link),
              label: Text(l.topicVideoAdd),
            ),
          ),
          const SizedBox(height: Kx.s8),
          Flexible(
            child: videos == null
                ? Center(child: _failed ? Text(l.topicVideoNotAdded) : const CircularProgressIndicator())
                : videos.isEmpty
                ? Padding(padding: const EdgeInsets.all(Kx.s16), child: Text(l.topicVideoNone, key: const Key('topicVideoNone'), textAlign: TextAlign.center))
                : ListView(
                    shrinkWrap: true,
                    children: [
                      for (final v in videos)
                        ListTile(
                          key: Key('topicVideo-${v.id}'),
                          contentPadding: EdgeInsets.zero,
                          leading: ClipRRect(
                            borderRadius: BorderRadius.circular(Kx.rSm),
                            child: SizedBox(
                              width: 72,
                              height: 40,
                              child: Image.network(v.thumbnailUrl, fit: BoxFit.cover, errorBuilder: (_, _, _) => ColoredBox(color: c.surfaceContainerHighest)),
                            ),
                          ),
                          title: Text(v.title, maxLines: 2, overflow: TextOverflow.ellipsis),
                          subtitle: Text(
                            [_status(l, v.shareStatus), if (v.shareStatus == 'rejected' && (v.reviewReason ?? '').isNotEmpty) v.reviewReason!].join(' · '),
                            key: Key('topicVideoStatus-${v.id}'),
                          ),
                          trailing: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              if (v.canShare) IconButton(key: Key('topicVideoShare-${v.id}'), tooltip: l.topicVideoShare, onPressed: _busy ? null : () => _share(v), icon: const Icon(Icons.ios_share)),
                              IconButton(key: Key('topicVideoRemove-${v.id}'), tooltip: l.topicVideoRemove, onPressed: _busy ? null : () => _remove(v), icon: const Icon(Icons.delete_outline)),
                            ],
                          ),
                        ),
                    ],
                  ),
          ),
        ],
      ),
    );
  }
}

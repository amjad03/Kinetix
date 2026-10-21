import 'package:flutter/material.dart';
import 'package:kinetix_animations/kinetix_animations.dart';
import 'package:kinetix_ui/kinetix_ui.dart';
import 'package:url_launcher/url_launcher.dart';

import 'cache.dart';
import 'models.dart';
import 'strings.dart';
import 'view.dart';

/// Opens an address outside the app (YouTube, the browser, a PDF viewer). Returns false when it
/// could not.
typedef ResourceLauncher = Future<bool> Function(Uri uri);

Future<bool> _launch(Uri uri) async {
  try {
    return await launchUrl(uri, mode: LaunchMode.externalApplication);
  } catch (_) {
    return false;
  }
}

/// "Topic resources" in the Teacher, Student and Parent apps: one topic's videos, materials and
/// animations, with [topics] (the subject's syllabus) to switch topic. Videos open in YouTube or
/// the browser, materials in the browser or PDF viewer, animations play in the app.
class TopicResourcesScreen extends StatefulWidget {
  const TopicResourcesScreen({super.key, required this.repository, required this.topic, this.topics = const [], this.subjectName, this.launcher});

  final TopicResourcesRepository repository;
  final TopicRef topic;
  final List<TopicRef> topics;
  final String? subjectName;
  final ResourceLauncher? launcher;

  static Future<void> open(BuildContext context, {required TopicResourcesRepository repository, required TopicRef topic, List<TopicRef> topics = const [], String? subjectName}) =>
      Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => TopicResourcesScreen(repository: repository, topic: topic, topics: topics, subjectName: subjectName)));

  @override
  State<TopicResourcesScreen> createState() => _TopicResourcesScreenState();
}

class _TopicResourcesScreenState extends State<TopicResourcesScreen> {
  late TopicRef _topic = widget.topic;
  late Future<LoadedResources> _load = widget.repository.load(_topic.id);

  void _pick(TopicRef t) => setState(() {
    _topic = t;
    _load = widget.repository.load(t.id);
  });

  Future<void> _open(String? link) async {
    final s = ResourceStrings.of(context);
    final messenger = ScaffoldMessenger.of(context);
    final uri = link == null ? null : Uri.tryParse(link);
    final ok = uri != null && await (widget.launcher ?? _launch)(uri);
    if (!ok) messenger.showSnackBar(SnackBar(content: Text(s.cannotOpen)));
  }

  void _animation(ResourceAnimation a) {
    final anim = animationById(a.key);
    if (anim == null) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(ResourceStrings.of(context).cannotOpen)));
      return;
    }
    final lang = AnimLang.values.asNameMap()[Localizations.maybeLocaleOf(context)?.languageCode] ?? AnimLang.en;
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => Scaffold(
          appBar: AppBar(title: Text(anim.title.of(lang))),
          body: AnimationPlayer(key: Key('res-player-${a.key}'), animation: anim, lang: lang),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final s = ResourceStrings.of(context);
    final picker = widget.topics.length < 2
        ? null
        : Padding(
            padding: const EdgeInsets.only(top: Kx.s8),
            child: DropdownButtonFormField<String>(
              key: const Key('res-topic-picker'),
              initialValue: widget.topics.any((t) => t.id == _topic.id) ? _topic.id : null,
              isExpanded: true,
              decoration: InputDecoration(labelText: s.topic),
              items: [for (final t in widget.topics) DropdownMenuItem(value: t.id, child: Text(t.title, overflow: TextOverflow.ellipsis))],
              onChanged: (id) {
                final t = widget.topics.where((t) => t.id == id).firstOrNull;
                if (t != null) _pick(t);
              },
            ),
          );
    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(_topic.title, maxLines: 1, overflow: TextOverflow.ellipsis),
            Text([s.title, ?widget.subjectName].join(' · '), style: Theme.of(context).textTheme.bodySmall),
          ],
        ),
      ),
      body: FutureBuilder<LoadedResources>(
        future: _load,
        builder: (context, snap) {
          if (snap.connectionState != ConnectionState.done) return const Center(child: CircularProgressIndicator());
          if (snap.hasError) {
            return KxEmptyState(
              key: const Key('res-error'),
              icon: Icons.cloud_off_outlined,
              message: s.couldNotLoad,
              action: OutlinedButton.icon(key: const Key('res-retry'), onPressed: () => _pick(_topic), icon: const Icon(Icons.refresh), label: Text(s.tryAgain)),
            );
          }
          final loaded = snap.data!;
          return RefreshIndicator(
            onRefresh: () async => _pick(_topic),
            child: TopicResourcesView(
              resources: loaded.resources,
              offline: loaded.offline,
              header: picker,
              onVideo: (v) => _open(v.watchUrl),
              onMaterial: (m) => _open(m.url),
              onAnimation: _animation,
            ),
          );
        },
      ),
    );
  }
}

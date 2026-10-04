import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/models.dart';
import '../../l10n/l10n.dart';
import '../../widgets/common.dart';
import 'ask_controller.dart';
import 'ask_view.dart';

/// A library topic: summary, notes and what the student should be able to do, with a way to
/// ask KINETIX AI about it.
class TopicScreen extends StatefulWidget {
  const TopicScreen({super.key, required this.api, required this.topicId, required this.controller});

  final StudentApi api;
  final String topicId;

  /// The Learn tab's ask controller: its class and language carry over to questions asked here.
  final AskController controller;

  static Future<void> open(BuildContext context, StudentApi api, String topicId, {required AskController controller}) =>
      Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => TopicScreen(api: api, topicId: topicId, controller: controller),
        ),
      );

  @override
  State<TopicScreen> createState() => _TopicScreenState();
}

class _TopicScreenState extends State<TopicScreen> {
  TopicDetail? _topic;
  ApiException? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final t = await widget.api.topic(widget.topicId);
      if (mounted) setState(() => _topic = t);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final t = _topic;
    return Scaffold(
      appBar: AppBar(title: Text(t?.chapterTitle ?? context.l10n.topic, maxLines: 1, overflow: TextOverflow.ellipsis)),
      body: _error != null
          ? Padding(
              padding: const EdgeInsets.all(Kx.s16),
              child: Align(
                alignment: Alignment.topCenter,
                child: ErrorBanner(_error!.status == 404 ? context.l10n.topicNotInLibrary : _error!, onRetry: _load),
              ),
            )
          : t == null
          ? const Center(child: CircularProgressIndicator())
          : LayoutBuilder(
              builder: (context, box) => ListView(
                padding: EdgeInsets.fromLTRB(sideGutter(box.maxWidth), Kx.s8, sideGutter(box.maxWidth), Kx.s32),
                children: [
                  Text(t.courseTitle, style: context.text.labelLarge?.copyWith(color: c.primary)),
                  const SizedBox(height: Kx.s4),
                  Text(t.title, key: const Key('topicTitle'), style: context.text.headlineSmall),
                  if (t.summary.isNotEmpty) ...[
                    const SizedBox(height: Kx.s8),
                    Text(t.summary, style: context.text.bodyLarge?.copyWith(color: c.onSurfaceVariant)),
                  ],
                  const SizedBox(height: Kx.s16),
                  Align(
                    alignment: Alignment.centerLeft,
                    child: FilledButton.tonalIcon(
                      key: const Key('askAboutTopic'),
                      onPressed: () => AskScreen.open(context, template: widget.controller, topic: t.ref),
                      icon: const Icon(Icons.auto_awesome),
                      label: Text(context.l10n.askAboutThis),
                    ),
                  ),
                  const SizedBox(height: Kx.s16),
                  if (t.notes.isNotEmpty)
                    _Block(
                      key: const Key('topicNotes'),
                      icon: Icons.notes,
                      title: context.l10n.notes,
                      children: [for (final n in t.notes) BulletLine(n)],
                    ),
                  if (t.outcomes.isNotEmpty) ...[
                    const SizedBox(height: Kx.s12),
                    _Block(
                      key: const Key('topicOutcomes'),
                      icon: Icons.flag_outlined,
                      title: context.l10n.outcomes,
                      children: [for (final o in t.outcomes) BulletLine(o, icon: Icons.check_circle_outline)],
                    ),
                  ],
                  if (t.notes.isEmpty && t.outcomes.isEmpty)
                    Text(
                      context.l10n.noNotes,
                      style: context.text.bodyLarge?.copyWith(color: c.onSurfaceVariant),
                    ),
                  if (!t.reviewed) ...[
                    const SizedBox(height: Kx.s16),
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Icon(Icons.info_outline, size: 16, color: c.onSurfaceVariant),
                        const SizedBox(width: Kx.s8),
                        Expanded(
                          child: Text(
                            context.l10n.notReviewed,
                            style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant),
                          ),
                        ),
                      ],
                    ),
                  ],
                ],
              ),
            ),
    );
  }
}

class _Block extends StatelessWidget {
  const _Block({super.key, required this.icon, required this.title, required this.children});

  final IconData icon;
  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(Kx.s16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Icon(icon, size: 20, color: context.colors.primary),
              const SizedBox(width: Kx.s8),
              Expanded(
                child: Text(title, style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w500)),
              ),
            ],
          ),
          const SizedBox(height: Kx.s8),
          ...children,
        ],
      ),
    ),
  );
}

/// "Ask KINETIX AI" about one topic, opened from its page.
class AskScreen extends StatefulWidget {
  const AskScreen({super.key, required this.template, required this.topic});

  final AskController template;
  final TopicRef topic;

  static Future<void> open(BuildContext context, {required AskController template, required TopicRef topic}) => Navigator.of(context).push(
    MaterialPageRoute(
      builder: (_) => AskScreen(template: template, topic: topic),
    ),
  );

  @override
  State<AskScreen> createState() => _AskScreenState();
}

class _AskScreenState extends State<AskScreen> {
  late final controller = AskController(
    api: widget.template.api,
    sectionId: widget.template.sectionId,
    language: widget.template.language,
    onLanguageChanged: (l) => widget.template.setLanguage(l),
    topic: widget.topic,
    onOpenPrivacy: widget.template.onOpenPrivacy,
  );

  @override
  void dispose() {
    controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: Text(context.l10n.askKinetixAi)),
    body: AskView(controller: controller),
  );
}

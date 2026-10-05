import 'package:flutter/material.dart';
import 'package:kinetix_lesson/kinetix_lesson.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/format.dart';
import '../../core/l10n.dart';
import '../../demo/demo.dart';
import '../../widgets/common.dart';

/// The teacher's lesson recordings.
class RecordingsController extends ChangeNotifier {
  RecordingsController(this.api);

  final TeacherApi api;
  List<RecordingInfo>? items;
  bool loading = false;
  ApiException? error;

  /// Recordings being shared right now (their buttons show progress).
  final sharing = <String>{};

  Future<void> load() async {
    loading = true;
    error = null;
    notifyListeners();
    try {
      items = await api.myRecordings();
    } on ApiException catch (e) {
      error = e;
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  /// Shares with the class. Throws [ApiException] when the server refuses.
  Future<void> share(RecordingInfo r) async {
    sharing.add(r.id);
    notifyListeners();
    try {
      final shared = await api.shareRecording(r.id);
      items = [for (final i in items ?? const <RecordingInfo>[]) i.id == r.id ? shared : i];
    } finally {
      sharing.remove(r.id);
      notifyListeners();
    }
  }
}

class RecordingsTab extends StatelessWidget {
  const RecordingsTab({super.key, required this.controller, this.profileButton});

  final RecordingsController controller;

  /// Opens Profile from the app bar.
  final Widget? profileButton;

  Future<void> _share(BuildContext context, RecordingInfo r) async {
    // Only recordings made with a class can be shared, so the class name is there.
    final cls = r.sectionName ?? '';
    final l = context.l10n;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(l.shareTitle),
        content: Text(l.shareBody(cls, r.title)),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(l.cancel)),
          FilledButton(key: const Key('confirmShare'), onPressed: () => Navigator.pop(ctx, true), child: Text(l.share)),
        ],
      ),
    );
    if (ok != true || !context.mounted) return;
    final messenger = ScaffoldMessenger.of(context);
    try {
      await controller.share(r);
      messenger.showSnackBar(SnackBar(content: Text(l.sharedWith(cls))));
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(l.errorText(e))));
    }
  }

  /// The player itself (packages/kinetix_lesson) is not localised yet; its load errors are.
  void _play(BuildContext context, RecordingInfo r) {
    final l = context.l10n;
    LessonPlayerScreen.open(
      context,
      source: TeacherLessonSource(controller.api, notAvailable: Demo.enabled ? l.notInDemo : l.recordingNotAvailable, describe: l.errorText),
      recordingId: r.id,
      initial: r,
    );
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: controller,
      builder: (context, _) {
        final l = context.l10n;
        final items = controller.items;
        return RefreshIndicator(
          onRefresh: controller.load,
          child: CustomScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            slivers: [
              SliverAppBar.large(title: Text(l.navRecordings), actions: [?profileButton]),
              if (controller.error != null)
                SliverPadding(
                  padding: const EdgeInsets.all(Kx.s16),
                  sliver: SliverToBoxAdapter(child: ErrorBanner.api(controller.error!, onRetry: controller.load)),
                ),
              if (items == null && controller.loading)
                const SliverFillRemaining(hasScrollBody: false, child: Center(child: CircularProgressIndicator()))
              else if (items != null && items.isEmpty)
                SliverFillRemaining(
                  hasScrollBody: false,
                  child: KxEmptyState(icon: Icons.mic_none, message: l.noRecordings),
                )
              else if (items != null)
                SliverPadding(
                  padding: const EdgeInsets.fromLTRB(Kx.s16, 0, Kx.s16, Kx.s24),
                  sliver: SliverList.separated(
                    itemCount: items.length,
                    separatorBuilder: (_, _) => const SizedBox(height: Kx.s12),
                    itemBuilder: (context, i) {
                      final r = items[i];
                      return RecordingCard(
                        recording: r,
                        sharing: controller.sharing.contains(r.id),
                        onPlay: r.isFinished ? () => _play(context, r) : null,
                        onShare: r.isFinished && !r.isShared && r.sectionId != null ? () => _share(context, r) : null,
                      );
                    },
                  ),
                ),
            ],
          ),
        );
      },
    );
  }
}

/// One recording: title, class and subject, when and how long, and its status.
class RecordingCard extends StatelessWidget {
  const RecordingCard({super.key, required this.recording, required this.onPlay, required this.onShare, this.sharing = false});

  final RecordingInfo recording;
  final VoidCallback? onPlay;
  final VoidCallback? onShare;
  final bool sharing;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final l = context.l10n;
    final fmt = Fmt.of(context);
    final r = recording;
    final good = Theme.of(context).brightness == Brightness.dark ? const Color(0xFF81C995) : const Color(0xFF137333);
    final goodBg = Theme.of(context).brightness == Brightness.dark ? const Color(0xFF0D3B1E) : const Color(0xFFE6F4EA);
    final neutral = (c.surfaceContainerHighest, c.onSurfaceVariant);

    final pills = <Widget>[
      if (!r.isFinished)
        Pill(l.uploading, icon: Icons.cloud_upload_outlined, background: c.secondaryContainer, foreground: c.onSecondaryContainer)
      else if (r.isShared)
        Pill(l.sharedWithClass, icon: Icons.check, background: goodBg, foreground: good)
      else if (r.sectionId == null)
        Pill(l.noClass, icon: Icons.block, background: neutral.$1, foreground: neutral.$2)
      else
        Pill(l.notShared, icon: Icons.lock_outline, background: neutral.$1, foreground: neutral.$2),
      switch (r.transcriptState) {
        Processing.queued => Pill(
          l.preparingTranscript,
          icon: Icons.hourglass_top,
          background: c.tertiaryContainer,
          foreground: c.onTertiaryContainer,
        ),
        Processing.done => Pill(l.transcriptReady, icon: Icons.subject, background: c.tertiaryContainer, foreground: c.onTertiaryContainer),
        Processing.failed => Pill(l.noTranscript, icon: Icons.error_outline, background: c.errorContainer, foreground: c.onErrorContainer),
        Processing.none => const SizedBox.shrink(),
      },
      if (!r.hasAudio && r.isFinished) Pill(l.noSound, icon: Icons.volume_off_outlined, background: neutral.$1, foreground: neutral.$2),
    ];

    return Card(
      key: Key('recording-${r.id}'),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onPlay,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s16, Kx.s8, Kx.s12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(r.title, style: context.text.titleMedium),
                        const SizedBox(height: 2),
                        Text(
                          [?r.sectionName, ?r.subjectName].join(' · ').ifEmpty(l.notLinkedToClass),
                          style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant),
                        ),
                        Text(
                          '${fmt.when(r.startedAt)} · ${fmt.duration(r.duration)}',
                          style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant),
                        ),
                      ],
                    ),
                  ),
                  if (onPlay != null)
                    IconButton.filledTonal(
                      key: Key('play-${r.id}'),
                      tooltip: l.play,
                      onPressed: onPlay,
                      icon: const Icon(Icons.play_arrow),
                    ),
                ],
              ),
              const SizedBox(height: Kx.s12),
              Padding(
                padding: const EdgeInsets.only(right: Kx.s8),
                child: Wrap(spacing: Kx.s8, runSpacing: Kx.s8, crossAxisAlignment: WrapCrossAlignment.center, children: pills),
              ),
              if (onShare != null || sharing)
                Align(
                  alignment: Alignment.centerRight,
                  child: TextButton.icon(
                    key: Key('share-${r.id}'),
                    onPressed: sharing ? null : onShare,
                    icon: sharing
                        ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                        : const Icon(Icons.share_outlined),
                    label: Text(l.shareWithClass),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

extension on String {
  String ifEmpty(String other) => isEmpty ? other : this;
}

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/recording/lesson_capture.dart';
import '../../core/recording/recordings.dart';
import '../../l10n/l10n.dart';
import '../board/chrome.dart';
import '../board/panel/panel_host.dart';

/// "03:12", or "1:03:12" past an hour.
String formatElapsed(Duration d) {
  String two(int n) => n.toString().padLeft(2, '0');
  final m = two(d.inMinutes.remainder(60));
  final s = two(d.inSeconds.remainder(60));
  return d.inHours > 0 ? '${d.inHours}:$m:$s' : '$m:$s';
}

/// A title for a new recording: "Corporate Accounting · 5 Oct" or "Lesson · 5 Oct" ([fallback]
/// and the date in the board's language).
String defaultRecordingTitle(String? subject, DateTime now, {String fallback = 'Lesson', String locale = 'en_US'}) =>
    '${subject ?? fallback} · ${DateFormat('d MMM', locale).format(now)}';

/// Why the board records without sound, in the board's language. The reasons come from
/// [VoiceRecorder] in English; unknown ones are shown as they are.
String voiceReason(AppLocalizations l, String reason) => switch (reason) {
  'no microphone found' => l.voiceNoMicrophone,
  'the microphone permission was denied' => l.voicePermissionDenied,
  'this board cannot record sound' => l.voiceUnsupported,
  'the microphone could not be started' => l.voiceNotStarted,
  _ => reason,
};

/// A recording's stored note (written in English by the upload queue), in the board's language.
String recordingNote(AppLocalizations l, String note) {
  if (note == 'Could not reach KINETIX Cloud') return l.cloudUnreachable;
  final failed = RegExp(r'^Request failed \((\d+)\)$').firstMatch(note);
  if (failed != null) return l.requestFailed(int.parse(failed[1]!));
  final later = RegExp(r'^Uploaded in a later class\. Share it from here if it is for (.*)\.$').firstMatch(note);
  if (later != null) return l.recUploadedLaterClass(later[1] == 'this class' ? l.thisClass : later[1]!);
  return note;
}

/// The red "recording" pill in the status strip: a dot, the time, pause/resume and stop.
class RecordingIndicator extends StatelessWidget {
  const RecordingIndicator({super.key, required this.capture, required this.onPause, required this.onResume, required this.onStop});

  final LessonCapture capture;
  final VoidCallback onPause;
  final VoidCallback onResume;
  final VoidCallback onStop;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: capture,
      builder: (context, _) {
        final c = context.colors;
        final paused = capture.isPaused;
        // The dot blinks once a second while recording and stays dim while paused.
        final on = !paused && capture.elapsed.inMilliseconds % 1000 < 600;
        return ChromeSurface(
          key: const Key('rec-indicator'),
          radius: Kx.rXl,
          padding: const EdgeInsets.fromLTRB(Kx.s12, 2, 2, 2),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.circle, size: 14, color: on ? Kx.record : Kx.record.withValues(alpha: 0.35)),
              const SizedBox(width: Kx.s8),
              Text(
                paused ? context.l10n.recPaused : context.l10n.recLive,
                style: context.text.labelLarge?.copyWith(color: paused ? c.onSurfaceVariant : c.onSurface, fontWeight: FontWeight.w700),
              ),
              const SizedBox(width: Kx.s8),
              Text(
                formatElapsed(capture.elapsed),
                key: const Key('rec-time'),
                style: context.text.labelLarge?.copyWith(color: c.onSurface, fontFeatures: const [FontFeature.tabularFigures()]),
              ),
              if (!capture.hasVoice)
                Padding(
                  padding: const EdgeInsets.only(left: Kx.s8),
                  child: Tooltip(
                    message: context.l10n.recNoSoundTooltip,
                    child: Icon(Icons.mic_off_outlined, size: 18, color: c.onSurfaceVariant),
                  ),
                ),
              const SizedBox(width: Kx.s4),
              IconButton(
                key: const Key('rec-pause'),
                tooltip: paused ? context.l10n.recResume : context.l10n.recPause,
                onPressed: paused ? onResume : onPause,
                icon: Icon(paused ? Icons.play_arrow_rounded : Icons.pause_rounded),
              ),
              IconButton.filled(
                key: const Key('rec-stop'),
                tooltip: context.l10n.recStop,
                style: IconButton.styleFrom(backgroundColor: Kx.record, foregroundColor: Colors.white),
                onPressed: onStop,
                icon: const Icon(Icons.stop_rounded),
              ),
            ],
          ),
        );
      },
    );
  }
}

/// After Stop: name the recording, choose whether to share it, then save or discard it.
/// Returns null when the teacher discards it.
class SaveRecordingDialog extends StatefulWidget {
  const SaveRecordingDialog({super.key, required this.initialTitle, required this.classLabel, required this.duration, required this.hasAudio});

  final String initialTitle;

  /// The class it can be shared with, or null without a timetabled class.
  final String? classLabel;
  final Duration duration;
  final bool hasAudio;

  @override
  State<SaveRecordingDialog> createState() => _SaveRecordingDialogState();
}

class _SaveRecordingDialogState extends State<SaveRecordingDialog> {
  late final _title = TextEditingController(text: widget.initialTitle);
  late bool _share = widget.classLabel != null;

  @override
  void dispose() {
    _title.dispose();
    super.dispose();
  }

  void _save() {
    final title = _title.text.trim();
    if (title.isEmpty) return;
    Navigator.pop(context, (title: title, share: _share));
  }

  Future<void> _discard() async {
    final sure = await showPanelDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        scrollable: true,
        title: Text(context.l10n.recDiscardTitle),
        content: Text(context.l10n.recDiscardBody(formatElapsed(widget.duration))),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: Text(context.l10n.keep)),
          FilledButton(key: const Key('rec-discard-confirm'), onPressed: () => Navigator.pop(context, true), child: Text(context.l10n.discard)),
        ],
      ),
    );
    if (sure == true && mounted) Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final l = context.l10n;
    return AlertDialog(
      scrollable: true,
      icon: const Icon(Icons.video_library_outlined),
      title: Text(l.recSaveTitle),
      content: SizedBox(
        width: 480,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              '${formatElapsed(widget.duration)} · ${widget.hasAudio ? l.recBoardAndVoice : l.recBoardOnly}',
              style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant),
            ),
            const SizedBox(height: Kx.s12),
            TextField(
              key: const Key('rec-title'),
              controller: _title,
              autofocus: true,
              maxLength: 120,
              decoration: InputDecoration(labelText: l.titleLabel),
              onSubmitted: (_) => _save(),
            ),
            SwitchListTile(
              key: const Key('rec-share'),
              contentPadding: EdgeInsets.zero,
              title: Text(l.shareWithClass),
              subtitle: Text(widget.classLabel == null ? l.shareNeedsClass : l.recShareHint(widget.classLabel!)),
              value: _share,
              onChanged: widget.classLabel == null ? null : (v) => setState(() => _share = v),
            ),
            const SizedBox(height: Kx.s4),
            Text(
              l.recUploadNote,
              style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(key: const Key('rec-discard'), onPressed: _discard, child: Text(l.discard)),
        FilledButton(key: const Key('rec-save'), onPressed: _save, child: Text(l.save)),
      ],
    );
  }
}

/// "Recordings": what this board recorded and its upload state, plus the teacher's recordings
/// in the cloud when one is signed in.
class RecordingsDialog extends StatefulWidget {
  const RecordingsDialog({super.key, required this.recordings, required this.signedInTeacherId});

  final Recordings recordings;

  /// The signed-in teacher, or null on a guest board (then only this board's list shows).
  final String? signedInTeacherId;

  @override
  State<RecordingsDialog> createState() => _RecordingsDialogState();
}

class _RecordingsDialogState extends State<RecordingsDialog> {
  List<RecordingSummary> _cloud = [];
  String? _cloudError;
  final Set<String> _busy = {};

  @override
  void initState() {
    super.initState();
    _refresh();
  }

  Future<void> _refresh() async {
    if (widget.signedInTeacherId == null) return;
    try {
      final list = await widget.recordings.cloudList();
      if (mounted) setState(() => _cloud = list);
    } catch (e) {
      if (mounted) setState(() => _cloudError = '$e');
    }
  }

  Future<void> _share(String id) async {
    setState(() => _busy.add(id));
    try {
      final s = await widget.recordings.share(id);
      if (mounted) {
        setState(() => _cloud = [for (final r in _cloud) r.id == id ? s : r]);
        showBoardMessage(context, context.l10n.sharedWith(s.sectionName ?? context.l10n.theClass));
      }
    } catch (e) {
      if (mounted) showBoardMessage(context, context.l10n.couldNotShare('$e'));
    } finally {
      if (mounted) setState(() => _busy.remove(id));
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      scrollable: true,
      icon: const Icon(Icons.video_library_outlined),
      title: Text(context.l10n.recordings),
      content: SizedBox(
        width: 680,
        height: 460,
        child: ListenableBuilder(listenable: widget.recordings, builder: (context, _) => _list(context)),
      ),
      actions: [TextButton(onPressed: () => Navigator.pop(context), child: Text(context.l10n.close))],
    );
  }

  Widget _list(BuildContext context) {
    final local = widget.recordings.items;
    final localIds = local.map((r) => r.id).toSet();
    // Cloud recordings that this board does not have (older ones, or from another board).
    // Unfinished ones are still uploading somewhere else.
    final cloudOnly = _cloud.where((r) => !localIds.contains(r.id) && r.finishedAt != null).toList();
    final cloudById = {for (final r in _cloud) r.id: r};
    if (local.isEmpty && cloudOnly.isEmpty) {
      return KxEmptyState(
        icon: Icons.video_library_outlined,
        message: _cloudError != null ? context.l10n.couldNotLoadRecordings(_cloudError!) : context.l10n.noRecordingsYet,
      );
    }
    final rows = <Widget>[for (final r in local) _localRow(context, r, cloudById[r.id]), for (final r in cloudOnly) _cloudRow(context, r)];
    return ListView.separated(
      itemCount: rows.length,
      separatorBuilder: (_, _) => const SizedBox(height: Kx.s8),
      itemBuilder: (_, i) => rows[i],
    );
  }

  Widget _localRow(BuildContext context, LocalRecording r, RecordingSummary? cloud) {
    final recs = widget.recordings;
    final status = recs.statusOf(r);
    final shared = r.sharedAt != null || cloud?.sharedAt != null;
    final mine = r.teacherId == widget.signedInTeacherId;
    final l = context.l10n;
    final details = [
      _when(context, r.startedAt),
      formatElapsed(Duration(milliseconds: r.durationMs)),
      r.sectionName,
      r.hasAudio ? null : l.recNoSound,
      if (!mine) r.teacherName,
    ].whereType<String>().join(' · ');
    final (label, icon) = switch (status) {
      RecordingStatus.waiting => (mine ? l.recWaiting : l.recUploadsWhen(r.teacherName.split(' ').first), Icons.schedule),
      RecordingStatus.uploading => (l.recUploading(((recs.progressOf(r) ?? 0) * 100).round()), Icons.cloud_upload_outlined),
      RecordingStatus.uploaded ||
      RecordingStatus.shared => (shared ? l.shared : l.recUploaded, shared ? Icons.people_alt_outlined : Icons.cloud_done_outlined),
      RecordingStatus.failed => (l.recUploadFailed, Icons.error_outline),
    };
    Widget? action;
    if (status == RecordingStatus.failed && mine) {
      action = TextButton.icon(onPressed: () => recs.retry(r.id), icon: const Icon(Icons.refresh, size: 18), label: Text(l.retry));
    } else if (r.uploaded && !shared && mine && r.sectionName != null) {
      action = _shareButton(r.id);
    }
    // The last error matters only while it can be retried, that is to the teacher who recorded it.
    final note = (mine ? r.error : null) ?? r.notShared;
    return _row(
      context,
      key: Key('rec-${r.id}'),
      title: r.title,
      details: note == null ? details : '$details\n${recordingNote(l, note)}',
      status: Chip(key: Key('rec-status-${r.id}'), avatar: Icon(icon, size: 16), label: Text(label)),
      progress: recs.progressOf(r),
      action: action,
    );
  }

  Widget _cloudRow(BuildContext context, RecordingSummary r) {
    final shared = r.sharedAt != null;
    final l = context.l10n;
    final details = [
      _when(context, r.startedAt),
      if (r.durationMs != null) formatElapsed(Duration(milliseconds: r.durationMs!)),
      r.sectionName,
      r.hasAudio ? null : l.recNoSound,
    ].whereType<String>().join(' · ');
    return _row(
      context,
      key: Key('rec-${r.id}'),
      title: r.title,
      details: details,
      status: Chip(
        key: Key('rec-status-${r.id}'),
        avatar: Icon(shared ? Icons.people_alt_outlined : Icons.cloud_done_outlined, size: 16),
        label: Text(shared ? l.shared : l.recUploaded),
      ),
      action: !shared && r.sectionId != null ? _shareButton(r.id) : null,
    );
  }

  Widget _shareButton(String id) => TextButton.icon(
    key: Key('rec-share-$id'),
    onPressed: _busy.contains(id) ? null : () => _share(id),
    icon: const Icon(Icons.share_outlined, size: 18),
    label: Text(context.l10n.share),
  );

  Widget _row(
    BuildContext context, {
    required Key key,
    required String title,
    required String details,
    required Widget status,
    double? progress,
    Widget? action,
  }) {
    final c = context.colors;
    return Material(
      key: key,
      color: c.surfaceContainerHighest,
      borderRadius: Kx.radiusLg,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: Kx.s4),
        child: Column(
          children: [
            ListTile(
              leading: Icon(Icons.play_lesson_outlined, color: c.primary),
              title: Text(title),
              subtitle: Text(details),
              trailing: Row(mainAxisSize: MainAxisSize.min, children: [status, ?action]),
            ),
            if (progress != null)
              Padding(
                padding: const EdgeInsets.fromLTRB(Kx.s16, 0, Kx.s16, Kx.s8),
                child: LinearProgressIndicator(value: progress),
              ),
          ],
        ),
      ),
    );
  }

  static String _when(BuildContext context, DateTime t) => DateFormat('d MMM, HH:mm', context.dateLocale).format(t.toLocal());
}

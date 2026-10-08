import 'package:flutter/material.dart';
import 'package:kinetix_lesson/kinetix_lesson.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/models.dart';
import '../../l10n/l10n.dart';
import '../../widgets/common.dart';
import '../boards/board_screen.dart';
import 'recordings.dart';

/// Class notes and recaps: the written summary of each shared lesson recording, and the
/// whiteboards teachers shared with the class.
class ClassNotesScreen extends StatefulWidget {
  const ClassNotesScreen({super.key, required this.api, required this.studentId});

  final StudentApi api;
  final String studentId;

  static Future<void> open(BuildContext context, StudentApi api, String studentId) =>
      Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => ClassNotesScreen(api: api, studentId: studentId)));

  @override
  State<ClassNotesScreen> createState() => _ClassNotesScreenState();
}

class _ClassNotesScreenState extends State<ClassNotesScreen> {
  StudentSummary? _summary;
  ApiException? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final s = await widget.api.summary(widget.studentId);
      if (mounted) setState(() => _summary = s);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final s = _summary;
    return Scaffold(
      appBar: AppBar(title: Text(l.classNotesTitle)),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s8, Kx.s16, Kx.s24),
          children: [
            if (_error != null) ErrorBanner(_error!, onRetry: _load),
            if (s == null && _error == null) const KxLoading(),
            if (s != null && s.recordings.isEmpty && s.boards.isEmpty) KxEmptyState(icon: Icons.sticky_note_2_outlined, message: l.classNotesEmpty),
            if (s != null && s.recordings.isNotEmpty) ...[
              KxSectionHeader(l.classNotesRecaps),
              for (final r in s.recordings) ...[
                KxCard(
                  key: Key('recap-${r.id}'),
                  onTap: () => _RecapSheet.show(context, widget.api, r),
                  child: Row(
                    children: [
                      const KxIconBox(Icons.notes_outlined),
                      const SizedBox(width: Kx.s12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(r.subjectName ?? r.title, style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w600)),
                            Text(
                              [r.title, context.fmt.relativeDay(r.startedAt, s.today)].join(' · '),
                              style: context.text.bodySmall?.copyWith(color: context.colors.onSurfaceVariant),
                            ),
                          ],
                        ),
                      ),
                      const Icon(Icons.chevron_right),
                    ],
                  ),
                ),
                const SizedBox(height: Kx.s12),
              ],
            ],
            if (s != null && s.boards.isNotEmpty) ...[
              KxSectionHeader(l.classNotesBoards),
              for (final b in s.boards) ...[
                KxCard(
                  key: Key('notes-board-${b.id}'),
                  onTap: () => BoardScreen.open(context, widget.api, b.id, summary: b),
                  child: Row(
                    children: [
                      const KxIconBox(Icons.co_present_outlined),
                      const SizedBox(width: Kx.s12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(b.title, style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w600)),
                            Text(
                              [?b.subjectName, l.pages(b.pageCount)].join(' · '),
                              style: context.text.bodySmall?.copyWith(color: context.colors.onSurfaceVariant),
                            ),
                          ],
                        ),
                      ),
                      const Icon(Icons.chevron_right),
                    ],
                  ),
                ),
                const SizedBox(height: Kx.s12),
              ],
            ],
          ],
        ),
      ),
    );
  }
}

/// The recap of one lesson, loaded on open, with a button to watch the lesson itself.
class _RecapSheet extends StatefulWidget {
  const _RecapSheet({required this.api, required this.recording});

  final StudentApi api;
  final RecordingInfo recording;

  static Future<void> show(BuildContext context, StudentApi api, RecordingInfo r) => showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (_) => _RecapSheet(api: api, recording: r),
  );

  @override
  State<_RecapSheet> createState() => _RecapSheetState();
}

class _RecapSheetState extends State<_RecapSheet> {
  RecordingInfo? _full;
  ApiException? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final r = await widget.api.recording(widget.recording.id);
      if (mounted) setState(() => _full = r);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final summary = _full?.summary;
    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(Kx.s16, 0, Kx.s16, Kx.s24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(widget.recording.title, style: context.text.titleLarge),
            const SizedBox(height: Kx.s12),
            if (_error != null) ErrorBanner(_error!, onRetry: _load),
            if (_full == null && _error == null) const KxLoading(),
            if (_full != null && summary == null) Text(l.classNotesNoRecap, key: const Key('noRecap'), style: context.text.bodyMedium?.copyWith(color: context.colors.onSurfaceVariant)),
            if (summary != null) ...[
              if (summary.summary.isNotEmpty) Text(summary.summary, key: const Key('recapText'), style: context.text.bodyLarge),
              if (summary.keyPoints.isNotEmpty) ...[
                const SizedBox(height: Kx.s12),
                Text(l.classNotesKeyPoints, style: context.text.titleSmall),
                for (final p in summary.keyPoints)
                  Padding(
                    padding: const EdgeInsets.only(top: Kx.s4),
                    child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [const Text('• '), Expanded(child: Text(p))]),
                  ),
              ],
            ],
            const SizedBox(height: Kx.s16),
            OutlinedButton.icon(
              key: const Key('watchLesson'),
              onPressed: () => openRecording(context, widget.api, widget.recording.id, initial: widget.recording),
              icon: const Icon(Icons.play_arrow_rounded),
              label: Text(l.classNotesWatch),
            ),
          ],
        ),
      ),
    );
  }
}

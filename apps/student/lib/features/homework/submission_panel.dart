import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/attachments.dart';
import '../../core/format.dart';
import '../../core/models.dart';
import '../../l10n/l10n.dart';
import '../../widgets/common.dart';

/// The student's hand-in for one homework: its status (handed in, late, checked, returned with
/// the teacher's remark), what was handed in, and "Hand in" / "Hand in again".
class SubmissionPanel extends StatefulWidget {
  const SubmissionPanel({super.key, required this.api, required this.homework, required this.studentId});

  final StudentApi api;
  final Homework homework;
  final String studentId;

  @override
  State<SubmissionPanel> createState() => _SubmissionPanelState();
}

class _SubmissionPanelState extends State<SubmissionPanel> {
  Submission? _submission;
  ApiException? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final s = await widget.api.submission(widget.homework.id, widget.studentId);
      if (mounted) setState(() => _submission = s);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  Future<void> _handIn() async {
    final done = await HandInScreen.open(context, api: widget.api, homework: widget.homework, studentId: widget.studentId, previous: _submission);
    if (done == null || !mounted) return;
    setState(() => _submission = done);
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(context.l10n.handedInDone)));
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final l = context.l10n;
    final s = _submission;
    if (_error != null) return ErrorBanner(_error!, onRetry: _load);
    if (s == null) {
      return const Padding(
        padding: EdgeInsets.all(Kx.s16),
        child: Center(child: CircularProgressIndicator()),
      );
    }
    final (label, icon, bg, fg) = switch (s.status) {
      null => (l.notHandedIn, Icons.pending_outlined, c.surfaceContainerHighest, c.onSurfaceVariant),
      SubmissionStatus.submitted => (l.statusHandedIn, Icons.task_alt, c.secondaryContainer, c.onSecondaryContainer),
      SubmissionStatus.checked => (l.statusChecked, Icons.verified_outlined, Tone.goodContainer(context), Tone.good(context)),
      SubmissionStatus.returned => (l.statusReturned, Icons.replay, Tone.warnContainer(context), Tone.warn(context)),
    };
    return Card(
      key: const Key('submissionPanel'),
      child: Padding(
        padding: const EdgeInsets.all(Kx.s16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(l.yourWork, style: context.text.titleSmall),
            const SizedBox(height: Kx.s8),
            Wrap(
              spacing: Kx.s8,
              runSpacing: Kx.s4,
              children: [
                Pill(label, key: const Key('submissionStatus'), icon: icon, background: bg, foreground: fg),
                if (s.status != null && s.late) Pill(l.statusLate, key: const Key('submissionLate'), background: c.errorContainer, foreground: c.onErrorContainer),
              ],
            ),
            if (s.submittedAt != null) ...[
              const SizedBox(height: Kx.s8),
              Text(l.handedInAt(context.fmt.dateTime(s.submittedAt!)), style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant)),
            ],
            if (s.checkedAt != null && s.status != SubmissionStatus.submitted)
              Text(
                s.status == SubmissionStatus.returned
                    ? l.returnedByOn(s.checkedBy ?? '', context.fmt.shortDay(s.checkedAt!))
                    : l.checkedByOn(s.checkedBy ?? '', context.fmt.shortDay(s.checkedAt!)),
                style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant),
              ),
            if (s.status == SubmissionStatus.returned) ...[
              const SizedBox(height: Kx.s8),
              Text(l.returnedNote, style: context.text.bodyMedium),
            ],
            if (s.remark != null && s.remark!.isNotEmpty) ...[
              const SizedBox(height: Kx.s12),
              Container(
                key: const Key('submissionRemark'),
                padding: const EdgeInsets.all(Kx.s12),
                decoration: BoxDecoration(color: c.surfaceContainerHigh, borderRadius: Kx.radiusMd),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(l.teacherRemark, style: context.text.labelMedium?.copyWith(color: c.onSurfaceVariant)),
                    const SizedBox(height: 2),
                    SelectableText(s.remark!, style: context.text.bodyLarge),
                  ],
                ),
              ),
            ],
            if (s.text.isNotEmpty) ...[
              const SizedBox(height: Kx.s12),
              Text(l.answerLabel, style: context.text.labelMedium?.copyWith(color: c.onSurfaceVariant)),
              SelectableText(s.text, style: context.text.bodyLarge),
            ],
            for (final f in s.files)
              ListTile(
                key: Key('submittedFile-${f.index}'),
                contentPadding: EdgeInsets.zero,
                leading: Icon(f.isImage ? Icons.image_outlined : Icons.picture_as_pdf_outlined),
                title: Text(f.name, maxLines: 1, overflow: TextOverflow.ellipsis),
                subtitle: Text(Fmt.fileSize(f.bytes)),
                onTap: f.isImage
                    ? () => SubmittedPhotoScreen.open(context, widget.api.submissionFile(widget.homework.id, widget.studentId, f.index), f.name)
                    : null,
              ),
            if (s.canHandIn) ...[
              const SizedBox(height: Kx.s12),
              if (s.status == null || s.status == SubmissionStatus.returned)
                FilledButton.icon(
                  key: const Key('handIn'),
                  onPressed: _handIn,
                  icon: const Icon(Icons.upload_outlined),
                  label: Text(s.status == null ? l.handIn : l.handInAgain),
                )
              else
                OutlinedButton.icon(
                  key: const Key('handIn'),
                  onPressed: _handIn,
                  icon: const Icon(Icons.edit_outlined),
                  label: Text(l.handInAgain),
                ),
            ],
          ],
        ),
      ),
    );
  }
}

/// Writing the answer and adding photos or PDFs, then handing in with upload progress.
class HandInScreen extends StatefulWidget {
  const HandInScreen({super.key, required this.api, required this.homework, required this.studentId, this.previous});

  final StudentApi api;
  final Homework homework;
  final String studentId;
  final Submission? previous;

  static Future<Submission?> open(
    BuildContext context, {
    required StudentApi api,
    required Homework homework,
    required String studentId,
    Submission? previous,
  }) => Navigator.of(context).push<Submission>(
    MaterialPageRoute(
      builder: (_) => HandInScreen(api: api, homework: homework, studentId: studentId, previous: previous),
    ),
  );

  @override
  State<HandInScreen> createState() => _HandInScreenState();
}

class _HandInScreenState extends State<HandInScreen> {
  late final _text = TextEditingController(text: widget.previous?.text ?? '');
  final _files = <UploadFile>[];
  bool _sending = false;
  double? _progress;
  Object? _error;

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  Future<void> _add(AttachmentSource source) async {
    final room = maxUploadFiles - _files.length;
    if (room <= 0) return;
    final List<UploadFile> picked;
    try {
      picked = await AttachmentPicker.instance.pick(source, max: room);
    } catch (_) {
      if (mounted) setState(() => _error = context.l10n.couldNotAddFile);
      return;
    }
    if (!mounted) return;
    final tooBig = picked.where((f) => f.bytes.length > maxUploadBytes).toList();
    setState(() {
      _files.addAll(picked.where((f) => f.bytes.length <= maxUploadBytes).take(room));
      _error = tooBig.isEmpty ? null : context.l10n.fileTooBig(tooBig.first.name);
    });
  }

  Future<void> _send() async {
    final l = context.l10n;
    if (_text.text.trim().isEmpty && _files.isEmpty) {
      setState(() => _error = l.errSubmissionEmpty);
      return;
    }
    setState(() {
      _sending = true;
      _progress = 0;
      _error = null;
    });
    try {
      final s = await widget.api.submitHomework(
        widget.homework.id,
        widget.studentId,
        text: _text.text.trim(),
        files: List.of(_files),
        onProgress: (sent, total) {
          if (mounted && total > 0) setState(() => _progress = sent / total);
        },
      );
      if (mounted) Navigator.of(context).pop(s);
    } on ApiException catch (e) {
      if (mounted) {
        setState(() {
          _sending = false;
          _progress = null;
          _error = e;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final l = context.l10n;
    final full = _files.length >= maxUploadFiles;
    return Scaffold(
      appBar: AppBar(title: Text(l.handInTitle)),
      body: LayoutBuilder(
        builder: (context, box) => ListView(
          key: const Key('handInList'),
          padding: EdgeInsets.fromLTRB(sideGutter(box.maxWidth), Kx.s8, sideGutter(box.maxWidth), Kx.s32),
          children: [
            Text(widget.homework.title, style: context.text.titleMedium),
            Text(widget.homework.subject, style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant)),
            const SizedBox(height: Kx.s16),
            TextField(
              key: const Key('handInText'),
              controller: _text,
              enabled: !_sending,
              minLines: 4,
              maxLines: 10,
              maxLength: 5000,
              decoration: InputDecoration(labelText: l.answerLabel, hintText: l.answerHint, alignLabelWithHint: true, border: const OutlineInputBorder()),
            ),
            const SizedBox(height: Kx.s8),
            Text(l.filesCount(_files.length, maxUploadFiles), style: context.text.titleSmall),
            const SizedBox(height: Kx.s4),
            for (final (i, f) in _files.indexed)
              ListTile(
                key: Key('pickedFile-$i'),
                contentPadding: EdgeInsets.zero,
                leading: f.isImage
                    ? ClipRRect(
                        borderRadius: Kx.radiusSm,
                        child: Image.memory(
                          f.bytes,
                          width: 48,
                          height: 48,
                          fit: BoxFit.cover,
                          errorBuilder: (_, _, _) => const Icon(Icons.image_outlined),
                        ),
                      )
                    : const Icon(Icons.picture_as_pdf_outlined),
                title: Text(f.name, maxLines: 1, overflow: TextOverflow.ellipsis),
                subtitle: Text(Fmt.fileSize(f.bytes.length)),
                trailing: IconButton(
                  tooltip: l.removeFile,
                  icon: const Icon(Icons.close),
                  onPressed: _sending ? null : () => setState(() => _files.removeAt(i)),
                ),
              ),
            Wrap(
              spacing: Kx.s8,
              runSpacing: Kx.s8,
              children: [
                OutlinedButton.icon(
                  key: const Key('addCamera'),
                  onPressed: _sending || full ? null : () => _add(AttachmentSource.camera),
                  icon: const Icon(Icons.photo_camera_outlined),
                  label: Text(l.takePhoto),
                ),
                OutlinedButton.icon(
                  key: const Key('addGallery'),
                  onPressed: _sending || full ? null : () => _add(AttachmentSource.gallery),
                  icon: const Icon(Icons.photo_library_outlined),
                  label: Text(l.choosePhotos),
                ),
                OutlinedButton.icon(
                  key: const Key('addPdf'),
                  onPressed: _sending || full ? null : () => _add(AttachmentSource.pdf),
                  icon: const Icon(Icons.picture_as_pdf_outlined),
                  label: Text(l.addPdf),
                ),
              ],
            ),
            const SizedBox(height: Kx.s4),
            Text(l.filesHint, style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant)),
            if (_error != null) ...[const SizedBox(height: Kx.s16), ErrorBanner(_error!)],
            const SizedBox(height: Kx.s24),
            if (_sending) ...[
              LinearProgressIndicator(key: const Key('uploadProgress'), value: _progress),
              const SizedBox(height: Kx.s8),
              Text(l.uploading(Fmt.percent((_progress ?? 0) * 100)), style: context.text.bodyMedium),
            ] else
              FilledButton.icon(key: const Key('sendHandIn'), onPressed: _send, icon: const Icon(Icons.send), label: Text(l.handIn)),
          ],
        ),
      ),
    );
  }
}

/// A handed-in photo, full screen, pinch to zoom.
class SubmittedPhotoScreen extends StatelessWidget {
  const SubmittedPhotoScreen({super.key, required this.file, required this.name});

  final ({Uri url, Map<String, String> headers}) file;
  final String name;

  static Future<void> open(BuildContext context, ({Uri url, Map<String, String> headers}) file, String name) =>
      Navigator.of(context).push(MaterialPageRoute(builder: (_) => SubmittedPhotoScreen(file: file, name: name)));

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(name)),
      body: InteractiveViewer(
        maxScale: 5,
        child: Center(
          child: Image.network(
            file.url.toString(),
            headers: file.headers,
            errorBuilder: (context, _, _) => KxEmptyState(icon: Icons.broken_image_outlined, message: context.l10n.photoNotLoaded),
          ),
        ),
      ),
    );
  }
}

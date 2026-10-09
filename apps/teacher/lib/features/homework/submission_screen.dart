import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/files.dart';
import '../../core/format.dart';
import '../../core/l10n.dart';
import '../../core/models.dart';
import '../../widgets/common.dart';
import 'homework_detail_screen.dart';

/// One student's homework: the answer, photos (open full screen to zoom) and PDFs, and Check
/// or Return with a remark. Pops with the reviewed [Submission].
class SubmissionScreen extends StatefulWidget {
  const SubmissionScreen({super.key, required this.api, required this.homework, required this.submission, this.openFile = openWithSystem});

  final TeacherApi api;
  final Homework homework;
  final Submission submission;
  final OpenFile openFile;

  @override
  State<SubmissionScreen> createState() => _SubmissionScreenState();
}

class _SubmissionScreenState extends State<SubmissionScreen> {
  late final _remark = TextEditingController(text: widget.submission.remark ?? '');
  final _files = <int, Future<Uint8List>>{};
  SubmissionStatus? _saving;
  bool _openingFile = false;
  bool _drafting = false;

  Submission get s => widget.submission;

  /// Each file is downloaded once while the screen is open.
  Future<Uint8List> _file(int index) => _files[index] ??= widget.api.submissionFile(widget.homework.id, s.studentId, index);

  @override
  void dispose() {
    _remark.dispose();
    super.dispose();
  }

  Future<void> _review(SubmissionStatus status) async {
    setState(() => _saving = status);
    final messenger = ScaffoldMessenger.of(context);
    final l = context.l10n;
    final navigator = Navigator.of(context);
    try {
      final done = await widget.api.reviewSubmission(widget.homework.id, s, status: status, remark: _remark.text.trim());
      messenger.showSnackBar(
        SnackBar(content: Text(status == SubmissionStatus.checked ? l.workChecked(s.fullName) : l.workReturned(s.fullName))),
      );
      navigator.pop(done);
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(l.errorText(e))));
      if (mounted) setState(() => _saving = null);
    }
  }

  /// Asks how many marks the question carries, then shows the AI's draft. The teacher can copy its reasoning into the remark.
  Future<void> _markingHelp() async {
    final l = context.l10n;
    final messenger = ScaffoldMessenger.of(context);
    final max = await showDialog<double>(context: context, builder: (_) => const _OutOfDialog());
    if (max == null || max <= 0 || max > 100 || !mounted) return;
    setState(() => _drafting = true);
    try {
      final hw = widget.homework;
      final draft = await widget.api.suggestMarks(hw.id, s.studentId, question: hw.instructions.trim().length >= 3 ? hw.instructions : hw.title, maxMarks: max);
      if (!mounted) return;
      setState(() => _drafting = false);
      final use = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          key: const Key('markingDraft'),
          title: Text(l.markingHelpDraft(draft.suggestedMarks.toStringAsFixed(1), draft.maxMarks.toStringAsFixed(0))),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(draft.rationale),
                for (final c in draft.criteria) Padding(padding: const EdgeInsets.only(top: Kx.s8), child: Text('${c.criterion}: ${c.awarded.toStringAsFixed(1)}. ${c.comment}')),
                const SizedBox(height: Kx.s12),
                Text(l.markingHelpNote, style: Theme.of(ctx).textTheme.bodySmall),
              ],
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(l.done)),
            FilledButton(key: const Key('markingUse'), onPressed: () => Navigator.pop(ctx, true), child: Text(l.markingHelpUse)),
          ],
        ),
      );
      if (use == true && mounted) {
        final text = draft.rationale.length > 500 ? draft.rationale.substring(0, 500) : draft.rationale;
        setState(() => _remark.text = text);
      }
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(l.errorText(e))));
    } finally {
      if (mounted) setState(() => _drafting = false);
    }
  }

  Future<void> _openFile(SubmissionFile f) async {
    setState(() => _openingFile = true);
    final messenger = ScaffoldMessenger.of(context);
    final l = context.l10n;
    try {
      final bytes = await _file(f.index);
      if (!await widget.openFile(bytes, f.name, f.mime)) messenger.showSnackBar(SnackBar(content: Text(l.couldNotOpenFile)));
    } on ApiException catch (e) {
      _files.remove(f.index);
      messenger.showSnackBar(SnackBar(content: Text(l.errorText(e))));
    } finally {
      if (mounted) setState(() => _openingFile = false);
    }
  }

  void _viewPhotos(List<SubmissionFile> photos, int initial) => Navigator.of(context).push(
    MaterialPageRoute<void>(
      fullscreenDialog: true,
      builder: (_) => PhotoViewer(photos: [for (final p in photos) (p.name, _file(p.index))], initial: initial),
    ),
  );

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final c = context.colors;
    final fmt = Fmt.of(context);
    final photos = [
      for (final f in s.files)
        if (f.isImage) f,
    ];
    final others = [
      for (final f in s.files)
        if (!f.isImage) f,
    ];
    final (bg, fg) = submissionColors(context, s.status);
    final busy = _saving != null;
    return Scaffold(
      appBar: AppBar(title: Text(s.fullName, maxLines: 1, overflow: TextOverflow.ellipsis)),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s8, Kx.s16, Kx.s32),
        children: [
          Text(widget.homework.title, style: context.text.titleMedium),
          const SizedBox(height: Kx.s4),
          Wrap(
            spacing: Kx.s8,
            runSpacing: Kx.s4,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              Pill(l.submissionStatus(s.status), key: const Key('submissionStatus'), background: bg, foreground: fg),
              if (s.late) const LateBadge(key: Key('lateBadge')),
              if (s.submittedAt != null)
                Text(l.handedInAt(fmt.when(s.submittedAt!)), style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant)),
            ],
          ),
          if (s.text.isNotEmpty) ...[
            _Label(l.answer),
            SelectableText(s.text, key: const Key('submissionText'), style: context.text.bodyLarge),
            const SizedBox(height: Kx.s8),
            Align(
              alignment: Alignment.centerLeft,
              child: OutlinedButton.icon(
                key: const Key('markingHelp'),
                onPressed: _drafting ? null : _markingHelp,
                icon: _drafting ? const _Spinner() : const Icon(Icons.auto_awesome_outlined),
                label: Text(l.markingHelp),
              ),
            ),
          ],
          if (s.files.isNotEmpty) _Label(l.photosAndFiles),
          if (photos.isNotEmpty)
            Wrap(
              spacing: Kx.s8,
              runSpacing: Kx.s8,
              children: [
                for (final (i, p) in photos.indexed)
                  _Thumbnail(key: Key('photo-${p.index}'), bytes: _file(p.index), onTap: () => _viewPhotos(photos, i)),
              ],
            ),
          for (final f in others)
            ListTile(
              key: Key('file-${f.index}'),
              contentPadding: EdgeInsets.zero,
              leading: Icon(f.isPdf ? Icons.picture_as_pdf_outlined : Icons.insert_drive_file_outlined, color: c.primary),
              title: Text(f.name, maxLines: 2, overflow: TextOverflow.ellipsis),
              subtitle: f.isPdf ? Text(l.openPdf) : null,
              trailing: _openingFile
                  ? const SizedBox.square(dimension: 20, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.open_in_new),
              onTap: _openingFile ? null : () => _openFile(f),
            ),
          _Label(l.remarkOptional),
          TextField(
            key: const Key('reviewRemark'),
            controller: _remark,
            maxLength: 500,
            minLines: 2,
            maxLines: 5,
            textCapitalization: TextCapitalization.sentences,
            decoration: InputDecoration(hintText: l.reviewRemarkHint, border: const OutlineInputBorder()),
          ),
          const SizedBox(height: Kx.s8),
          Wrap(
            alignment: WrapAlignment.end,
            spacing: Kx.s8,
            runSpacing: Kx.s8,
            children: [
              OutlinedButton.icon(
                key: const Key('returnWork'),
                onPressed: busy ? null : () => _review(SubmissionStatus.returned),
                icon: _saving == SubmissionStatus.returned ? const _Spinner() : const Icon(Icons.undo),
                label: Text(l.returnWork),
              ),
              FilledButton.icon(
                key: const Key('checkWork'),
                onPressed: busy ? null : () => _review(SubmissionStatus.checked),
                icon: _saving == SubmissionStatus.checked ? const _Spinner() : const Icon(Icons.done_all),
                label: Text(l.checkWork),
              ),
            ],
          ),
          const SizedBox(height: Kx.s4),
          Text(l.reviewNotifies, style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant)),
        ],
      ),
    );
  }
}

/// Asks how many marks the question carries. It owns its text controller so the field is not used after the dialog closes.
class _OutOfDialog extends StatefulWidget {
  const _OutOfDialog();

  @override
  State<_OutOfDialog> createState() => _OutOfDialogState();
}

class _OutOfDialogState extends State<_OutOfDialog> {
  final _outOf = TextEditingController(text: '10');

  @override
  void dispose() {
    _outOf.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return AlertDialog(
      title: Text(l.markingHelp),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(l.markingHelpNote),
          const SizedBox(height: Kx.s12),
          TextField(key: const Key('markingOutOf'), controller: _outOf, keyboardType: TextInputType.number, decoration: InputDecoration(labelText: l.markingHelpOutOf, border: const OutlineInputBorder())),
        ],
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: Text(l.cancel)),
        FilledButton(key: const Key('markingAsk'), onPressed: () => Navigator.pop(context, double.tryParse(_outOf.text.trim())), child: Text(l.markingHelpAsk)),
      ],
    );
  }
}

/// A section label inside the padded list.
class _Label extends StatelessWidget {
  const _Label(this.text);

  final String text;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(top: Kx.s24, bottom: Kx.s8),
    child: Text(text, style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w500)),
  );
}

class _Spinner extends StatelessWidget {
  const _Spinner();

  @override
  Widget build(BuildContext context) => const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2));
}

/// A photo from the submission, loaded on demand.
class _Thumbnail extends StatelessWidget {
  const _Thumbnail({super.key, required this.bytes, required this.onTap});

  final Future<Uint8List> bytes;
  final VoidCallback onTap;

  static const size = 96.0;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return ClipRRect(
      borderRadius: Kx.radiusMd,
      child: Material(
        color: c.surfaceContainerHigh,
        child: InkWell(
          onTap: onTap,
          child: SizedBox.square(
            dimension: size,
            child: FutureBuilder<Uint8List>(
              future: bytes,
              builder: (context, snap) {
                if (snap.hasData) {
                  return Image.memory(
                    snap.data!,
                    fit: BoxFit.cover,
                    cacheWidth: 300,
                    errorBuilder: (_, _, _) => Icon(Icons.image_outlined, color: c.onSurfaceVariant),
                  );
                }
                if (snap.hasError) return Icon(Icons.broken_image_outlined, color: c.onSurfaceVariant);
                return const Center(child: SizedBox.square(dimension: 20, child: CircularProgressIndicator(strokeWidth: 2)));
              },
            ),
          ),
        ),
      ),
    );
  }
}

/// Photos full screen: swipe between them, pinch or double-tap to zoom.
class PhotoViewer extends StatefulWidget {
  const PhotoViewer({super.key, required this.photos, this.initial = 0});

  /// (file name, bytes).
  final List<(String, Future<Uint8List>)> photos;
  final int initial;

  @override
  State<PhotoViewer> createState() => _PhotoViewerState();
}

class _PhotoViewerState extends State<PhotoViewer> {
  late final _pages = PageController(initialPage: widget.initial);
  late int _index = widget.initial;

  @override
  void dispose() {
    _pages.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        title: Text(widget.photos.length > 1 ? l.photoOf(_index + 1, widget.photos.length) : widget.photos[_index].$1),
      ),
      body: PageView.builder(
        key: const Key('photoViewer'),
        controller: _pages,
        itemCount: widget.photos.length,
        onPageChanged: (i) => setState(() => _index = i),
        itemBuilder: (context, i) => _ZoomablePhoto(bytes: widget.photos[i].$2),
      ),
    );
  }
}

class _ZoomablePhoto extends StatefulWidget {
  const _ZoomablePhoto({required this.bytes});

  final Future<Uint8List> bytes;

  @override
  State<_ZoomablePhoto> createState() => _ZoomablePhotoState();
}

class _ZoomablePhotoState extends State<_ZoomablePhoto> {
  final _zoom = TransformationController();
  TapDownDetails? _tap;

  @override
  void dispose() {
    _zoom.dispose();
    super.dispose();
  }

  /// Double tap: 2.5× around the finger, or back to fit.
  void _toggleZoom() {
    if (_zoom.value != Matrix4.identity()) {
      _zoom.value = Matrix4.identity();
      return;
    }
    final p = _tap?.localPosition ?? Offset.zero;
    const scale = 2.5;
    _zoom.value = Matrix4.identity()
      ..translateByDouble(-p.dx * (scale - 1), -p.dy * (scale - 1), 0, 1)
      ..scaleByDouble(scale, scale, 1, 1);
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<Uint8List>(
      future: widget.bytes,
      builder: (context, snap) {
        if (snap.hasError) {
          final e = snap.error;
          return Center(
            child: Padding(
              padding: const EdgeInsets.all(Kx.s24),
              child: e is ApiException ? ErrorBanner.api(e) : const Icon(Icons.broken_image_outlined, color: Colors.white70, size: 48),
            ),
          );
        }
        if (!snap.hasData) return const Center(child: CircularProgressIndicator());
        return GestureDetector(
          onDoubleTapDown: (d) => _tap = d,
          onDoubleTap: _toggleZoom,
          child: InteractiveViewer(
            transformationController: _zoom,
            minScale: 1,
            maxScale: 6,
            child: Center(
              child: Image.memory(
                snap.data!,
                fit: BoxFit.contain,
                errorBuilder: (_, _, _) => const Icon(Icons.broken_image_outlined, color: Colors.white70, size: 48),
              ),
            ),
          ),
        );
      },
    );
  }
}

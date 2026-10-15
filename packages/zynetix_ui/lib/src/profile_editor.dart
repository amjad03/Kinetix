import 'dart:typed_data';

import 'package:flutter/material.dart';

import 'photo.dart';
import 'strings.dart';
import 'theme.dart';
import 'tokens.dart';
import 'widgets.dart';

/// Where a new profile photo comes from.
enum KxPhotoSource { camera, gallery }

/// Editing one's own profile (Teacher, Student and Parent Apps): photo from the camera or the
/// gallery (cropped square and compressed here), name, email and, for teachers, the subjects
/// they teach. The phone number is shown read-only, with the reason.
class KxProfileEditScreen extends StatefulWidget {
  const KxProfileEditScreen({
    super.key,
    required this.fullName,
    required this.email,
    required this.phone,
    required this.photo,
    required this.pickImage,
    required this.onPhoto,
    required this.onSave,
    required this.describeError,
    this.onRemovePhoto,
    this.teachingSubjects,
    this.processPhoto = kxSquareJpeg,
  });

  final String fullName;
  final String? email;
  final String? phone;
  final ImageProvider? photo;

  /// Null for anyone who is not a teacher (the field is hidden).
  final List<String>? teachingSubjects;

  /// The picked image's bytes, or null if the person cancelled.
  final Future<Uint8List?> Function(KxPhotoSource source) pickImage;

  /// Uploads the square JPEG.
  final Future<void> Function(Uint8List jpeg) onPhoto;
  final Future<void> Function()? onRemovePhoto;
  final Future<void> Function({required String fullName, required String? email, List<String>? teachingSubjects}) onSave;

  /// A sentence for a failed save or upload.
  final String Function(Object error) describeError;

  /// Crops and compresses (replaceable in tests, where isolates do not run).
  final Future<Uint8List?> Function(Uint8List bytes) processPhoto;

  @override
  State<KxProfileEditScreen> createState() => _KxProfileEditScreenState();
}

class _KxProfileEditScreenState extends State<KxProfileEditScreen> {
  final _form = GlobalKey<FormState>();
  late final _name = TextEditingController(text: widget.fullName);
  late final _email = TextEditingController(text: widget.email ?? '');
  final _subject = TextEditingController();
  late final List<String>? _subjects = widget.teachingSubjects == null ? null : [...widget.teachingSubjects!];
  late ImageProvider? _photo = widget.photo;
  bool _saving = false;
  bool _uploading = false;
  String? _error;

  static final _emailPattern = RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$');

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    _subject.dispose();
    super.dispose();
  }

  Future<void> _changePhoto() async {
    final s = KxStrings.of(context);
    final choice = await showModalBottomSheet<Object>(
      context: context,
      showDragHandle: true,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              key: const Key('photoCamera'),
              leading: const Icon(Icons.photo_camera_outlined),
              title: Text(s.takePhoto),
              onTap: () => Navigator.pop(ctx, KxPhotoSource.camera),
            ),
            ListTile(
              key: const Key('photoGallery'),
              leading: const Icon(Icons.photo_library_outlined),
              title: Text(s.chooseFromGallery),
              onTap: () => Navigator.pop(ctx, KxPhotoSource.gallery),
            ),
            if (_photo != null && widget.onRemovePhoto != null)
              ListTile(
                key: const Key('photoRemove'),
                leading: Icon(Icons.delete_outline, color: Theme.of(ctx).colorScheme.error),
                title: Text(s.removePhoto),
                onTap: () => Navigator.pop(ctx, 'remove'),
              ),
          ],
        ),
      ),
    );
    if (choice == null || !mounted) return;
    final messenger = ScaffoldMessenger.of(context);
    setState(() {
      _uploading = true;
      _error = null;
    });
    try {
      if (choice == 'remove') {
        await widget.onRemovePhoto!();
        if (mounted) setState(() => _photo = null);
        return;
      }
      final picked = await widget.pickImage(choice as KxPhotoSource);
      if (picked == null) return;
      final jpeg = await widget.processPhoto(picked);
      if (jpeg == null) {
        if (mounted) setState(() => _error = s.photoUnusable);
        return;
      }
      await widget.onPhoto(jpeg);
      if (mounted) setState(() => _photo = MemoryImage(jpeg));
      messenger.showSnackBar(SnackBar(content: Text(s.photoSaved)));
    } catch (e) {
      if (mounted) setState(() => _error = widget.describeError(e));
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  void _addSubject() {
    final v = _subject.text.trim();
    if (v.isEmpty || _subjects == null) return;
    setState(() {
      if (!_subjects.any((x) => x.toLowerCase() == v.toLowerCase()) && _subjects.length < 12) _subjects.add(v);
      _subject.clear();
    });
  }

  Future<void> _save() async {
    if (!_form.currentState!.validate()) return;
    _addSubject();
    setState(() {
      _saving = true;
      _error = null;
    });
    final s = KxStrings.of(context);
    final messenger = ScaffoldMessenger.of(context);
    final nav = Navigator.of(context);
    try {
      final email = _email.text.trim();
      await widget.onSave(fullName: _name.text.trim(), email: email.isEmpty ? null : email, teachingSubjects: _subjects);
      messenger.showSnackBar(SnackBar(content: Text(s.profileSaved)));
      if (nav.canPop()) nav.pop(true);
    } catch (e) {
      if (mounted) setState(() => _error = widget.describeError(e));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = KxStrings.of(context);
    final c = context.colors;
    return Scaffold(
      appBar: AppBar(
        leading: const CloseButton(),
        title: Text(s.editProfile),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: Kx.s12),
            child: FilledButton(
              key: const Key('saveProfile'),
              onPressed: _saving || _uploading ? null : _save,
              child: _saving ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2)) : Text(s.save),
            ),
          ),
        ],
      ),
      body: Form(
        key: _form,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s16, Kx.s16, Kx.s32),
          children: [
            Center(
              child: Stack(
                children: [
                  InkWell(
                    key: const Key('changePhoto'),
                    customBorder: const CircleBorder(),
                    onTap: _uploading ? null : _changePhoto,
                    child: KxAvatar(name: _name.text.isEmpty ? widget.fullName : _name.text, image: _photo, size: 112),
                  ),
                  Positioned(
                    right: 0,
                    bottom: 0,
                    child: CircleAvatar(
                      radius: 18,
                      backgroundColor: c.primary,
                      child: _uploading
                          ? SizedBox.square(dimension: 16, child: CircularProgressIndicator(strokeWidth: 2, color: c.onPrimary))
                          : Icon(Icons.photo_camera_outlined, size: 18, color: c.onPrimary),
                    ),
                  ),
                ],
              ),
            ),
            Center(
              child: TextButton(onPressed: _uploading ? null : _changePhoto, child: Text(s.changePhoto)),
            ),
            if (_error != null)
              Padding(
                padding: const EdgeInsets.only(bottom: Kx.s12),
                child: Container(
                  key: const Key('profileError'),
                  padding: const EdgeInsets.all(Kx.s12),
                  decoration: BoxDecoration(color: c.errorContainer, borderRadius: Kx.radiusMd),
                  child: Text(_error!, style: TextStyle(color: c.onErrorContainer)),
                ),
              ),
            TextFormField(
              key: const Key('nameField'),
              controller: _name,
              textCapitalization: TextCapitalization.words,
              maxLength: 100,
              decoration: InputDecoration(labelText: s.fullName, prefixIcon: const Icon(Icons.person_outline)),
              validator: (v) => (v ?? '').trim().length < 2 ? s.nameRequired : null,
              onChanged: (_) => setState(() {}),
            ),
            const SizedBox(height: Kx.s8),
            TextFormField(
              key: const Key('emailField'),
              controller: _email,
              keyboardType: TextInputType.emailAddress,
              autocorrect: false,
              decoration: InputDecoration(labelText: s.email, prefixIcon: const Icon(Icons.mail_outline)),
              validator: (v) {
                final t = (v ?? '').trim();
                return t.isEmpty || _emailPattern.hasMatch(t) ? null : s.emailInvalid;
              },
            ),
            const SizedBox(height: Kx.s16),
            InputDecorator(
              key: const Key('phoneField'),
              decoration: InputDecoration(
                labelText: s.phone,
                prefixIcon: const Icon(Icons.phone_outlined),
                suffixIcon: const Icon(Icons.lock_outline),
                helperText: s.phoneReadOnly,
                helperMaxLines: 3,
                enabled: false,
              ),
              child: Text(widget.phone ?? s.noPhone, style: context.text.bodyLarge?.copyWith(color: c.onSurfaceVariant)),
            ),
            if (_subjects != null) ...[
              const SizedBox(height: Kx.s24),
              Text(s.subjectsYouTeach, style: context.text.titleSmall),
              const SizedBox(height: Kx.s8),
              Wrap(
                spacing: Kx.s8,
                runSpacing: Kx.s8,
                children: [
                  for (final x in _subjects)
                    InputChip(
                      label: Text(x),
                      onDeleted: () => setState(() => _subjects.remove(x)),
                      deleteButtonTooltipMessage: s.removeSubject(x),
                    ),
                ],
              ),
              const SizedBox(height: Kx.s8),
              TextField(
                key: const Key('subjectField'),
                controller: _subject,
                maxLength: 60,
                textCapitalization: TextCapitalization.words,
                onSubmitted: (_) => _addSubject(),
                decoration: InputDecoration(
                  labelText: s.addSubject,
                  prefixIcon: const Icon(Icons.menu_book_outlined),
                  suffixIcon: IconButton(key: const Key('addSubject'), icon: const Icon(Icons.add), tooltip: s.addSubject, onPressed: _addSubject),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

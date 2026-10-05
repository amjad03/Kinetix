import 'dart:async';
import 'dart:math';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/l10n.dart';
import '../../core/models.dart';
import '../../demo/demo.dart';
import 'remote_link.dart';

/// The link the remote screen uses: the demo board in demo builds, the server otherwise.
RemoteLink Function(TeacherApi api) remoteLinkFor = (api) => Demo.enabled ? DemoRemoteLink() : SocketRemoteLink(baseUrl: api.baseUrl, token: api.token ?? '');

/// Where a photo for the board comes from (camera); tests replace it.
Future<Uint8List?> Function() pickRemotePhoto = () async {
  final x = await ImagePicker().pickImage(source: ImageSource.camera, maxWidth: 2000, maxHeight: 2000, imageQuality: 85);
  return x?.readAsBytes();
};

String _newId() {
  final r = Random.secure();
  final b = List<int>.generate(16, (_) => r.nextInt(256));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  final h = b.map((x) => x.toRadixString(16).padLeft(2, '0')).join();
  return '${h.substring(0, 8)}-${h.substring(8, 12)}-${h.substring(12, 16)}-${h.substring(16, 20)}-${h.substring(20)}';
}

/// The phone remote: the teacher drives the board they are teaching on from their phone (pages,
/// slides, timer, random pick, a pointer, a photo from the phone, recording). Works only while
/// their class is open on that board; the server refuses anyone else.
class RemoteScreen extends StatefulWidget {
  const RemoteScreen({super.key, required this.api, required this.connection});

  final TeacherApi api;
  final BoardConnection connection;

  @override
  State<RemoteScreen> createState() => _RemoteScreenState();
}

class _RemoteScreenState extends State<RemoteScreen> {
  late final RemoteLink _link = remoteLinkFor(widget.api);
  StreamSubscription<RemoteBoardState>? _sub;
  RemoteBoardState _state = const RemoteBoardState();
  bool _attached = false;
  String? _error;
  bool _sendingPhoto = false;
  DateTime _lastPointer = DateTime(0);

  @override
  void initState() {
    super.initState();
    _sub = _link.state.listen((s) {
      if (mounted) setState(() => _state = s);
    });
    unawaited(_attach());
  }

  Future<void> _attach() async {
    final id = widget.connection.boardId;
    final error = id == null ? 'Unknown board' : await _link.attach(id);
    if (mounted) setState(() => (_attached = error == null, _error = error));
  }

  Future<void> _send(Map<String, Object?> c) async {
    final ok = await _link.send(c);
    if (!ok && mounted) setState(() => (_attached = false, _error = context.l10n.remoteEnded));
  }

  void _point(Offset local, Size size) {
    final now = DateTime.now();
    if (now.difference(_lastPointer) < const Duration(milliseconds: 50)) return;
    _lastPointer = now;
    unawaited(_send({'type': 'pointer', 'x': (local.dx / size.width).clamp(0.0, 1.0), 'y': (local.dy / size.height).clamp(0.0, 1.0)}));
  }

  Future<void> _photo() async {
    final l = context.l10n;
    final messenger = ScaffoldMessenger.of(context);
    final bytes = await pickRemotePhoto();
    if (bytes == null) return;
    setState(() => _sendingPhoto = true);
    try {
      await _link.sendPhoto(widget.connection.boardId!, _newId(), bytes);
      messenger.showSnackBar(SnackBar(content: Text(l.remotePhotoSent)));
    } catch (_) {
      messenger.showSnackBar(SnackBar(content: Text(l.remotePhotoFailed)));
    } finally {
      if (mounted) setState(() => _sendingPhoto = false);
    }
  }

  @override
  void dispose() {
    unawaited(_sub?.cancel());
    _link.close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final c = context.colors;
    final s = _state;
    Widget section(String title, List<Widget> children) => Card(
      child: Padding(
        padding: const EdgeInsets.all(Kx.s12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(title, style: context.text.titleSmall),
            const SizedBox(height: Kx.s8),
            ...children,
          ],
        ),
      ),
    );
    return Scaffold(
      appBar: AppBar(title: Text(l.remoteTitle(widget.connection.boardName))),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(Kx.s16),
          children: [
            if (_error != null)
              Card(
                color: c.errorContainer,
                child: ListTile(
                  key: const Key('remoteError'),
                  leading: Icon(Icons.link_off, color: c.onErrorContainer),
                  title: Text(_error!, style: TextStyle(color: c.onErrorContainer)),
                  trailing: TextButton(onPressed: _attach, child: Text(l.retry)),
                ),
              )
            else if (!_attached)
              const LinearProgressIndicator(),
            section(l.remotePages, [
              Row(
                children: [
                  IconButton.filledTonal(key: const Key('remotePrevPage'), tooltip: l.remotePrevious, onPressed: _attached ? () => _send({'type': 'page.previous'}) : null, icon: const Icon(Icons.chevron_left)),
                  Expanded(child: Text(l.remotePageOf(s.page + 1, s.pages), key: const Key('remotePage'), textAlign: TextAlign.center, style: context.text.titleMedium)),
                  IconButton.filled(key: const Key('remoteNextPage'), tooltip: l.remoteNext, onPressed: _attached ? () => _send({'type': 'page.next'}) : null, icon: const Icon(Icons.chevron_right)),
                ],
              ),
            ]),
            section(l.remoteSlides, [
              if (s.slide == null)
                Text(l.remoteNoSlides, style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant))
              else
                Row(
                  children: [
                    IconButton.filledTonal(key: const Key('remotePrevSlide'), tooltip: l.remotePrevious, onPressed: _attached ? () => _send({'type': 'slide.previous'}) : null, icon: const Icon(Icons.skip_previous)),
                    Expanded(child: Text(l.remoteSlideOf(s.slide! + 1, s.slides), key: const Key('remoteSlide'), textAlign: TextAlign.center, style: context.text.titleMedium)),
                    IconButton.filled(key: const Key('remoteNextSlide'), tooltip: l.remoteNext, onPressed: _attached ? () => _send({'type': 'slide.next'}) : null, icon: const Icon(Icons.skip_next)),
                  ],
                ),
            ]),
            section(l.remotePointer, [
              LayoutBuilder(
                builder: (context, box) {
                  final size = Size(box.maxWidth, box.maxWidth * 9 / 16);
                  return GestureDetector(
                    key: const Key('remotePointerPad'),
                    onPanStart: _attached ? (d) => _point(d.localPosition, size) : null,
                    onPanUpdate: _attached ? (d) => _point(d.localPosition, size) : null,
                    onPanEnd: _attached ? (_) => _send({'type': 'pointer.hide'}) : null,
                    child: Container(
                      width: size.width,
                      height: size.height,
                      decoration: BoxDecoration(color: c.surfaceContainerHighest, borderRadius: BorderRadius.circular(Kx.rLg)),
                      alignment: Alignment.center,
                      child: Text(l.remotePointerHint, textAlign: TextAlign.center, style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant)),
                    ),
                  );
                },
              ),
            ]),
            section(l.remoteClassroom, [
              Wrap(
                spacing: Kx.s8,
                runSpacing: Kx.s8,
                children: [
                  for (final m in [1, 2, 5])
                    ActionChip(
                      key: Key('remoteTimer$m'),
                      avatar: const Icon(Icons.timer_outlined, size: 18),
                      label: Text(l.remoteTimerMinutes(m)),
                      onPressed: _attached ? () => _send({'type': 'timer.start', 'seconds': m * 60}) : null,
                    ),
                  if (s.timerRunning)
                    ActionChip(key: const Key('remoteTimerStop'), avatar: const Icon(Icons.timer_off_outlined, size: 18), label: Text(l.remoteTimerStop), onPressed: () => _send({'type': 'timer.stop'})),
                  ActionChip(
                    key: const Key('remotePick'),
                    avatar: const Icon(Icons.casino_outlined, size: 18),
                    label: Text(l.remotePickStudent),
                    onPressed: _attached ? () => _send({'type': 'picker.pick'}) : null,
                  ),
                ],
              ),
            ]),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    key: const Key('remotePhoto'),
                    onPressed: _attached && !_sendingPhoto ? _photo : null,
                    icon: _sendingPhoto ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.add_photo_alternate_outlined),
                    label: Text(l.remoteShowPhoto),
                  ),
                ),
                const SizedBox(width: Kx.s12),
                Expanded(
                  child: FilledButton.icon(
                    key: const Key('remoteRecord'),
                    style: s.recording ? FilledButton.styleFrom(backgroundColor: c.error, foregroundColor: c.onError) : null,
                    onPressed: _attached ? () => _send({'type': s.recording ? 'recording.stop' : 'recording.start'}) : null,
                    icon: Icon(s.recording ? Icons.stop_circle_outlined : Icons.fiber_manual_record),
                    label: Text(s.recording ? l.remoteStopRecording : l.remoteStartRecording),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

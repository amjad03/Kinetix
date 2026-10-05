import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:kinetix_ink/kinetix_ink.dart';

import '../../core/board_controller.dart';
import '../../core/realtime.dart';
import 'board_toolkit.dart';

/// What the remote can do to the board besides pages and the toolkit (the board screen's hooks).
class RemoteHooks {
  const RemoteHooks({required this.recording, required this.startRecording, required this.stopRecording, required this.showPhoto, required this.onAttached});

  final bool Function() recording;
  final Future<void> Function() startRecording;
  final Future<void> Function() stopRecording;

  /// Puts a photo from the phone on the page.
  final void Function(Uint8List bytes) showPhoto;

  /// A phone has just attached (to tell the class it is being driven from a phone).
  final VoidCallback onAttached;
}

/// The board side of the phone remote. The teacher's phone (Teacher App) sends commands through
/// the server, which only lets the teacher whose class is open on this board send them; this
/// carries them out and sends the board's state (page, recording, timer, slide) back.
class BoardRemote {
  BoardRemote({required this.board, required this.wb, required this.toolkit, required this.hooks}) {
    _sub = board.classEvents.stream.listen((e) {
      if (e.$1 == RealtimeEvents.remoteCommand) unawaited(handle(e.$2));
    });
    wb.addListener(_maybeSendState);
  }

  final BoardController board;
  final WhiteboardController wb;
  final BoardToolkit toolkit;
  final RemoteHooks hooks;
  StreamSubscription<(String, Map<String, dynamic>)>? _sub;

  /// The teacher's pointer on the board, as fractions of its size (null = hidden).
  final pointer = ValueNotifier<Offset?>(null);
  Timer? _pointerTimeout;

  /// A phone said hello in this class: from then on the board keeps it up to date.
  bool attached = false;
  Map<String, dynamic>? _lastState;

  Map<String, dynamic> get state {
    final slide = toolkit.slide;
    return {
      'page': wb.pageIndex,
      'pages': wb.pageCount,
      'recording': hooks.recording(),
      'timerRunning': toolkit.timerRunning,
      'slide': slide == null ? null : {'index': slide.index, 'count': slide.count},
    };
  }

  void _maybeSendState() {
    if (!attached) return;
    final s = state;
    if (mapEquals(s, _lastState) && mapEquals(s['slide'] as Map?, _lastState?['slide'] as Map?)) return;
    _lastState = s;
    board.sendRemoteState(s);
  }

  /// Sends the state now (after a command, or when the timer or recording changes).
  void sendState() {
    if (!attached) return;
    _lastState = null;
    _maybeSendState();
  }

  @visibleForTesting
  Future<void> handle(Map<String, dynamic> c) async {
    switch (c['type']) {
      case 'hello':
        attached = true;
        hooks.onAttached();
      case 'page.next':
        wb.hasNext ? wb.next() : wb.addPage();
      case 'page.previous':
        wb.previous();
      case 'page.add':
        wb.addPage();
      case 'slide.next':
        toolkit.nextSlide();
      case 'slide.previous':
        toolkit.previousSlide();
      case 'timer.start':
        toolkit.startTimer(Duration(seconds: (c['seconds'] as num?)?.toInt() ?? 60));
      case 'timer.stop':
        toolkit.stopTimer();
      case 'picker.pick':
        toolkit.pickStudent();
      case 'pointer':
        pointer.value = Offset((c['x'] as num).toDouble(), (c['y'] as num).toDouble());
        _pointerTimeout?.cancel();
        _pointerTimeout = Timer(const Duration(seconds: 3), () => pointer.value = null);
      case 'pointer.hide':
        pointer.value = null;
      case 'recording.start':
        if (!hooks.recording()) await hooks.startRecording();
      case 'recording.stop':
        if (hooks.recording()) await hooks.stopRecording();
      case 'photo.show':
        final api = board.api;
        if (api == null) return;
        hooks.showPhoto(await api.remotePhoto(c['photoId'] as String));
    }
    sendState();
  }

  void dispose() {
    unawaited(_sub?.cancel());
    wb.removeListener(_maybeSendState);
    _pointerTimeout?.cancel();
    pointer.dispose();
  }
}

/// The phone's pointer: a red dot where the teacher points, over the whole board.
class RemotePointer extends StatelessWidget {
  const RemotePointer({super.key, required this.remote});

  final BoardRemote remote;

  @override
  Widget build(BuildContext context) => IgnorePointer(
    child: ValueListenableBuilder<Offset?>(
      valueListenable: remote.pointer,
      builder: (context, p, _) => p == null
          ? const SizedBox.shrink()
          : LayoutBuilder(
              builder: (context, size) => Stack(
                children: [
                  Positioned(
                    key: const Key('remote-pointer'),
                    left: p.dx * size.maxWidth - 14,
                    top: p.dy * size.maxHeight - 14,
                    child: Container(
                      width: 28,
                      height: 28,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: const Color(0xCCFF1744),
                        boxShadow: const [BoxShadow(color: Color(0x88FF1744), blurRadius: 16, spreadRadius: 4)],
                      ),
                    ),
                  ),
                ],
              ),
            ),
    ),
  );
}

import 'dart:async';
import 'dart:io' show Platform;
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:kinetix_cards/kinetix_cards.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../l10n/l10n.dart';
import '../board/chrome.dart';
import 'class_poll.dart';

/// Where photos of the class come from: the board's camera (Android panels), or a photo file
/// on Windows panels without one. Tests and the demo replace it.
Future<Uint8List?> Function() pickClassPhoto = () async {
  final camera = !kIsWeb && Platform.isAndroid;
  final x = await ImagePicker().pickImage(
    source: camera ? ImageSource.camera : ImageSource.gallery,
    maxWidth: 3200,
    maxHeight: 3200,
    imageQuality: 92,
    preferredCameraDevice: CameraDevice.rear,
  );
  return x?.readAsBytes();
};

/// Reads the answer cards in a photo; decoding runs in an isolate. Tests replace it.
Future<List<CardSeen>> Function(Uint8List photo) readClassPhoto = (photo) async => readCardsInPhoto(await greyFromPhoto(photo));

/// The floating panel while the class answers: the live bar chart, how many have answered,
/// scanning answer cards, ending the question and putting the results on the board.
class ClassCheckPanel extends StatefulWidget {
  const ClassCheckPanel({super.key, required this.poll, required this.onDismiss, required this.onPutOnBoard});

  final ClassPoll poll;
  final VoidCallback onDismiss;

  /// The results as a picture (PNG) for the page.
  final void Function(Uint8List png) onPutOnBoard;

  @override
  State<ClassCheckPanel> createState() => _ClassCheckPanelState();
}

class _ClassCheckPanelState extends State<ClassCheckPanel> {
  bool _scanning = false;
  bool _reveal = false;

  ClassPoll get poll => widget.poll;

  Future<void> _scan() async {
    final l = context.l10n;
    setState(() => _scanning = true);
    try {
      final photo = await pickClassPhoto();
      if (photo == null || !mounted) return;
      final seen = await readClassPhoto(photo);
      if (!mounted) return;
      if (seen.isEmpty) {
        showBoardMessage(context, l.pollNoCards);
        return;
      }
      final scan = await poll.addCards(seen);
      if (!mounted) return;
      showBoardMessage(context, scan.unknown.isEmpty ? l.pollCardsRead(scan.read) : '${l.pollCardsRead(scan.read)} ${l.pollUnknownCards(scan.unknown.join(', '))}');
    } catch (e) {
      if (mounted) showBoardMessage(context, l.pollScanFailed);
    } finally {
      if (mounted) setState(() => _scanning = false);
    }
  }

  Future<void> _putOnBoard() async {
    final l = context.l10n;
    final png = await pollResultsPng(poll, answered: l.pollAnswered(poll.answers.length, poll.classSize), reveal: _reveal);
    widget.onPutOnBoard(png);
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final c = context.colors;
    return ListenableBuilder(
      listenable: poll,
      builder: (context, _) => ChromeSurface(
        radius: Kx.rXl,
        padding: const EdgeInsets.fromLTRB(Kx.s20, Kx.s8, Kx.s8, Kx.s16),
        child: SizedBox(
          width: 400,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  Icon(Icons.how_to_vote_outlined, color: c.onSurfaceVariant, size: 20),
                  const SizedBox(width: Kx.s8),
                  Expanded(child: Text(poll.open ? l.toolAskClass : l.pollEnded, style: context.text.titleSmall)),
                  IconButton(key: const Key('poll-dismiss'), tooltip: l.close, onPressed: widget.onDismiss, icon: const Icon(Icons.close)),
                ],
              ),
              Text(poll.question, style: context.text.titleMedium, maxLines: 3, overflow: TextOverflow.ellipsis),
              const SizedBox(height: Kx.s4),
              Text(
                l.pollAnswered(poll.answers.length, poll.classSize),
                key: const Key('poll-count'),
                style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant),
              ),
              if (poll.saved && poll.open) Text(l.pollLiveInApp, style: context.text.bodySmall?.copyWith(color: c.primary)),
              if (!poll.saved) Text(l.pollNotSaved, style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant)),
              const SizedBox(height: Kx.s12),
              Padding(padding: const EdgeInsets.only(right: Kx.s12), child: PollBars(poll: poll, reveal: _reveal)),
              const SizedBox(height: Kx.s12),
              Wrap(
                spacing: Kx.s8,
                runSpacing: Kx.s8,
                children: [
                  if (poll.open && poll.kind == PollKind.mcq)
                    FilledButton.tonalIcon(
                      key: const Key('poll-scan'),
                      onPressed: _scanning ? null : _scan,
                      icon: _scanning ? const SizedBox.square(dimension: 16, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.photo_camera_outlined),
                      label: Text(l.pollScanCards),
                    ),
                  if (poll.correct != null)
                    FilterChip(key: const Key('poll-reveal'), label: Text(l.pollShowAnswer), selected: _reveal, onSelected: (v) => setState(() => _reveal = v)),
                  if (poll.open)
                    FilledButton.icon(key: const Key('poll-end'), onPressed: () => unawaited(poll.close()), icon: const Icon(Icons.stop_circle_outlined), label: Text(l.pollEnd))
                  else
                    FilledButton.icon(key: const Key('poll-put'), onPressed: _putOnBoard, icon: const Icon(Icons.add_chart), label: Text(l.pollPutOnBoard)),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// The live bar chart: one bar per answer, the right one marked once revealed.
class PollBars extends StatelessWidget {
  const PollBars({super.key, required this.poll, this.reveal = false});

  final ClassPoll poll;
  final bool reveal;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final tally = poll.tally;
    final most = tally.fold<int>(1, (m, e) => math.max(m, e.$2));
    if (tally.isEmpty) return Text(context.l10n.pollNoAnswersYet, style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant));
    return Column(
      children: [
        for (final (answer, n) in tally.take(8))
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 3),
            child: Row(
              children: [
                SizedBox(width: 64, child: Text(poll.label(answer), style: context.text.titleSmall, overflow: TextOverflow.ellipsis)),
                Expanded(
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(6),
                    child: LinearProgressIndicator(
                      key: Key('poll-bar-$answer'),
                      value: n / most,
                      minHeight: 22,
                      backgroundColor: c.surfaceContainerHighest,
                      color: reveal && poll.isRight(answer) == true ? Colors.green.shade600 : c.primary,
                    ),
                  ),
                ),
                SizedBox(width: 40, child: Text('$n', textAlign: TextAlign.end, style: context.text.titleSmall)),
              ],
            ),
          ),
      ],
    );
  }
}

/// The results as a picture for the board: the question, the bars and how many answered.
Future<Uint8List> pollResultsPng(ClassPoll poll, {required String answered, bool reveal = false}) async {
  const w = 640.0, rowH = 44.0, top = 96.0;
  final tally = poll.tally.take(8).toList();
  final h = top + tally.length * rowH + 24;
  final rec = ui.PictureRecorder();
  final canvas = Canvas(rec);
  canvas.drawRRect(RRect.fromRectAndRadius(Rect.fromLTWH(0, 0, w, h), const Radius.circular(16)), Paint()..color = Colors.white);
  void text(String s, Offset at, double size, {Color color = const Color(0xFF202124), FontWeight weight = FontWeight.w500, double maxWidth = w - 48}) {
    final tp = TextPainter(
      text: TextSpan(text: s, style: TextStyle(fontSize: size, color: color, fontWeight: weight)),
      textDirection: TextDirection.ltr,
      maxLines: 1,
      ellipsis: '…',
    )..layout(maxWidth: maxWidth);
    tp.paint(canvas, at);
  }

  text(poll.question, const Offset(24, 18), 26, weight: FontWeight.w600);
  text(answered, const Offset(24, 58), 18, color: const Color(0xFF5F6368));
  final most = tally.fold<int>(1, (m, e) => math.max(m, e.$2));
  for (final (i, (answer, n)) in tally.indexed) {
    final y = top + i * rowH;
    text(poll.label(answer), Offset(24, y + 6), 20, maxWidth: 90);
    const barX = 120.0, barW = w - 120 - 80;
    canvas.drawRRect(RRect.fromRectAndRadius(Rect.fromLTWH(barX, y + 6, barW, 28), const Radius.circular(6)), Paint()..color = const Color(0xFFE8EAED));
    final right = reveal && poll.isRight(answer) == true;
    canvas.drawRRect(
      RRect.fromRectAndRadius(Rect.fromLTWH(barX, y + 6, barW * n / most, 28), const Radius.circular(6)),
      Paint()..color = right ? const Color(0xFF1E8E3E) : const Color(0xFF1A73E8),
    );
    text('$n', Offset(w - 64, y + 6), 20, weight: FontWeight.w600, maxWidth: 48);
  }
  final img = await rec.endRecording().toImage(w.toInt(), h.ceil());
  final data = await img.toByteData(format: ui.ImageByteFormat.png);
  return data!.buffer.asUint8List();
}

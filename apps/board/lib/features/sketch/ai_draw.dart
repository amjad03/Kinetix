import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/handwriting/cloud_handwriting.dart' show inkPng;
import '../../core/models.dart' show AiDrawing;
import '../../l10n/l10n.dart';
import '../board/chrome.dart';
import '../board/panel/panel_host.dart' show showPanelDialog;
import '../insert/insert_actions.dart' show placePicture;
import 'ink_assets_board.dart' show fitInto;

/// AI draw: a sketch (the selected ink) and/or a prompt become a clean diagram, drawn by the
/// board's AI as SVG (checked and cleaned on the server), put on the board as a picture.

/// Asks the board's AI for a drawing.
typedef AiDrawRequest = Future<AiDrawing> Function({String? prompt, String? pngBase64});

/// [svg] drawn as a PNG no larger than [maxSide] pixels across, and its size; null when it
/// cannot be read.
Future<(Uint8List, Size)?> svgToPng(String svg, {double maxSide = 1200}) async {
  try {
    final info = await vg.loadPicture(SvgStringLoader(svg), null);
    final src = info.size;
    if (src.isEmpty) {
      info.picture.dispose();
      return null;
    }
    final s = maxSide / math.max(src.width, src.height);
    final w = math.max(1, (src.width * s).round()), h = math.max(1, (src.height * s).round());
    final rec = ui.PictureRecorder();
    Canvas(rec)
      ..scale(s)
      ..drawPicture(info.picture);
    info.picture.dispose();
    final img = await rec.endRecording().toImage(w, h);
    try {
      final data = await img.toByteData(format: ui.ImageByteFormat.png);
      return (data!.buffer.asUint8List(), Size(w.toDouble(), h.toDouble()));
    } finally {
      img.dispose();
    }
  } catch (e) {
    debugPrint('AI draw SVG: $e');
    return null;
  }
}

/// Puts [drawing] on [wb]: in the place of [ink] (the sketch it was drawn from, one undo step),
/// else in the middle of the view. False when the SVG could not be drawn.
Future<bool> placeAiDrawing(WhiteboardController wb, AiDrawing drawing, {List<Stroke> ink = const [], Future<(Uint8List, Size)?> Function(String svg) render = svgToPng}) async {
  final pic = await render(drawing.svg);
  if (pic == null) return false;
  final (bytes, size) = pic;
  final live = {for (final e in wb.page.elements) e.id};
  final sketch = [for (final s in ink) if (live.contains(s.id)) s];
  if (sketch.isNotEmpty) {
    final ids = {for (final s in sketch) s.id};
    final el = ImageElement(id: newElementId(), rect: fitInto(contentBounds(sketch), size, min: 240), bytes: bytes);
    wb.setElements([for (final e in wb.page.elements) if (!ids.contains(e.id)) e, el]);
    return true;
  }
  placePicture(wb, bytes, size, maxWidth: 640);
  return true;
}

/// The AI draw dialog: a prompt, the selected ink as the sketch, Draw. Closes with the drawing.
class AiDrawDialog extends StatefulWidget {
  const AiDrawDialog({super.key, required this.request, this.ink = const [], this.png = inkPng});

  final AiDrawRequest request;

  /// The selected ink, sent as the sketch.
  final List<Stroke> ink;
  final Future<Uint8List> Function(List<Stroke> ink) png;

  /// Opens the dialog; the drawing, or null when closed or it failed (after saying so).
  static Future<AiDrawing?> show(BuildContext context, {required AiDrawRequest request, List<Stroke> ink = const []}) => showPanelDialog<AiDrawing>(
    context: context,
    builder: (_) => BoardChromeTheme(child: AiDrawDialog(request: request, ink: ink)),
  );

  @override
  State<AiDrawDialog> createState() => _AiDrawDialogState();
}

class _AiDrawDialogState extends State<AiDrawDialog> {
  final _prompt = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _prompt.dispose();
    super.dispose();
  }

  bool get _ready => !_busy && (_prompt.text.trim().isNotEmpty || widget.ink.isNotEmpty);

  Future<void> _draw() async {
    if (!_ready) return;
    final l = context.l10n;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final png = widget.ink.isEmpty ? null : base64Encode(await widget.png(widget.ink));
      final prompt = _prompt.text.trim();
      final d = await widget.request(prompt: prompt.isEmpty ? null : prompt, pngBase64: png);
      if (mounted) Navigator.of(context).pop(d);
    } catch (e) {
      debugPrint('AI draw: $e');
      if (mounted) setState(() => _error = l.aiDrawFailed);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return AlertDialog(
      key: const Key('ai-draw'),
      title: Row(children: [Icon(Icons.draw_outlined, color: context.colors.tertiary), const SizedBox(width: Kx.s8), Text(l.aiDrawTitle)]),
      content: SizedBox(
        width: 460,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(l.aiDrawHint, style: context.text.bodySmall),
            const SizedBox(height: Kx.s12),
            TextField(
              key: const Key('ai-draw-prompt'),
              controller: _prompt,
              autofocus: true,
              maxLength: 500,
              decoration: InputDecoration(labelText: l.aiDrawPrompt),
              onChanged: (_) => setState(() {}),
              onSubmitted: (_) => unawaited(_draw()),
            ),
            if (widget.ink.isNotEmpty)
              Row(children: [const Icon(Icons.gesture, size: 18), const SizedBox(width: Kx.s4), Expanded(child: Text(l.aiDrawFromInk, style: context.text.bodySmall))]),
            if (_error != null) ...[const SizedBox(height: Kx.s8), Text(_error!, key: const Key('ai-draw-error'), style: TextStyle(color: context.colors.error))],
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: _busy ? null : () => Navigator.of(context).pop(), child: Text(l.close)),
        FilledButton.icon(
          key: const Key('ai-draw-go'),
          onPressed: _ready ? () => unawaited(_draw()) : null,
          icon: _busy ? const SizedBox.square(dimension: 16, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.auto_awesome, size: 18),
          label: Text(l.aiDrawGo),
        ),
      ],
    );
  }
}

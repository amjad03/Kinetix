import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:kinetix_3d/kinetix_3d.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../board/phone_chrome.dart';
import 'search_strings.dart';
import '../board/panel/panel_host.dart';

/// 3D solids for the Shapes popover: the solids of kinetix_3d (drawn by its pure-Dart
/// renderer, so they work everywhere and offline), turned round with a finger, with their
/// sizes and measurements, and put on the board as a picture that opens them again.

/// The solids in the order a class meets them.
const boardSolids = [
  SolidKind.cube,
  SolidKind.cuboid,
  SolidKind.cylinder,
  SolidKind.cone,
  SolidKind.sphere,
  SolidKind.hemisphere,
  SolidKind.triangularPrism,
  SolidKind.squarePyramid,
  SolidKind.frustum,
  SolidKind.tetrahedron,
];

/// How the board draws solids outside the viewer: dark ink, light labels that read on any
/// board background.
RenderStyle solidStyle({Color foreground = const Color(0xFF1F1F1F), double labelScale = 1}) => RenderStyle(
  foreground: foreground,
  labelBackground: const Color(0xFFF1F3F4),
  labelForeground: const Color(0xFF1F1F1F),
  accent: const Color(0xFFFFB300),
  onAccent: const Color(0xFF231A00),
  measure: const Color(0xFFC25E00),
  textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
  labelScale: labelScale,
);

/// A picture of [kind] (its default sizes, labelled), seen from [yaw] and [pitch], as PNG.
Future<Uint8List> renderSolidPng(SolidKind kind, {double yaw = -30, double pitch = 20, Size size = const Size(640, 520), bool labels = true, Map<String, double>? dims}) async {
  final model = Solid(kind, dims).toModel(grid: false);
  final renderer = SceneRenderer(model);
  try {
    final recorder = ui.PictureRecorder();
    final canvas = Canvas(recorder, Offset.zero & size);
    renderer.paint(canvas, size, OrbitCamera(yaw: yaw, pitch: pitch), solidStyle(labelScale: 1.1), RenderOptions(labels: labels));
    final picture = recorder.endRecording();
    final image = await picture.toImage(size.width.round(), size.height.round());
    picture.dispose();
    final data = await image.toByteData(format: ui.ImageByteFormat.png);
    image.dispose();
    return Uint8List.view(data!.buffer);
  } finally {
    renderer.dispose();
  }
}

/// A small, unlabelled drawing of a solid (for buttons).
class SolidThumb extends StatefulWidget {
  const SolidThumb(this.kind, {super.key, this.size = 56});
  final SolidKind kind;
  final double size;

  @override
  State<SolidThumb> createState() => _SolidThumbState();
}

class _SolidThumbState extends State<SolidThumb> {
  late SceneRenderer _renderer = SceneRenderer(Solid(widget.kind).toModel(grid: false));

  @override
  void didUpdateWidget(SolidThumb old) {
    super.didUpdateWidget(old);
    if (old.kind != widget.kind) {
      _renderer.dispose();
      _renderer = SceneRenderer(Solid(widget.kind).toModel(grid: false));
    }
  }

  @override
  void dispose() {
    _renderer.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) =>
      CustomPaint(size: Size.square(widget.size), painter: _ThumbPainter(_renderer, widget.kind, context.colors.onSurface));
}

class _ThumbPainter extends CustomPainter {
  _ThumbPainter(this.renderer, this.kind, this.ink);
  final SceneRenderer renderer;
  final SolidKind kind;
  final Color ink;

  @override
  void paint(Canvas canvas, Size size) =>
      renderer.paint(canvas, size, OrbitCamera(yaw: -35, pitch: 22), solidStyle(foreground: ink), const RenderOptions(labels: false));

  @override
  bool shouldRepaint(_ThumbPainter old) => old.kind != kind || old.ink != ink;
}

/// The Shapes popover's 3D page: a button for each solid.
class Solids3dGrid extends StatelessWidget {
  const Solids3dGrid({super.key, required this.onOpen});

  /// Opens a solid (see [Solid3dDialog.open]).
  final ValueChanged<SolidKind> onOpen;

  @override
  Widget build(BuildContext context) {
    final s = SearchStrings.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(s.solidsHint, style: context.text.bodySmall?.copyWith(color: context.colors.onSurfaceVariant)),
        const SizedBox(height: Kx.s12),
        LayoutBuilder(
          builder: (context, box) {
            final perRow = (box.maxWidth / 96).floor().clamp(3, 6);
            final w = (box.maxWidth - (perRow - 1) * Kx.s8) / perRow;
            return Wrap(
              spacing: Kx.s8,
              runSpacing: Kx.s8,
              children: [
                for (final k in boardSolids)
                  SizedBox(
                    width: w,
                    child: Tooltip(
                      message: s.solidName(k.name),
                      child: OutlinedButton(
                        key: Key('solid-${k.name}'),
                        style: OutlinedButton.styleFrom(padding: const EdgeInsets.fromLTRB(4, Kx.s8, 4, Kx.s8), minimumSize: const Size(0, phoneTarget)),
                        onPressed: () => onOpen(k),
                        child: Column(
                          children: [
                            SolidThumb(k, size: 48),
                            const SizedBox(height: 4),
                            Text(s.solidName(k.name), maxLines: 2, textAlign: TextAlign.center, overflow: TextOverflow.ellipsis, style: context.text.labelSmall),
                          ],
                        ),
                      ),
                    ),
                  ),
              ],
            );
          },
        ),
      ],
    );
  }
}

/// A solid to turn round and resize, with its measurements; "Put on board" places a picture
/// of it as it is turned (linked, so a tap on the picture opens it again), "Open in 3D
/// viewer" opens it beside the board.
class Solid3dDialog extends StatefulWidget {
  const Solid3dDialog({super.key, required this.kind, this.onPut, this.onOpenViewer});

  final SolidKind kind;
  final ValueChanged<Model3dSnapshot>? onPut;
  final ValueChanged<String>? onOpenViewer;

  static Future<void> open(BuildContext context, SolidKind kind, {ValueChanged<Model3dSnapshot>? onPut, ValueChanged<String>? onOpenViewer}) {
    // The board's 3D scope places pictures; the dialog sits above it, so take it along.
    final put = onPut ?? Model3dScope.maybeOf(context)?.onSnapshot;
    return showPanelDialog<void>(
      context: context,
      builder: (_) => Solid3dDialog(kind: kind, onPut: put, onOpenViewer: onOpenViewer),
    );
  }

  @override
  State<Solid3dDialog> createState() => _Solid3dDialogState();
}

class _Solid3dDialogState extends State<Solid3dDialog> {
  final _ctrl = ModelViewController(yaw: -35, pitch: 22);
  bool _busy = false;

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  Future<void> _put() async {
    final put = widget.onPut;
    if (put == null || _busy) return;
    setState(() => _busy = true);
    final s = SearchStrings.of(context);
    final png = await renderSolidPng(widget.kind, yaw: _ctrl.camera.yaw, pitch: _ctrl.camera.pitch);
    if (!mounted) return;
    Navigator.of(context).pop();
    put(Model3dSnapshot(png: png, modelId: widget.kind.id, title: s.solidName(widget.kind.name)));
  }

  @override
  Widget build(BuildContext context) {
    final s = SearchStrings.of(context);
    final phone = context.isPhone;
    final title = s.solidName(widget.kind.name);
    final header = Padding(
      padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s8, Kx.s8, Kx.s8),
      child: Row(
        children: [
          SolidThumb(widget.kind, size: 32),
          const SizedBox(width: Kx.s8),
          Expanded(child: Text(title, style: context.text.titleLarge, maxLines: 1, overflow: TextOverflow.ellipsis)),
          if (widget.onPut != null)
            phone
                ? IconButton.filledTonal(key: const Key('solid-put'), tooltip: s.putOnBoard, onPressed: _busy ? null : _put, icon: const Icon(Icons.add_photo_alternate_outlined))
                : FilledButton.tonalIcon(
                    key: const Key('solid-put'),
                    onPressed: _busy ? null : _put,
                    icon: const Icon(Icons.add_photo_alternate_outlined),
                    label: Text(s.putOnBoard),
                  ),
          if (widget.onOpenViewer != null) ...[
            const SizedBox(width: Kx.s4),
            IconButton(
              key: const Key('solid-viewer'),
              tooltip: s.openInViewer,
              onPressed: () {
                Navigator.of(context).pop();
                widget.onOpenViewer!(widget.kind.id);
              },
              icon: const Icon(Icons.open_in_new),
            ),
          ],
          IconButton(key: const Key('solid-close'), tooltip: MaterialLocalizations.of(context).closeButtonTooltip, onPressed: () => Navigator.of(context).pop(), icon: const Icon(Icons.close)),
        ],
      ),
    );
    final body = Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        header,
        const Divider(height: 1),
        Expanded(child: SolidExplorer(kind: widget.kind, controller: _ctrl)),
      ],
    );
    if (phone) return Dialog.fullscreen(key: const Key('solid-dialog'), child: SafeArea(child: body));
    return Dialog(
      key: const Key('solid-dialog'),
      clipBehavior: Clip.antiAlias,
      child: ConstrainedBox(constraints: const BoxConstraints(maxWidth: 1100, maxHeight: 720), child: body),
    );
  }
}

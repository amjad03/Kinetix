import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/board_controller.dart';
import '../../l10n/l10n.dart';
import '../board/ai_pen_models.dart';
import '../board/chrome.dart';
import '../board/panel/panel_host.dart' show showPanelDialog;
import 'ink_asset_index.dart';
import 'sketch_icons.dart';
import 'sketch_suggest.dart';

/// Over the board: the "Did you mean" bar above (or below) a sketch, with clean icons for it and
/// a close button; or, before the sketch model is on the device, a button to download it.
class SketchSuggestOverlay extends StatelessWidget {
  const SketchSuggestOverlay({super.key, required this.wb, required this.sketch, this.onDownload});

  final WhiteboardController wb;
  final SketchSuggestController sketch;

  /// Downloads the sketch model (offered when the bar says it is missing).
  final VoidCallback? onDownload;

  static const _barHeight = 64.0;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: Listenable.merge([sketch, wb.view]),
      builder: (context, _) {
        final s = sketch.suggestion;
        if (s == null || (s.needsModel && onDownload == null)) return const SizedBox.shrink();
        return LayoutBuilder(
          builder: (context, box) {
            final v = wb.view.value;
            final r = Rect.fromPoints(v.toScreen(s.bounds.topLeft), v.toScreen(s.bounds.bottomRight));
            // Above the drawing, or under it when there is no room above.
            final above = r.top - _barHeight - Kx.s8;
            final top = above >= Kx.s8 ? above : math.min(r.bottom + Kx.s8, box.maxHeight - _barHeight - Kx.s8);
            final left = r.left.clamp(Kx.s8, math.max(Kx.s8, box.maxWidth - 120)).toDouble();
            return Stack(
              children: [
                Positioned(
                  left: left,
                  top: math.max(Kx.s8, top),
                  child: ConstrainedBox(
                    constraints: BoxConstraints(maxWidth: math.max(160, box.maxWidth - left - Kx.s8)),
                    child: SketchSuggestBar(
                      suggestion: s,
                      onPick: (i) => unawaited(sketch.pick(i)),
                      onChoose: (c) => unawaited(sketch.choose(c)),
                      onClose: sketch.dismiss,
                      onDownload: onDownload,
                    ),
                  ),
                ),
              ],
            );
          },
        );
      },
    );
  }
}

/// The bar itself: "Did you mean?", the readings, shapes and matching pictures, diagrams,
/// animations and models, one button per icon, and "x".
class SketchSuggestBar extends StatelessWidget {
  const SketchSuggestBar({super.key, required this.suggestion, required this.onPick, required this.onClose, this.onDownload, this.onChoose});

  final SketchSuggestion suggestion;
  final ValueChanged<SketchIcon> onPick;
  final ValueChanged<InkChoice>? onChoose;
  final VoidCallback onClose;
  final VoidCallback? onDownload;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final c = context.colors;
    return Material(
      key: const Key('sketch-suggest-bar'),
      elevation: 4,
      color: c.surfaceContainerHigh,
      borderRadius: BorderRadius.circular(Kx.rMd),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: Kx.s8, vertical: Kx.s4),
        child: SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              const SizedBox(width: Kx.s4),
              Text(l.sketchSuggestTitle, style: context.text.labelLarge?.copyWith(color: c.onSurfaceVariant)),
              const SizedBox(width: Kx.s8),
              if (suggestion.needsModel)
                FilledButton.tonalIcon(
                  key: const Key('sketch-suggest-download'),
                  onPressed: onDownload,
                  icon: const Icon(Icons.download, size: 18),
                  label: Text(l.sketchModelDownload),
                )
              else ...[
                for (final (i, choice) in suggestion.choices.indexed)
                  Padding(
                    padding: const EdgeInsets.only(right: Kx.s4),
                    child: InkChoiceButton(key: Key('sketch-choice-$i'), choice: choice, onTap: onChoose == null ? null : () => onChoose!(choice)),
                  ),
                for (final (i, icon) in suggestion.icons.indexed)
                  Tooltip(
                    message: icon.label,
                    child: Semantics(
                      button: true,
                      label: l.sketchSuggestUse(icon.label),
                      excludeSemantics: true,
                      child: InkWell(
                        key: Key('sketch-suggest-$i'),
                        borderRadius: BorderRadius.circular(Kx.rSm),
                        onTap: () => onPick(icon),
                        child: SizedBox.square(dimension: 52, child: Center(child: SketchIconView(icon: icon, size: 36, color: c.onSurface))),
                      ),
                    ),
                  ),
              ],
              IconButton(key: const Key('sketch-suggest-close'), tooltip: l.close, onPressed: onClose, icon: const Icon(Icons.close)),
            ],
          ),
        ),
      ),
    );
  }
}

/// The name of a clean shape, as the Shapes tool calls it.
String fitKindName(AppLocalizations l, FitKind k) => switch (k) {
  FitKind.circle => l.shapeCircle,
  FitKind.ellipse => l.shapeEllipse,
  FitKind.rectangle || FitKind.square || FitKind.quad => l.shapeRectangle,
  FitKind.triangle => l.shapeTriangle,
  FitKind.line => l.shapeLine,
  FitKind.polygon => l.shapePentagon,
};

IconData _fitIcon(FitKind k) => switch (k) {
  FitKind.circle => Icons.circle_outlined,
  FitKind.ellipse => Icons.egg_outlined,
  FitKind.rectangle || FitKind.square || FitKind.quad => Icons.crop_square,
  FitKind.triangle => Icons.change_history,
  FitKind.line => Icons.horizontal_rule,
  FitKind.polygon => Icons.pentagon_outlined,
};

IconData _assetIcon(InkAssetKind k) => switch (k) {
  InkAssetKind.picture => Icons.image_outlined,
  InkAssetKind.diagram => Icons.schema_outlined,
  InkAssetKind.model3d => Icons.view_in_ar_outlined,
  InkAssetKind.animation => Icons.animation,
};

/// "Picture: Heart", "3D model: Human heart"...: what a suggested asset is, for its tooltip.
String inkAssetLabel(AppLocalizations l, InkAsset a) => switch (a.kind) {
  InkAssetKind.picture => l.inkSuggestPicture(a.title),
  InkAssetKind.diagram => l.inkSuggestDiagram(a.title),
  InkAssetKind.model3d => l.inkSuggestModel(a.title),
  InkAssetKind.animation => l.inkSuggestAnimation(a.title),
};

/// One of the bar's choices: a reading (maths typeset), a shape, or an asset with its thumbnail.
class InkChoiceButton extends StatelessWidget {
  const InkChoiceButton({super.key, required this.choice, this.onTap});

  final InkChoice choice;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final c = context.colors;
    Widget text(String t) => ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 160),
      child: Text(t, maxLines: 1, overflow: TextOverflow.ellipsis, style: context.text.labelLarge),
    );
    Widget maths(String tex) => IgnorePointer(
      child: BoardMath(element: MathElement(id: 'choice', position: Offset.zero, latex: tex, color: c.onSurface, fontSize: 22, size: const Size(1, 1))),
    );
    final (String tip, Widget child) = switch (choice) {
      ReadingChoice(:final label, :final math) => (l.sketchSuggestUse(label), math ? maths(label) : text(label)),
      TextChoice(:final text?, latex: null) => (l.sketchSuggestUse(text), Row(mainAxisSize: MainAxisSize.min, children: [const Icon(Icons.text_fields, size: 18), const SizedBox(width: 4), _Text(text)])),
      TextChoice(:final latex) => (l.sketchSuggestUse(latex!), maths(latex)),
      ShapeChoice(:final kind) => (l.sketchSuggestUse(fitKindName(l, kind)), Icon(_fitIcon(kind), size: 30, color: c.onSurface)),
      AssetChoice(:final asset) => (
        inkAssetLabel(l, asset),
        Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (asset.thumb case final t?)
              ClipRRect(
                borderRadius: BorderRadius.circular(Kx.rSm),
                child: Image.asset(t, width: 40, height: 40, fit: BoxFit.cover, errorBuilder: (_, _, _) => Icon(_assetIcon(asset.kind), size: 28)),
              )
            else
              Icon(_assetIcon(asset.kind), size: 28, color: c.tertiary),
            const SizedBox(width: Kx.s4),
            text(asset.title),
          ],
        ),
      ),
    };
    return Tooltip(
      message: tip,
      child: Semantics(
        button: true,
        label: tip,
        excludeSemantics: true,
        child: InkWell(
          borderRadius: BorderRadius.circular(Kx.rSm),
          onTap: onTap,
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 52, minWidth: 52),
            child: Padding(padding: const EdgeInsets.symmetric(horizontal: Kx.s8), child: Center(child: child)),
          ),
        ),
      ),
    );
  }
}

class _Text extends StatelessWidget {
  const _Text(this.text);
  final String text;
  @override
  Widget build(BuildContext context) => ConstrainedBox(
    constraints: const BoxConstraints(maxWidth: 160),
    child: Text(text, maxLines: 1, overflow: TextOverflow.ellipsis, style: context.text.labelLarge),
  );
}

/// A [SketchIcon] on screen: the emoji in the platform's colour emoji font, or the Material icon.
class SketchIconView extends StatelessWidget {
  const SketchIconView({super.key, required this.icon, required this.size, this.color});

  final SketchIcon icon;
  final double size;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final emoji = icon.emoji;
    if (emoji != null) return Text(emoji, style: TextStyle(fontSize: size * 0.85, height: 1), textScaler: TextScaler.noScaling);
    return Icon(icon.icon, size: size, color: color);
  }
}

/// "Suggest icons for sketches" (on by default). Where the board has no sketch model (Windows,
/// macOS, the web) it says so and cannot be switched on.
class SketchSuggestSwitch extends StatelessWidget {
  const SketchSuggestSwitch({super.key, required this.board, required this.available, this.cloud = false});

  final BoardController board;

  /// Drawings are recognised by the board's AI (no sketch model on this board).
  final bool cloud;

  /// The board has a sketch model (ML Kit, on Android).
  final bool available;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return ListenableBuilder(
      listenable: board,
      builder: (context, _) => SwitchListTile(
        key: const Key('sketch-suggest'),
        contentPadding: EdgeInsets.zero,
        title: Text(l.sketchSuggestSwitch),
        subtitle: Text(available ? (cloud ? l.sketchSuggestCloudHint : l.sketchSuggestSwitchHint) : l.sketchSuggestUnavailable),
        value: available && board.sketchSuggest,
        onChanged: available ? board.setSketchSuggest : null,
      ),
    );
  }
}

/// Asks to download the sketch model, with the AI pen's download dialog. True once it is ready.
Future<bool> offerSketchModel(BuildContext context, HandwritingRecognizer handwriting) async {
  if (handwriting is! InkModelReader) return false;
  final l = context.l10n;
  final ok = await showPanelDialog<bool>(
    context: context,
    barrierDismissible: false,
    builder: (_) => BoardChromeTheme(
      child: AiPenModelsDialog(reader: handwriting as InkModelReader, models: const [InkModels.autodraw], title: l.sketchModelTitle, body: l.sketchModelBody),
    ),
  );
  return ok ?? false;
}

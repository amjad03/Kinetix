import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/board_controller.dart';
import '../../l10n/l10n.dart';
import 'chrome.dart';
import 'layout/ui_strings.dart';

/// The AI pen on the board screen: its icon, its options, the Convert button for ink waiting to
/// be converted, the readings of something it converted, and its part of Board settings.

/// The pen with a sparkle. The sparkle turns while the AI pen is converting.
class AiPenIcon extends StatelessWidget {
  const AiPenIcon({super.key, this.busy = false});

  final bool busy;

  @override
  Widget build(BuildContext context) {
    final s = IconTheme.of(context).size ?? 24;
    final c = IconTheme.of(context).color;
    return SizedBox(
      width: s,
      height: s,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          Icon(Icons.edit_outlined, size: s, color: c),
          Positioned(
            right: -s * 0.2,
            top: -s * 0.2,
            child: AnimatedRotation(
              turns: busy ? 1 : 0,
              duration: const Duration(milliseconds: 900),
              child: Icon(Icons.auto_awesome, size: s * 0.55, color: context.colors.tertiary),
            ),
          ),
        ],
      ),
    );
  }
}

String aiPenModeName(AppLocalizations l, AiPenMode m) => switch (m) {
  AiPenMode.auto => l.aiPenModeAuto,
  AiPenMode.live => l.aiPenModeLive,
  AiPenMode.tap => l.aiPenModeTap,
};

String aiPenModeHint(AppLocalizations l, AiPenMode m) => switch (m) {
  AiPenMode.auto => l.aiPenModeAutoHint,
  AiPenMode.live => l.aiPenModeLiveHint,
  AiPenMode.tap => l.aiPenModeTapHint,
};

/// What to tell the teacher for [n]; [language] is the AI pen's words language.
String aiPenNoticeText(AppLocalizations l, AiPenNotice n, BoardLanguage language) => switch (n) {
  AiPenNotice.wordsStayInk => l.aiPenWordsStayInk,
  AiPenNotice.modelNeeded => l.aiPenModelNeeded(language.label),
  AiPenNotice.languageUnsupported => l.aiPenLanguageUnsupported(language.label),
  AiPenNotice.nothingToConvert => l.aiPenNothingToConvert,
};

/// The AI pen's options: when it converts, which language words are read in, and tidying shapes
/// with the ordinary pen.
class AiPenPopover extends StatelessWidget {
  const AiPenPopover({super.key, required this.board, required this.pen});

  final BoardController board;
  final AiPenController pen;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final hint = context.text.bodySmall?.copyWith(color: context.colors.onSurfaceVariant);
    return ListenableBuilder(
      listenable: Listenable.merge([board, pen]),
      builder: (context, _) => PopoverCard(
        key: const Key('ai-pen-popover'),
        title: l.aiPenTitle,
        width: 460,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            RadioGroup<AiPenMode>(
              groupValue: board.aiPenMode,
              onChanged: (m) => board.setAiPenMode(m!),
              child: Column(
                children: [
                  for (final m in AiPenMode.values)
                    RadioListTile<AiPenMode>(
                      key: Key('ai-pen-mode-${m.name}'),
                      value: m,
                      dense: true,
                      contentPadding: EdgeInsets.zero,
                      title: Text(aiPenModeName(l, m)),
                      subtitle: Text(aiPenModeHint(l, m)),
                    ),
                ],
              ),
            ),
            const SizedBox(height: Kx.s12),
            Text(l.aiPenWordsLanguage, style: context.text.labelLarge?.copyWith(color: context.colors.onSurfaceVariant)),
            const SizedBox(height: Kx.s8),
            SegmentedButton<BoardLanguage>(
              key: const Key('ai-pen-language'),
              showSelectedIcon: false,
              segments: [for (final lang in BoardLanguage.values) ButtonSegment(value: lang, label: Text(lang.label))],
              selected: {board.aiPenLanguage},
              onSelectionChanged: (s) => board.setAiPenLanguage(s.single),
            ),
            const SizedBox(height: Kx.s12),
            SnapShapesSwitch(board: board),
            MeasureShapesSwitch(board: board),
            const SizedBox(height: Kx.s8),
            Text(l.aiPenTapHint, style: hint),
          ],
        ),
      ),
    );
  }
}

/// "Tidy shapes as I draw": the ordinary pen turns rough shapes into clean ones.
class SnapShapesSwitch extends StatelessWidget {
  const SnapShapesSwitch({super.key, required this.board});

  final BoardController board;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return ListenableBuilder(
      listenable: board,
      builder: (context, _) => SwitchListTile(
        key: const Key('snap-shapes'),
        contentPadding: EdgeInsets.zero,
        title: Text(l.aiPenSnapShapes),
        subtitle: Text(l.aiPenSnapShapesHint),
        value: board.snapShapes,
        onChanged: board.setSnapShapes,
      ),
    );
  }
}

/// "Show measurements on new shapes" (off by default), and the units they are given in.
class MeasureShapesSwitch extends StatelessWidget {
  const MeasureShapesSwitch({super.key, required this.board});

  final BoardController board;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return ListenableBuilder(
      listenable: board,
      builder: (context, _) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SwitchListTile(
            key: const Key('measure-shapes'),
            contentPadding: EdgeInsets.zero,
            title: Text(l.aiPenMeasureShapes),
            subtitle: Text(l.aiPenMeasureShapesHint),
            value: board.measureShapes,
            onChanged: board.setMeasureShapes,
          ),
          Row(
            children: [
              Expanded(child: Text(l.measureUnits, style: context.text.bodyMedium)),
              SegmentedButton<MeasureUnit>(
                key: const Key('measure-unit'),
                showSelectedIcon: false,
                segments: [
                  ButtonSegment(value: MeasureUnit.cm, label: Text(l.measureUnitCm)),
                  ButtonSegment(value: MeasureUnit.px, label: Text(l.measureUnitPx)),
                ],
                selected: {board.measureUnit},
                onSelectionChanged: (s) => board.setMeasureUnit(s.single),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// Over the board: the Convert button beside ink waiting in tap mode, and the readings of the
/// converted element being inspected.
class AiPenOverlay extends StatelessWidget {
  const AiPenOverlay({super.key, required this.wb, required this.pen, required this.onSolve, required this.onMessage});

  final WhiteboardController wb;
  final AiPenController pen;

  /// Sends an equation to the maths solver.
  final ValueChanged<MathElement> onSolve;
  final ValueChanged<String> onMessage;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: Listenable.merge([pen, pen.inspecting, wb, wb.view]),
      builder: (context, _) {
        final v = wb.view.value;
        final id = pen.inspecting.value;
        final el = id == null ? null : wb.byId(id);
        final pending = pen.pending;
        Rect onScreen(Rect r) => Rect.fromPoints(v.toScreen(r.topLeft), v.toScreen(r.bottomRight));
        return Stack(
          children: [
            if (wb.tool == BoardTool.aiPen && pen.mode == AiPenMode.tap && pending.isNotEmpty && !pen.converting)
              Builder(
                builder: (context) {
                  final r = onScreen(inkBounds(pending));
                  return Positioned(
                    left: r.right + 8,
                    top: r.top,
                    child: FilledButton.icon(
                      key: const Key('ai-pen-convert'),
                      onPressed: () => unawaited(pen.convertPending()),
                      icon: const Icon(Icons.auto_awesome, size: 18),
                      label: Text(context.l10n.aiPenConvert),
                    ),
                  );
                },
              ),
            if (el != null && pen.conversions.containsKey(id))
              Positioned.fill(
                child: AiPenInspector(key: ValueKey(id), pen: pen, element: el, screenRect: onScreen(el.bounds), onSolve: onSolve, onMessage: onMessage),
              ),
          ],
        );
      },
    );
  }
}

/// What the AI pen made of some ink: other readings, a box to type the right one, and the ways
/// back (it was a shape, it was writing, my ink as I wrote it).
class AiPenInspector extends StatefulWidget {
  const AiPenInspector({super.key, required this.pen, required this.element, required this.screenRect, required this.onSolve, required this.onMessage});

  final AiPenController pen;
  final BoardElement element;
  final Rect screenRect;
  final ValueChanged<MathElement> onSolve;
  final ValueChanged<String> onMessage;

  @override
  State<AiPenInspector> createState() => _AiPenInspectorState();
}

class _AiPenInspectorState extends State<AiPenInspector> {
  late final _edit = TextEditingController(text: _typed());

  AiPenController get pen => widget.pen;
  String get id => widget.element.id;

  String _typed() {
    final c = pen.conversions[widget.element.id];
    return (c?.kind == ConversionKind.maths ? c?.plain : c?.text) ?? '';
  }

  @override
  void dispose() {
    _edit.dispose();
    super.dispose();
  }

  void _close() => pen.inspecting.value = null;

  @override
  Widget build(BuildContext context) {
    final conv = pen.conversions[id];
    if (conv == null) return const SizedBox.shrink();
    final l = context.l10n;
    final c = context.colors;
    final el = widget.element;
    final shape = conv.kind == ConversionKind.shape;
    return LayoutBuilder(
      builder: (context, box) {
        const w = 460.0;
        final r = widget.screenRect;
        final left = r.left.clamp(8.0, math.max(8.0, box.maxWidth - w - 8)).toDouble();
        final below = r.bottom + 12;
        final height = shape ? 90.0 : 260.0;
        final top = below + height < box.maxHeight - 90 ? below : math.max(72.0, r.top - height - 12);
        Widget card;
        if (shape) {
          card = Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextButton.icon(
                key: const Key('ai-pen-its-writing'),
                onPressed: () => unawaited(pen.toWriting(id)),
                icon: const Icon(Icons.text_fields),
                label: Text(l.aiPenItsWriting),
              ),
              TextButton.icon(key: const Key('ai-pen-back-to-ink'), onPressed: () => pen.revertToInk(id), icon: const Icon(Icons.gesture), label: Text(l.aiPenBackToInk)),
              IconButton(key: const Key('ai-pen-keep'), tooltip: l.aiPenKeepShape, onPressed: _close, icon: Icon(Icons.check, color: c.primary)),
            ],
          );
        } else {
          card = SizedBox(
            width: w - 32,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    Icon(Icons.auto_awesome, size: 18, color: c.tertiary),
                    const SizedBox(width: Kx.s8),
                    Expanded(child: Text(l.aiPenDidYouMean, style: context.text.titleSmall)),
                    IconButton(key: const Key('ai-pen-done'), tooltip: l.done, onPressed: _close, icon: const Icon(Icons.close)),
                  ],
                ),
                if (conv.candidates.length > 1) ...[
                  const SizedBox(height: Kx.s4),
                  Wrap(
                    spacing: Kx.s8,
                    runSpacing: Kx.s8,
                    children: [
                      for (final (i, cand) in conv.candidates.take(5).indexed)
                        ChoiceChip(
                          key: Key('ai-pen-reading-$i'),
                          selected: conv.chosen == i,
                          onSelected: (_) {
                            pen.choose(id, i);
                            setState(() => _edit.text = _typed());
                          },
                          label: conv.kind == ConversionKind.maths
                              ? IgnorePointer(
                                  child: BoardMath(
                                    element: MathElement(id: 'reading-$i', position: Offset.zero, latex: cand, color: c.onSurface, fontSize: 22, size: const Size(1, 1)),
                                  ),
                                )
                              : Text(cand),
                        ),
                    ],
                  ),
                ],
                const SizedBox(height: Kx.s12),
                TextField(
                  key: const Key('ai-pen-type'),
                  controller: _edit,
                  decoration: InputDecoration(
                    isDense: true,
                    labelText: l.aiPenTypeIt,
                    suffixIcon: IconButton(
                      tooltip: l.done,
                      icon: const Icon(Icons.check),
                      onPressed: () {
                        pen.edit(id, _edit.text);
                        _close();
                      },
                    ),
                  ),
                  onSubmitted: (v) {
                    pen.edit(id, v);
                    _close();
                  },
                ),
                const SizedBox(height: Kx.s8),
                Wrap(
                  spacing: Kx.s4,
                  children: [
                    if (el is MathElement)
                      TextButton.icon(
                        key: const Key('ai-pen-solve'),
                        onPressed: () {
                          _close();
                          widget.onSolve(el);
                        },
                        icon: const Icon(Icons.calculate_outlined),
                        label: Text(l.mathSolve),
                      ),
                    TextButton.icon(
                      key: const Key('ai-pen-its-shape'),
                      onPressed: () {
                        if (!pen.toShape(id)) widget.onMessage(l.aiPenNoShape);
                      },
                      icon: const Icon(Icons.category_outlined),
                      label: Text(l.aiPenItsShape),
                    ),
                    TextButton.icon(key: const Key('ai-pen-back-to-ink'), onPressed: () => pen.revertToInk(id), icon: const Icon(Icons.gesture), label: Text(l.aiPenBackToInk)),
                  ],
                ),
              ],
            ),
          );
        }
        return Stack(
          children: [
            Positioned.fill(
              child: GestureDetector(key: const Key('ai-pen-inspector-barrier'), behavior: HitTestBehavior.opaque, onTap: _close),
            ),
            Positioned(
              left: left,
              top: top,
              child: ChromeSurface(
                key: const Key('ai-pen-inspector'),
                radius: Kx.rXl,
                padding: EdgeInsets.all(shape ? Kx.s8 : Kx.s16),
                child: card,
              ),
            ),
          ],
        );
      },
    );
  }
}

/// Board settings → AI pen: what reads words on this board, and each language's model.
class AiPenSettingsSection extends StatefulWidget {
  const AiPenSettingsSection({super.key, required this.board});

  final BoardController board;

  @override
  State<AiPenSettingsSection> createState() => _AiPenSettingsSectionState();
}

class _AiPenSettingsSectionState extends State<AiPenSettingsSection> {
  final Map<String, HandwritingModelState> _states = {};
  final Set<String> _downloading = {};

  HandwritingRecognizer get hw => widget.board.handwriting;

  /// The shapes model, where the recogniser has one (ML Kit).
  InkModelReader? get _shapes => hw is InkModelReader ? hw as InkModelReader : null;

  /// A row's key: the language code, or "shapes".
  Future<HandwritingModelState> _state(String id) => id == 'shapes' ? _shapes!.modelStateOf(InkModels.shapes) : hw.modelState(id);
  List<String> get _rows => [for (final l in BoardLanguage.values) l.name, if (_shapes != null) 'shapes'];

  @override
  void initState() {
    super.initState();
    unawaited(_check());
  }

  Future<void> _check() async {
    if (!hw.available) return;
    for (final id in _rows) {
      final s = await _state(id);
      if (!mounted) return;
      setState(() => _states[id] = s);
    }
  }

  Future<void> _download(String id) async {
    setState(() => _downloading.add(id));
    final ok = id == 'shapes' ? await _shapes!.downloadModel(InkModels.shapes) : await hw.prepare(id);
    if (!mounted) return;
    if (!ok) showBoardMessage(context, context.l10n.aiPenDownloadFailed);
    final s = await _state(id);
    if (!mounted) return;
    setState(() {
      _downloading.remove(id);
      _states[id] = s;
    });
  }

  /// One language's handwriting model: its name, and whether it is ready, downloading (a bar
  /// across the row) or can be downloaded.
  Widget _model(BuildContext context, String lang) {
    final l = context.l10n;
    final label = lang == 'shapes' ? l.aiPenModelShapes : BoardLanguage.values.byName(lang).label;
    final c = context.colors;
    final small = context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant);
    final downloading = _downloading.contains(lang) || _states[lang] == HandwritingModelState.downloading;
    final Widget status = downloading
        ? const SizedBox.shrink()
        : switch (_states[lang]) {
            HandwritingModelState.ready => Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.check_circle, size: 18, color: c.primary),
                const SizedBox(width: Kx.s4),
                Text(l.aiPenModelReady, style: small),
              ],
            ),
            HandwritingModelState.needsDownload => OutlinedButton.icon(
              key: Key('ai-pen-download-$lang'),
              style: OutlinedButton.styleFrom(minimumSize: const Size(0, 40), padding: const EdgeInsets.symmetric(horizontal: Kx.s16), visualDensity: VisualDensity.compact),
              onPressed: () => unawaited(_download(lang)),
              icon: const Icon(Icons.download, size: 18),
              label: Text(l.aiPenModelDownload),
            ),
            HandwritingModelState.unsupported => Text(l.aiPenModelUnsupported, style: small),
            // Still asking the recogniser.
            _ => const SizedBox.shrink(),
          };
    return Padding(
      key: Key('ai-pen-model-$lang'),
      padding: const EdgeInsets.symmetric(vertical: Kx.s8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 40),
            child: Row(
              children: [
                Expanded(child: Text(label, style: context.text.bodyLarge)),
                status,
              ],
            ),
          ),
          if (downloading) ...[
            const SizedBox(height: Kx.s8),
            // ML Kit does not say how far along a download is: the bar runs until it is done.
            ClipRRect(
              borderRadius: BorderRadius.circular(Kx.rXs),
              child: const LinearProgressIndicator(key: Key('ai-pen-download-progress'), minHeight: 6),
            ),
            const SizedBox(height: Kx.s4),
            Text('${l.aiPenModelDownloading} · ${UiStrings.of(context).modelSize}', style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant)),
          ],
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final hint = context.text.bodyMedium?.copyWith(color: context.colors.onSurfaceVariant);
    return Column(
      key: const Key('ai-pen-settings'),
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(l.aiPenSettingsTitle, style: context.text.titleSmall),
        const SizedBox(height: Kx.s4),
        Text(l.aiPenSettingsHint, style: hint),
        const SizedBox(height: Kx.s4),
        Text(switch (hw.engine) {
          'mlkit' => l.aiPenEngineMlkit,
          'windows' => l.aiPenEngineWindows,
          _ => l.aiPenEngineNone,
        }, style: hint),
        if (hw.available)
          for (final id in _rows) _model(context, id),
        const SizedBox(height: Kx.s8),
        SnapShapesSwitch(board: widget.board),
        MeasureShapesSwitch(board: widget.board),
      ],
    );
  }
}

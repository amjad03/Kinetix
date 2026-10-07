import 'dart:async';

import 'package:flutter/material.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../l10n/l10n.dart';
import 'chrome.dart';
import 'panel/panel_host.dart' show showPanelDialog;

/// The on-device models the AI pen uses for [language]: its handwriting, English for digits
/// and symbols (maths is written in them in every language), and shapes.
List<String> aiPenModelsFor(BoardLanguage language) => [
  InkModels.text(language.name),
  if (language != BoardLanguage.en) InkModels.text('en'),
  InkModels.shapes,
];

/// The AI pen's models for [language] that are not on this device yet (and could be).
Future<List<String>> missingAiPenModels(InkModelReader reader, BoardLanguage language) async {
  final out = <String>[];
  for (final m in aiPenModelsFor(language)) {
    try {
      if (await reader.modelStateOf(m) == HandwritingModelState.needsDownload) out.add(m);
    } catch (_) {}
  }
  return out;
}

/// A model's name for the teacher: "English handwriting", "Shapes".
String aiPenModelName(AppLocalizations l, String model) {
  if (model == InkModels.shapes) return l.aiPenModelShapes;
  final lang = BoardLanguage.values.firstWhere((b) => InkModels.text(b.name) == model, orElse: () => BoardLanguage.en);
  return l.aiPenModelHandwriting(lang.label);
}

/// A demo board fetches English and shapes by itself when it is online, so the AI pen converts
/// from the first stroke. Offline, ML Kit fails quietly and the board asks later.
Future<void> autoDownloadDemoModels(HandwritingRecognizer handwriting, {VoidCallback? onReady}) async {
  if (handwriting is! InkModelReader) return;
  final reader = handwriting as InkModelReader;
  var any = false;
  for (final m in [InkModels.text('en'), InkModels.shapes]) {
    try {
      if (await reader.modelStateOf(m) == HandwritingModelState.needsDownload && await reader.downloadModel(m)) any = true;
    } catch (_) {}
  }
  if (any) onReady?.call();
}

/// The first time the AI pen is picked on a device whose models are not downloaded: offers to
/// download them, with progress, so writing converts from then on. Asked once per device (Board
/// settings → AI pen downloads them later too). True when the models were downloaded.
Future<bool> offerAiPenModels(BuildContext context, HandwritingRecognizer handwriting, BoardLanguage language, {bool force = false}) async {
  if (handwriting is! InkModelReader) return false;
  final reader = handwriting as InkModelReader;
  const key = 'aiPen.modelsOffered';
  SharedPreferences? prefs;
  try {
    prefs = await SharedPreferences.getInstance();
    if (!force && (prefs.getBool(key) ?? false)) return false;
  } catch (_) {}
  final missing = await missingAiPenModels(reader, language);
  if (missing.isEmpty || !context.mounted) return false;
  try {
    await prefs?.setBool(key, true);
  } catch (_) {}
  if (!context.mounted) return false;
  final ok = await showPanelDialog<bool>(
    context: context,
    barrierDismissible: false,
    builder: (_) => BoardChromeTheme(child: AiPenModelsDialog(reader: reader, models: missing)),
  );
  if (ok == true && context.mounted) showBoardMessage(context, context.l10n.aiPenModelsReady);
  return ok ?? false;
}

/// Asks to download the AI pen's [models], then downloads them one by one with a bar and
/// "Downloading English handwriting (1 of 2)…". ML Kit does not say how far along a model is, so
/// the bar runs until each one is done.
class AiPenModelsDialog extends StatefulWidget {
  const AiPenModelsDialog({super.key, required this.reader, required this.models});

  final InkModelReader reader;
  final List<String> models;

  @override
  State<AiPenModelsDialog> createState() => _AiPenModelsDialogState();
}

class _AiPenModelsDialogState extends State<AiPenModelsDialog> {
  /// The model downloading now (index into the models), or null before the teacher says yes.
  int? _step;
  bool _failed = false;

  Future<void> _download() async {
    setState(() {
      _step = 0;
      _failed = false;
    });
    var ok = true;
    for (var i = 0; i < widget.models.length; i++) {
      if (!mounted) return;
      setState(() => _step = i);
      try {
        ok = await widget.reader.downloadModel(widget.models[i]) && ok;
      } catch (_) {
        ok = false;
      }
    }
    if (!mounted) return;
    if (ok) {
      Navigator.pop(context, true);
    } else {
      setState(() {
        _step = null;
        _failed = true;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final step = _step;
    final small = context.text.bodyMedium?.copyWith(color: context.colors.onSurfaceVariant);
    return AlertDialog(
      key: const Key('ai-pen-models'),
      icon: const Icon(Icons.auto_fix_high),
      title: Text(l.aiPenModelsTitle),
      content: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 440),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(l.aiPenModelsBody),
            const SizedBox(height: Kx.s12),
            for (final m in widget.models)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: Kx.s4),
                child: Row(
                  children: [
                    Icon(m == InkModels.shapes ? Icons.category_outlined : Icons.draw_outlined, size: 20),
                    const SizedBox(width: Kx.s8),
                    Expanded(child: Text(aiPenModelName(l, m))),
                    if (step != null && widget.models.indexOf(m) < step) Icon(Icons.check_circle, size: 18, color: context.colors.primary),
                  ],
                ),
              ),
            if (step != null) ...[
              const SizedBox(height: Kx.s12),
              ClipRRect(
                borderRadius: BorderRadius.circular(Kx.rXs),
                child: LinearProgressIndicator(key: const Key('ai-pen-models-progress'), minHeight: 6, value: null, semanticsValue: '${step + 1}/${widget.models.length}'),
              ),
              const SizedBox(height: Kx.s8),
              Text(l.aiPenModelsStep(aiPenModelName(l, widget.models[step]), step + 1, widget.models.length), key: const Key('ai-pen-models-step'), style: small),
            ],
            if (_failed) ...[
              const SizedBox(height: Kx.s12),
              Text(l.aiPenDownloadFailed, style: small?.copyWith(color: context.colors.error)),
            ],
          ],
        ),
      ),
      actions: [
        TextButton(key: const Key('ai-pen-models-later'), onPressed: step != null ? null : () => Navigator.pop(context, false), child: Text(l.notNow)),
        FilledButton.icon(
          key: const Key('ai-pen-models-download'),
          onPressed: step != null ? null : () => unawaited(_download()),
          icon: const Icon(Icons.download),
          label: Text(l.aiPenModelDownload),
        ),
      ],
    );
  }
}

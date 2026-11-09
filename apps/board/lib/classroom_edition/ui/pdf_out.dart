import 'dart:async';
import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../l10n/ce_strings.dart';
import 'ce_style.dart';

/// Printing and saving the edition's PDFs (question papers, worksheets, marks, the mastery map,
/// the quick-start sheet, the PIN recovery code). Many interactive panels have no print
/// service at all; there the PDF is saved to a USB drive or Downloads (the system's Save dialog,
/// no permission needed) and printed from a computer, and the screens lead with Save.
abstract final class CePdfOut {
  /// Whether the board can print: Android's printing feature and at least one print service
  /// (a printer app). Null until [refresh] has asked. Everywhere but Android: true.
  static final ValueNotifier<bool?> printService = ValueNotifier(null);

  /// Asks the board (android/…/MainActivity.kt, `zynetix/print`); tests replace it.
  static Future<bool> Function() hasPrintService = () async {
    if (kIsWeb || !Platform.isAndroid) return true;
    return await const MethodChannel('zynetix/print').invokeMethod<bool>('hasPrintService') ?? true;
  };

  /// Reads [printService] once more (at start-up, and back from Android's settings).
  static Future<void> refresh() async {
    try {
      printService.value = await hasPrintService();
    } catch (_) {
      printService.value = true;
    }
  }

  /// No print service on this board: Save comes first and Print explains.
  static bool get leadWithSave => printService.value == false;

  /// Saves [pdf] where the teacher picks: a USB drive, Downloads, another folder. True when saved.
  static Future<bool> Function(Uint8List pdf, String name) save = (pdf, name) async =>
      await FilePicker.saveFile(fileName: name, bytes: pdf, type: FileType.custom, allowedExtensions: const ['pdf']) != null;
}

/// The words on every Save button.
String cePdfSaveLabel(BuildContext context) => context.ce('Save PDF to USB / Downloads…');

/// Saves [pdf] as [name] through the system's Save dialog and says so.
Future<bool> ceSavePdf(BuildContext context, Uint8List pdf, String name) async {
  final messenger = ScaffoldMessenger.maybeOf(context);
  final saved = context.ce('Saved {name}.', {'name': name});
  try {
    final ok = await CePdfOut.save(pdf, name.endsWith('.pdf') ? name : '$name.pdf');
    if (ok) messenger?.showSnackBar(SnackBar(content: Text(saved), persist: false));
    return ok;
  } catch (e) {
    if (context.mounted) messenger?.showSnackBar(SnackBar(content: Text(context.ce('Could not save: {error}', {'error': e})), persist: false));
    return false;
  }
}

/// Prints [pdf] with [print] when the board can; on a board without a print service, says so
/// and offers Save instead.
Future<void> cePrintOrSave(BuildContext context, Uint8List pdf, String name, Future<void> Function(Uint8List pdf, String name) print) async {
  if (!CePdfOut.leadWithSave) {
    await print(pdf, name);
    return;
  }
  final save = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      key: const Key('ce-no-printer'),
      title: Text(ctx.ce('This board cannot print'), style: ceHeading(22)),
      content: Text(ctx.ce('There is no print service on this board. Save the PDF to a USB drive or Downloads and print it from a computer.'), style: ceText(16)),
      actions: [
        TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: Text(ctx.ce('Cancel'))),
        FilledButton.icon(key: const Key('ce-no-printer-save'), style: ceBigButton(), onPressed: () => Navigator.of(ctx).pop(true), icon: const Icon(Icons.save_alt), label: Text(cePdfSaveLabel(ctx))),
      ],
    ),
  );
  if (save == true && context.mounted) await ceSavePdf(context, pdf, name);
}

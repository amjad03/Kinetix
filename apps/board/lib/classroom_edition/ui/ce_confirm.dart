import 'package:flutter/material.dart';

import 'ce_style.dart';

/// How long "Undo" stays on screen after something is removed.
const ceUndoFor = Duration(seconds: 10);

/// "Remove …?" with what will be lost spelled out, Cancel first and the red Remove apart from
/// it. True when the teacher confirmed.
Future<bool> ceConfirmRemove(BuildContext context, {required String title, required String body, String confirm = 'Remove'}) async {
  final ok = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      key: const Key('ce-confirm-remove'),
      icon: const Icon(Icons.delete_outline, size: 40, color: CeC.red),
      title: Text(title),
      content: SizedBox(width: 520, child: Text(body, style: ceText(17, c: CeC.navy))),
      actionsAlignment: MainAxisAlignment.spaceBetween,
      actions: [
        OutlinedButton(key: const Key('ce-confirm-cancel'), style: ceSoftButton(), onPressed: () => Navigator.pop(ctx, false), child: const Text('Keep it')),
        FilledButton.icon(
          key: const Key('ce-confirm-ok'),
          style: FilledButton.styleFrom(backgroundColor: CeC.red, foregroundColor: Colors.white, minimumSize: const Size(160, 52)),
          onPressed: () => Navigator.pop(ctx, true),
          icon: const Icon(Icons.delete_outline),
          label: Text(confirm),
        ),
      ],
    ),
  );
  return ok == true;
}

/// The message and its Undo, for [ceUndoFor] after a removal.
void ceUndoSnack(BuildContext context, String message, VoidCallback onUndo) {
  final m = ScaffoldMessenger.maybeOf(context);
  if (m == null) return;
  m.hideCurrentSnackBar();
  m.showSnackBar(
    SnackBar(
      key: const Key('ce-undo-snack'),
      duration: ceUndoFor,
      persist: false,
      content: Text(message),
      action: SnackBarAction(key: const Key('ce-undo'), label: 'Undo', onPressed: onUndo),
    ),
  );
}

/// The red "Remove …" at the far left of a dialog's actions, away from Save.
Widget ceRemoveAction({required Key key, required String label, required VoidCallback onPressed}) => TextButton.icon(
  key: key,
  style: TextButton.styleFrom(foregroundColor: CeC.red),
  onPressed: onPressed,
  icon: const Icon(Icons.delete_outline),
  label: Text(label),
);

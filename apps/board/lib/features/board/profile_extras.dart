import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../../core/board_controller.dart';
import 'classroom_profile_strings.dart';
import 'classroom_profile_ui.dart';
import 'panel/panel_host.dart';
import 'sb_strings.dart';

/// What this version of the board brought (What's New, spec §8): the newest first.
const boardReleaseNotes = <(String, List<String>)>[
  (
    '0.3.0',
    [
      'Bottom toolbar: Switch moves the quick group to the other side; Hide leaves only the board.',
      'Screen Freeze: the board stays as it is while a student points; Close is bottom left.',
      'Share by WhatsApp, email or QR: a branded PDF of every page.',
      'Theme: Template, Background and Custom, with your logo and watermark on exports.',
      'Pen: Solid Pen, Highlighter, Two Side, Text AI (13 languages, Kalam font) and Shape AI.',
      'PPT beside your writing: Add Page, Add All Pages, Edge to Edge, Present with animations.',
      'Quiz AI: scan the board, mixed question types, timer, teams and exam-frequency badges.',
      'Smart Tools: Summary, Lecture, Google, Wikipedia, Dictionary, Calculator and more.',
      'Version history for saved whiteboards.',
    ],
  ),
];

/// Schedule a Training: the institution's training link as a QR (scan with a phone), its
/// contact, and the board's own guided tour and practice board.
Future<void> showTrainingDialog(BuildContext context, BoardController board, {VoidCallback? onTour, VoidCallback? onPractice}) {
  final s = SbStrings.of(context);
  final training = board.institutionBoardInfo['training'] as Map<String, dynamic>?;
  final url = training?['url'] as String?;
  final contact = training?['contact'] as String?;
  return showPanelDialog<void>(
    context: context,
    builder: (ctx) => AlertDialog(
      key: const Key('training-dialog'),
      title: Text(s('trainingTitle')),
      content: SizedBox(
        width: 520,
        child: SingleChildScrollView(child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (url != null) ...[
              Center(child: Container(color: Colors.white, padding: const EdgeInsets.all(8), child: QrImageView(key: const Key('training-qr'), data: url, size: 220))),
              const SizedBox(height: Kx.s8),
              Text(s('trainingScan')),
              SelectableText(url, style: ctx.text.bodySmall),
            ] else
              Text(s('trainingNoLink'), key: const Key('training-no-link')),
            if (contact != null && contact.isNotEmpty) ...[const SizedBox(height: Kx.s8), Text(s('trainingContact', {'c': contact}))],
            const SizedBox(height: Kx.s16),
            if (board.isSignedIn && board.api != null) TrainingScheduler(board: board) else Text(classroomStrings(ctx).t('trainingSignIn'), key: const Key('training-sign-in')),
            const SizedBox(height: Kx.s16),
            Wrap(
              spacing: Kx.s8,
              children: [
                if (onTour != null)
                  OutlinedButton.icon(
                    key: const Key('training-tour'),
                    onPressed: () {
                      Navigator.of(ctx).pop();
                      onTour();
                    },
                    icon: const Icon(Icons.school_outlined),
                    label: Text(s('tourNow')),
                  ),
                if (onPractice != null)
                  OutlinedButton.icon(
                    key: const Key('training-practice'),
                    onPressed: () {
                      Navigator.of(ctx).pop();
                      onPractice();
                    },
                    icon: const Icon(Icons.edit_note),
                    label: Text(s('practiceNow')),
                  ),
              ],
            ),
          ],
        )),
      ),
      actions: [TextButton(onPressed: () => Navigator.of(ctx).pop(), child: Text(MaterialLocalizations.of(ctx).closeButtonLabel))],
    ),
  );
}

/// What's New: the institution's announcements, then what this version of the board brought.
Future<void> showWhatsNewDialog(BuildContext context, BoardController board) {
  final s = SbStrings.of(context);
  final items = [for (final e in (board.institutionBoardInfo['whatsNew'] as List<dynamic>? ?? const [])) (e as Map).cast<String, dynamic>()];
  return showPanelDialog<void>(
    context: context,
    builder: (ctx) => AlertDialog(
      key: const Key('whats-new'),
      title: Text(s('whatsNew')),
      content: SizedBox(
        width: 560,
        child: ListView(
          shrinkWrap: true,
          children: [
            if (items.isNotEmpty) ...[
              Text(s('fromInstitution'), style: ctx.text.titleSmall),
              for (final e in items)
                ListTile(key: Key('whats-new-${e['title']}'), leading: const Icon(Icons.campaign_outlined), title: Text('${e['title']}'), subtitle: Text('${e['body']}\n${e['at']}')),
              const Divider(),
            ],
            for (final (version, notes) in boardReleaseNotes) ...[
              Text('${s('inThisVersion')} $version', style: ctx.text.titleSmall),
              for (final n in notes) ListTile(dense: true, leading: const Icon(Icons.auto_awesome, size: 20), title: Text(n)),
            ],
          ],
        ),
      ),
      actions: [TextButton(onPressed: () => Navigator.of(ctx).pop(), child: Text(MaterialLocalizations.of(ctx).closeButtonLabel))],
    ),
  );
}

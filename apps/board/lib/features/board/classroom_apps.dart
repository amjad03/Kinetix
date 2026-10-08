import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import 'panel/panel_host.dart';
import 'sb_strings.dart';

/// One tile in the Apps area: its key, icon, name and action.
typedef ClassroomApp = (String id, IconData icon, String label, VoidCallback onTap);

/// Classroom Apps (spec §33): Study Material, Live Class, Homework, Lessons, Attendance,
/// Class Prep, Students, Tests, Recordings and Books, then Other Tools (Calculator, Spotlight).
/// Big, readable tiles; each opens the board's own feature.
Future<void> showClassroomApps(BuildContext context, {required List<ClassroomApp> apps, required List<ClassroomApp> others}) {
  final s = SbStrings.of(context);
  Widget grid(BuildContext ctx, List<ClassroomApp> items) => Wrap(
    spacing: Kx.s12,
    runSpacing: Kx.s12,
    children: [
      for (final (id, icon, label, onTap) in items)
        SizedBox(
          width: 132,
          height: 116,
          child: Material(
            color: ctx.colors.surfaceContainerHigh,
            borderRadius: BorderRadius.circular(Kx.rLg),
            child: InkWell(
              key: Key('app-$id'),
              borderRadius: BorderRadius.circular(Kx.rLg),
              onTap: () {
                Navigator.of(ctx).pop();
                onTap();
              },
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(icon, size: 40, color: ctx.colors.primary),
                  const SizedBox(height: Kx.s8),
                  Text(label, textAlign: TextAlign.center, maxLines: 2, style: ctx.text.titleSmall),
                ],
              ),
            ),
          ),
        ),
    ],
  );
  return showPanelDialog<void>(
    context: context,
    builder: (ctx) => AlertDialog(
      key: const Key('classroom-apps'),
      title: Text(s('apps')),
      content: SizedBox(
        width: 760,
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              grid(ctx, apps),
              const SizedBox(height: Kx.s20),
              Text(s('otherTools'), style: ctx.text.titleMedium),
              const SizedBox(height: Kx.s12),
              grid(ctx, others),
            ],
          ),
        ),
      ),
      actions: [TextButton(onPressed: () => Navigator.of(ctx).pop(), child: Text(MaterialLocalizations.of(ctx).closeButtonLabel))],
    ),
  );
}

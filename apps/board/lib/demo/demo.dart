import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../core/server_config.dart';
import '../l10n/l10n.dart';
import 'demo_class_switcher.dart';
import 'demo_strings.dart';

export '../core/server_config.dart' show demoServerUrl, kinetixDemoDefine;

/// Whether this run uses the in-memory demo server. main() leaves it at [kinetixDemoDefine];
/// tests switch it on to see the demo UI.
abstract final class Demo {
  static bool enabled = kinetixDemoDefine;
}

/// "DEMO" in the board's top bar, so nobody mistakes the sample class for a real one. Tapping
/// it opens the demo day's timetable to switch class (lib/demo/demo_class_switcher.dart).
class DemoChip extends StatelessWidget {
  const DemoChip({super.key});

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final l = context.l10n;
    return Tooltip(
      message: '${l.demoBoardBody}\n${demoStrings(context)['switch']}',
      child: ActionChip(
        key: const Key('demoChip'),
        onPressed: () => DemoClassSwitcher.open(context),
        avatar: Icon(Icons.swap_horiz, size: 18, color: colors.onTertiary),
        backgroundColor: colors.tertiary,
        side: BorderSide.none,
        visualDensity: VisualDensity.compact,
        label: Text(
          l.demoChip,
          style: context.text.labelLarge?.copyWith(
            color: colors.onTertiary,
            fontWeight: FontWeight.w700,
            letterSpacing: 1,
          ),
        ),
      ),
    );
  }
}

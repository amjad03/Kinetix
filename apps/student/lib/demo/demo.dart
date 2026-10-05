import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../l10n/l10n.dart';
import '../core/server_config.dart';

export '../core/server_config.dart' show demoServerUrl, kinetixDemoDefine;

/// Whether this run uses the in-memory demo backend. main() leaves it at [kinetixDemoDefine];
/// tests switch it on to see the demo UI.
abstract final class Demo {
  static bool enabled = kinetixDemoDefine;
}

/// "DEMO", so nobody mistakes the sample data for real data.
class DemoChip extends StatelessWidget {
  const DemoChip({super.key});

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return Container(
      key: const Key('demoChip'),
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
      decoration: BoxDecoration(color: colors.tertiary, borderRadius: BorderRadius.circular(12)),
      child: Text(
        context.l10n.demoChip,
        style: context.text.labelMedium?.copyWith(color: colors.onTertiary, fontWeight: FontWeight.w700, letterSpacing: 1),
      ),
    );
  }
}

/// MaterialApp.builder: in demo runs, a [DemoChip] floats in the middle of the app bar on every
/// screen (it lets taps through).
Widget demoAppBuilder(BuildContext context, Widget? child) {
  final app = child ?? const SizedBox.shrink();
  if (!Demo.enabled) return app;
  return Stack(
    children: [
      app,
      Positioned(
        top: MediaQuery.paddingOf(context).top + 4,
        left: 0,
        right: 0,
        child: const IgnorePointer(
          child: Material(type: MaterialType.transparency, child: Center(child: DemoChip())),
        ),
      ),
    ],
  );
}

/// The sign-in screen's demo banner: what the demo is, and one-tap sign-in for [accounts]
/// (button label → action).
class DemoSignInPanel extends StatelessWidget {
  const DemoSignInPanel({super.key, required this.accounts, this.busy = false});

  final List<(String name, VoidCallback onTap)> accounts;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final colors = context.colors;
    return Card(
      key: const Key('demoBanner'),
      color: colors.tertiaryContainer,
      elevation: 0,
      child: Padding(
        padding: const EdgeInsets.all(Kx.s16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Icon(Icons.science_outlined, color: colors.onTertiaryContainer),
                const SizedBox(width: Kx.s8),
                Expanded(
                  child: Text(l.demoBannerTitle, style: context.text.titleMedium?.copyWith(color: colors.onTertiaryContainer)),
                ),
              ],
            ),
            const SizedBox(height: Kx.s8),
            Text(l.demoBannerBody, style: context.text.bodyMedium?.copyWith(color: colors.onTertiaryContainer)),
            for (final (i, (name, onTap)) in accounts.indexed) ...[
              const SizedBox(height: Kx.s12),
              FilledButton.tonalIcon(
                key: Key('demoSignIn$i'),
                onPressed: busy ? null : onTap,
                icon: const Icon(Icons.login),
                label: Text(l.demoSignInAs(name)),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

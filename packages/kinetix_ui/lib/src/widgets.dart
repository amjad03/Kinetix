import 'package:flutter/material.dart';

import 'theme.dart';
import 'tokens.dart';

/// Initials avatar used for teachers and students, e.g. "AS" for Anita Sharma.
class KxAvatar extends StatelessWidget {
  const KxAvatar({super.key, required this.name, this.size = 40});

  final String name;
  final double size;

  static String initials(String name) {
    final parts = name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty && !p.endsWith('.')).toList();
    if (parts.isEmpty) return '?';
    if (parts.length == 1) return parts.first.substring(0, 1).toUpperCase();
    return (parts.first[0] + parts.last[0]).toUpperCase();
  }

  @override
  Widget build(BuildContext context) {
    return CircleAvatar(
      radius: size / 2,
      backgroundColor: context.colors.primaryContainer,
      foregroundColor: context.colors.onPrimaryContainer,
      child: Text(initials(name), style: TextStyle(fontSize: size * 0.38, fontWeight: FontWeight.w500)),
    );
  }
}

/// A section title with optional trailing action, as in Google apps ("Today" ... "See all").
class KxSectionHeader extends StatelessWidget {
  const KxSectionHeader(this.title, {super.key, this.trailing});

  final String title;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s24, Kx.s16, Kx.s8),
      child: Row(children: [
        Expanded(child: Text(title, style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w500))),
        ?trailing,
      ]),
    );
  }
}

/// Centered empty / error state with an icon, a line of text and an optional action.
class KxEmptyState extends StatelessWidget {
  const KxEmptyState({super.key, required this.icon, required this.message, this.action});

  final IconData icon;
  final String message;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(Kx.s32),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Icon(icon, size: 48, color: context.colors.onSurfaceVariant),
          const SizedBox(height: Kx.s16),
          Text(message, textAlign: TextAlign.center, style: context.text.bodyLarge?.copyWith(color: context.colors.onSurfaceVariant)),
          if (action != null) ...[const SizedBox(height: Kx.s16), action!],
        ]),
      ),
    );
  }
}

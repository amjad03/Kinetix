import 'package:flutter/material.dart';

import 'theme.dart';
import 'tokens.dart';

/// The semantic tone of a tile or row: it picks the tonal container and its on-colour from the
/// theme, so the same call reads right in light and dark.
enum KxTone { primary, success, warning, danger, spark, neutral }

({Color bg, Color fg}) kxTone(BuildContext context, KxTone tone) {
  final c = context.colors;
  final dark = Theme.of(context).brightness == Brightness.dark;
  return switch (tone) {
    KxTone.primary => (bg: c.primaryContainer, fg: c.onPrimaryContainer),
    KxTone.success => dark ? (bg: KxColorDark.successContainer, fg: KxColorDark.onSuccessContainer) : (bg: KxColor.successContainer, fg: KxColor.onSuccessContainer),
    KxTone.warning => dark ? (bg: KxColorDark.warningContainer, fg: KxColorDark.onWarningContainer) : (bg: KxColor.warningContainer, fg: KxColor.onWarningContainer),
    KxTone.danger => (bg: c.errorContainer, fg: c.onErrorContainer),
    KxTone.spark => dark ? (bg: KxColorDark.sparkContainer, fg: KxColorDark.onSparkContainer) : (bg: KxColor.sparkContainer, fg: KxColor.onSparkContainer),
    KxTone.neutral => (bg: c.surfaceContainerHighest, fg: c.onSurfaceVariant),
  };
}

/// A rounded tonal square holding an icon.
class KxIconBox extends StatelessWidget {
  const KxIconBox(this.icon, {super.key, this.tone = KxTone.primary, this.size = 40});

  final IconData icon;
  final KxTone tone;
  final double size;

  @override
  Widget build(BuildContext context) {
    final t = kxTone(context, tone);
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(color: t.bg, borderRadius: Kx.radiusMd),
      child: Icon(icon, size: size * 0.55, color: t.fg),
    );
  }
}

/// A card: white on the cool-grey ground, 16 radius, a hairline border. Tappable when [onTap] is
/// given (the whole card is the 48dp target).
class KxCard extends StatelessWidget {
  const KxCard({super.key, required this.child, this.onTap, this.padding = const EdgeInsets.all(Kx.s16), this.color});

  final Widget child;
  final VoidCallback? onTap;
  final EdgeInsetsGeometry padding;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Material(
      color: color ?? Theme.of(context).cardTheme.color ?? c.surfaceContainerLowest,
      shape: RoundedRectangleBorder(borderRadius: Kx.radiusLg, side: BorderSide(color: c.outlineVariant)),
      clipBehavior: Clip.antiAlias,
      child: onTap == null
          ? Padding(padding: padding, child: child)
          : InkWell(onTap: onTap, child: Padding(padding: padding, child: child)),
    );
  }
}

/// The top of a home screen: a greeting, a line under it, and the person's avatar or a bell.
class KxHomeHeader extends StatelessWidget {
  const KxHomeHeader({super.key, required this.greeting, this.subtitle, this.trailing, this.big = false});

  final String greeting;
  final String? subtitle;
  final List<Widget>? trailing;

  /// Larger, plainer type (the parent app).
  final bool big;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s16, Kx.s8, Kx.s8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(greeting, key: const Key('greeting'), style: (big ? context.text.headlineMedium : context.text.headlineSmall)?.copyWith(fontWeight: FontWeight.w500)),
                if (subtitle != null) ...[
                  const SizedBox(height: Kx.s4),
                  Text(subtitle!, style: (big ? context.text.bodyLarge : context.text.bodyMedium)?.copyWith(color: context.colors.onSurfaceVariant)),
                ],
              ],
            ),
          ),
          ...?trailing,
        ],
      ),
    );
  }
}

/// A small tile with an icon, a label and a big value: attendance 92%, 3 pending. Two sit side by
/// side in a [KxTileGrid]; the label and value wrap rather than clip at large text sizes.
class KxStatTile extends StatelessWidget {
  const KxStatTile({super.key, required this.icon, required this.label, required this.value, this.tone = KxTone.primary, this.onTap, this.caption});

  final IconData icon;
  final String label;
  final String value;
  final KxTone tone;
  final VoidCallback? onTap;

  /// A line under the value ("this month").
  final String? caption;

  @override
  Widget build(BuildContext context) {
    return KxCard(
      onTap: onTap,
      padding: const EdgeInsets.all(Kx.s12),
      child: ConstrainedBox(
        constraints: const BoxConstraints(minHeight: Kx.target + Kx.s24),
        child: Row(
          children: [
            KxIconBox(icon, tone: tone),
            const SizedBox(width: Kx.s12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(label, style: context.text.labelMedium?.copyWith(color: context.colors.onSurfaceVariant), maxLines: 2, overflow: TextOverflow.ellipsis),
                  Text(value, style: context.text.titleLarge?.copyWith(fontWeight: FontWeight.w600), maxLines: 2, overflow: TextOverflow.ellipsis),
                  if (caption != null) Text(caption!, style: context.text.labelSmall?.copyWith(color: context.colors.onSurfaceVariant), maxLines: 2, overflow: TextOverflow.ellipsis),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Two tiles per row with equal height rows.
class KxTileGrid extends StatelessWidget {
  const KxTileGrid({super.key, required this.children, this.columns = 2});

  final List<Widget> children;
  final int columns;

  @override
  Widget build(BuildContext context) {
    final rows = <Widget>[];
    for (var i = 0; i < children.length; i += columns) {
      final row = children.skip(i).take(columns).toList();
      rows.add(
        IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              for (var j = 0; j < columns; j++) ...[
                if (j > 0) const SizedBox(width: Kx.s12),
                Expanded(child: j < row.length ? row[j] : const SizedBox.shrink()),
              ],
            ],
          ),
        ),
      );
    }
    return Column(children: [for (var i = 0; i < rows.length; i++) ...[if (i > 0) const SizedBox(height: Kx.s12), rows[i]]]);
  }
}

/// A quick action: a tonal icon and a short label under it; the whole tile is at least 48dp.
/// [spark] is for AI actions only (marigold).
class KxActionTile extends StatelessWidget {
  const KxActionTile({super.key, required this.icon, required this.label, required this.onTap, this.spark = false, this.tone = KxTone.primary});

  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final bool spark;
  final KxTone tone;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: label,
      child: InkWell(
        onTap: onTap,
        borderRadius: Kx.radiusMd,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: Kx.s8, horizontal: Kx.s4),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              KxIconBox(icon, tone: spark ? KxTone.spark : tone, size: 48),
              const SizedBox(height: Kx.s8),
              Text(label, style: context.text.labelMedium, textAlign: TextAlign.center, maxLines: 2, overflow: TextOverflow.ellipsis),
            ],
          ),
        ),
      ),
    );
  }
}

/// A grid of [KxActionTile]s, three to a row.
class KxActionGrid extends StatelessWidget {
  const KxActionGrid({super.key, required this.children, this.columns = 3});

  final List<Widget> children;
  final int columns;

  @override
  Widget build(BuildContext context) {
    final rows = <Widget>[];
    for (var i = 0; i < children.length; i += columns) {
      final row = children.skip(i).take(columns).toList();
      rows.add(
        IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [for (var j = 0; j < columns; j++) Expanded(child: j < row.length ? row[j] : const SizedBox.shrink())],
          ),
        ),
      );
    }
    return Column(children: rows);
  }
}

/// A labelled progress bar: "Database Management Systems", 65%.
class KxProgressBar extends StatelessWidget {
  const KxProgressBar({super.key, required this.value, this.label, this.tone = KxTone.primary});

  /// 0 to 1.
  final double value;
  final String? label;
  final KxTone tone;

  @override
  Widget build(BuildContext context) {
    final v = value.clamp(0.0, 1.0);
    final c = context.colors;
    return Row(
      children: [
        Expanded(
          child: ClipRRect(
            borderRadius: Kx.radiusSm,
            child: LinearProgressIndicator(value: v, minHeight: 8, backgroundColor: c.surfaceContainerHighest, color: tone == KxTone.primary ? c.primary : kxTone(context, tone).fg),
          ),
        ),
        const SizedBox(width: Kx.s12),
        Text(label ?? '${(v * 100).round()}%', style: context.text.labelLarge),
      ],
    );
  }
}

/// A row in a feed: tonal icon, a title, a line under it, and a time on the right.
class KxFeedRow extends StatelessWidget {
  const KxFeedRow({super.key, required this.icon, required this.title, this.subtitle, this.time, this.tone = KxTone.primary, this.onTap, this.unread = false});

  final IconData icon;
  final String title;
  final String? subtitle;
  final String? time;
  final KxTone tone;
  final VoidCallback? onTap;
  final bool unread;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final row = ConstrainedBox(
      constraints: const BoxConstraints(minHeight: Kx.target),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: Kx.s8),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            KxIconBox(icon, tone: tone),
            const SizedBox(width: Kx.s12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: context.text.titleSmall?.copyWith(fontWeight: unread ? FontWeight.w600 : FontWeight.w500), maxLines: 3, overflow: TextOverflow.ellipsis),
                  if (subtitle != null) Text(subtitle!, style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant), maxLines: 3, overflow: TextOverflow.ellipsis),
                ],
              ),
            ),
            if (time != null) ...[
              const SizedBox(width: Kx.s8),
              Text(time!, style: context.text.labelSmall?.copyWith(color: c.onSurfaceVariant)),
            ],
          ],
        ),
      ),
    );
    return onTap == null ? row : InkWell(onTap: onTap, borderRadius: Kx.radiusMd, child: row);
  }
}

/// Plain loading placeholder for a card or list: centred spinner with room around it.
class KxLoading extends StatelessWidget {
  const KxLoading({super.key});

  @override
  Widget build(BuildContext context) => const Padding(padding: EdgeInsets.all(Kx.s32), child: Center(child: CircularProgressIndicator()));
}

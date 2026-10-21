import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import 'models.dart';
import 'strings.dart';

/// A topic's videos, materials and animations as one list. What a tap does is the host's: the
/// Board plays videos in its panel and opens PDFs beside the writing; the phone apps hand them
/// to YouTube and the browser. When [offline], videos that need the internet are greyed and
/// marked, and a banner says the list is the one saved on the device.
class TopicResourcesView extends StatelessWidget {
  const TopicResourcesView({
    super.key,
    required this.resources,
    this.offline = false,
    this.onVideo,
    this.onMaterial,
    this.onAnimation,
    this.header,
    this.padding = const EdgeInsets.symmetric(horizontal: Kx.s16, vertical: Kx.s8),
    this.large = false,
  });

  final TopicResources resources;
  final bool offline;
  final ValueChanged<ResourceVideo>? onVideo;
  final ValueChanged<ResourceMaterial>? onMaterial;
  final ValueChanged<ResourceAnimation>? onAnimation;

  /// Above the list (the Board's topic picker).
  final Widget? header;
  final EdgeInsets padding;

  /// Board-sized touch targets.
  final bool large;

  @override
  Widget build(BuildContext context) {
    final s = ResourceStrings.of(context);
    final c = Theme.of(context).colorScheme;
    final r = resources;
    Widget section(String title, IconData icon) => Padding(
      padding: const EdgeInsets.only(top: Kx.s16, bottom: Kx.s4),
      child: Row(
        children: [
          Icon(icon, size: 20, color: c.primary),
          const SizedBox(width: Kx.s8),
          Text(title, style: Theme.of(context).textTheme.titleMedium),
        ],
      ),
    );
    return ListView(
      key: const Key('topic-resources'),
      padding: padding,
      children: [
        ?header,
        if (offline)
          Container(
            key: const Key('res-offline'),
            margin: const EdgeInsets.only(top: Kx.s8),
            padding: const EdgeInsets.all(Kx.s12),
            decoration: BoxDecoration(color: c.tertiaryContainer, borderRadius: Kx.radiusMd),
            child: Row(
              children: [
                Icon(Icons.cloud_off_outlined, color: c.onTertiaryContainer),
                const SizedBox(width: Kx.s12),
                Expanded(child: Text(s.offline, style: TextStyle(color: c.onTertiaryContainer))),
              ],
            ),
          ),
        if (r.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: Kx.s32),
            child: KxEmptyState(key: const Key('res-none'), icon: Icons.inventory_2_outlined, message: s.none),
          ),
        if (r.videos.isNotEmpty) section(s.videos, Icons.smart_display_outlined),
        for (final v in r.videos) _VideoTile(video: v, offline: offline, strings: s, large: large, onTap: onVideo),
        if (r.animations.isNotEmpty) section(s.animations, Icons.animation),
        for (final a in r.animations)
          ListTile(
            key: Key('res-animation-${a.key}'),
            minTileHeight: large ? Kx.boardTarget : null,
            contentPadding: EdgeInsets.zero,
            leading: CircleAvatar(backgroundColor: c.secondaryContainer, child: Icon(Icons.play_circle_outline, color: c.onSecondaryContainer)),
            title: Text(a.title),
            onTap: onAnimation == null ? null : () => onAnimation!(a),
          ),
        if (r.materials.isNotEmpty) section(s.materials, Icons.library_books_outlined),
        for (final m in r.materials)
          ListTile(
            key: Key('res-material-${m.id}'),
            minTileHeight: large ? Kx.boardTarget : null,
            contentPadding: EdgeInsets.zero,
            leading: CircleAvatar(backgroundColor: c.primaryContainer, child: Icon(materialIcon(m.kind), color: c.onPrimaryContainer)),
            title: Text(m.title),
            subtitle: Text([s.kind(m.kind), ?m.chapter, if (m.pages != null) s.pages(m.pages!)].join(' · ')),
            onTap: onMaterial == null ? null : () => onMaterial!(m),
          ),
      ],
    );
  }
}

IconData materialIcon(MaterialKind k) => switch (k) {
  MaterialKind.pdf => Icons.picture_as_pdf_outlined,
  MaterialKind.book => Icons.menu_book_outlined,
  MaterialKind.syllabus => Icons.list_alt_outlined,
  MaterialKind.link => Icons.link,
  MaterialKind.model3d => Icons.view_in_ar_outlined,
  MaterialKind.sim => Icons.science_outlined,
};

class _VideoTile extends StatelessWidget {
  const _VideoTile({required this.video, required this.offline, required this.strings, required this.large, this.onTap});

  final ResourceVideo video;
  final bool offline;
  final ResourceStrings strings;
  final bool large;
  final ValueChanged<ResourceVideo>? onTap;

  @override
  Widget build(BuildContext context) {
    final c = Theme.of(context).colorScheme;
    final unavailable = offline && video.needsInternet;
    final meta = [if (video.durationLabel.isNotEmpty) video.durationLabel, strings.source(video.source), if (unavailable) strings.needsInternet].join(' · ');
    final thumb = video.thumbnailUrl;
    return Opacity(
      opacity: unavailable ? 0.5 : 1,
      child: ListTile(
        key: Key('res-video-${video.id}'),
        minTileHeight: large ? 72 : null,
        contentPadding: EdgeInsets.zero,
        leading: ClipRRect(
          borderRadius: Kx.radiusSm,
          child: SizedBox(
            width: large ? 112 : 88,
            height: large ? 63 : 50,
            child: thumb == null || unavailable
                ? ColoredBox(color: c.surfaceContainerHighest, child: Icon(unavailable ? Icons.wifi_off : Icons.smart_display_outlined))
                : Image.network(thumb, fit: BoxFit.cover, errorBuilder: (_, _, _) => ColoredBox(color: c.surfaceContainerHighest, child: const Icon(Icons.smart_display_outlined))),
          ),
        ),
        title: Text(video.title, maxLines: 2, overflow: TextOverflow.ellipsis),
        subtitle: Text(meta),
        // Offline, an online-only video says why it does not play instead of failing in a player.
        onTap: onTap == null
            ? null
            : unavailable
            ? () => ScaffoldMessenger.maybeOf(context)?.showSnackBar(SnackBar(content: Text(strings.offline)))
            : () => onTap!(video),
      ),
    );
  }
}

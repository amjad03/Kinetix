import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/api.dart';
import '../../core/communication.dart';
import '../../core/files.dart';
import '../../core/format.dart';
import '../../core/l10n.dart';
import '../../widgets/common.dart';

/// The institution's announcements for this app, with the unread count for badges.
class AnnouncementsController extends ChangeNotifier {
  AnnouncementsController(this.api);

  final AnnouncementSource api;

  List<Announcement> items = [];
  int unread = 0;
  bool loading = false;
  bool loaded = false;
  ApiException? error;

  bool _disposed = false;

  @override
  void dispose() {
    _disposed = true;
    super.dispose();
  }

  @override
  void notifyListeners() {
    // A load still running when the screen that owns this closes finishes quietly.
    if (!_disposed) super.notifyListeners();
  }

  Future<void> load() async {
    loading = true;
    error = null;
    notifyListeners();
    try {
      final inbox = await api.announcements();
      items = inbox.items;
      unread = inbox.unread;
      loaded = true;
    } on ApiException catch (e) {
      error = e;
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  Announcement? byId(String id) => items.where((a) => a.id == id).firstOrNull;

  void _replace(Announcement a) {
    final i = items.indexWhere((x) => x.id == a.id);
    if (i < 0) return;
    final wasUnread = items[i].unread;
    items[i] = a;
    if (wasUnread && !a.unread) unread = (unread - 1).clamp(0, 1 << 30);
    // Acknowledged ones are no longer pinned: keep pinned first.
    items = [...items.where((x) => x.pinned), ...items.where((x) => !x.pinned)];
    notifyListeners();
  }

  Future<Announcement> markRead(Announcement a) async {
    if (!a.unread) return a;
    final updated = await api.markAnnouncementRead(a.id);
    _replace(updated);
    return updated;
  }

  Future<Announcement> acknowledge(Announcement a) async {
    final updated = await api.acknowledgeAnnouncement(a.id);
    _replace(updated);
    return updated;
  }
}

/// Announcements: important ones pinned on top until they expire or are acknowledged, then the rest
/// newest first. Opening one marks it read.
class AnnouncementsScreen extends StatelessWidget {
  const AnnouncementsScreen({super.key, required this.controller, this.openFile = openWithSystem});

  final AnnouncementsController controller;
  final OpenFile openFile;

  static Future<void> open(BuildContext context, AnnouncementsController controller) {
    controller.load();
    return Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => AnnouncementsScreen(controller: controller)));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(context.l10n.inboxTitle)),
      body: ListenableBuilder(
        listenable: controller,
        builder: (context, _) {
          final items = controller.items;
          if (controller.error != null && items.isEmpty) {
            return Padding(padding: const EdgeInsets.all(Kx.s16), child: ErrorBanner.api(controller.error!, onRetry: controller.load));
          }
          if (!controller.loaded && controller.loading) return const Center(child: CircularProgressIndicator());
          final pinned = items.where((a) => a.pinned).toList();
          final rest = items.where((a) => !a.pinned).toList();
          return RefreshIndicator(
            onRefresh: controller.load,
            child: items.isEmpty
                ? ListView(children: [SizedBox(height: 360, child: KxEmptyState(icon: Icons.campaign_outlined, message: context.l10n.inboxEmpty))])
                : ListView(
                    key: const Key('announcementList'),
                    padding: const EdgeInsets.only(bottom: Kx.s32),
                    children: [
                      if (pinned.isNotEmpty) _Header(context.l10n.inboxPinned, icon: Icons.push_pin_outlined),
                      for (final a in pinned) AnnouncementTile(announcement: a, onTap: () => AnnouncementDetailScreen.open(context, controller, a, openFile: openFile)),
                      if (pinned.isNotEmpty && rest.isNotEmpty) _Header(context.l10n.inboxEarlier),
                      for (final a in rest) AnnouncementTile(announcement: a, onTap: () => AnnouncementDetailScreen.open(context, controller, a, openFile: openFile)),
                    ],
                  ),
          );
        },
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header(this.label, {this.icon});

  final String label;
  final IconData? icon;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s16, Kx.s16, Kx.s4),
    child: Row(
      children: [
        if (icon != null) ...[Icon(icon, size: 16, color: context.colors.primary), const SizedBox(width: Kx.s4)],
        Text(label, style: context.text.titleSmall?.copyWith(color: context.colors.primary)),
      ],
    ),
  );
}

/// One announcement in the list: title, a preview, when, and whether it is important or unread.
class AnnouncementTile extends StatelessWidget {
  const AnnouncementTile({super.key, required this.announcement, required this.onTap});

  final Announcement announcement;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final a = announcement;
    return InkWell(
      key: Key('announcement-${a.id}'),
      onTap: onTap,
      child: Container(
        color: a.unread ? c.primaryContainer.withValues(alpha: 0.25) : null,
        padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s12, Kx.s16, Kx.s12),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            CircleAvatar(
              radius: 20,
              backgroundColor: a.important ? c.tertiaryContainer : c.secondaryContainer,
              child: Icon(a.important ? Icons.priority_high : Icons.campaign_outlined, color: a.important ? c.onTertiaryContainer : c.onSecondaryContainer, size: 20),
            ),
            const SizedBox(width: Kx.s12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          a.title,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: context.text.titleSmall?.copyWith(fontWeight: a.unread ? FontWeight.w700 : FontWeight.w500),
                        ),
                      ),
                      const SizedBox(width: Kx.s8),
                      Text(Fmt.of(context).stamp(a.sentAt, DateTime.now()), style: context.text.labelMedium?.copyWith(color: c.onSurfaceVariant)),
                    ],
                  ),
                  const SizedBox(height: 2),
                  Text(plainText(a.body), maxLines: 2, overflow: TextOverflow.ellipsis, style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant)),
                  if (a.important || a.attachments.isNotEmpty || (a.canAcknowledge && a.acknowledgedAt == null)) ...[
                    const SizedBox(height: Kx.s4),
                    Wrap(
                      spacing: Kx.s8,
                      runSpacing: Kx.s4,
                      children: [
                        if (a.important) Pill(context.l10n.inboxImportant, background: c.tertiaryContainer, foreground: c.onTertiaryContainer),
                        if (a.canAcknowledge && a.acknowledgedAt == null) Pill(context.l10n.inboxAckNeeded, background: c.errorContainer, foreground: c.onErrorContainer),
                        if (a.attachments.isNotEmpty) Pill(context.l10n.inboxFileCount(a.attachments.length), icon: Icons.attach_file, background: c.surfaceContainerHighest, foreground: c.onSurfaceVariant),
                      ],
                    ),
                  ],
                ],
              ),
            ),
            if (a.unread) ...[
              const SizedBox(width: Kx.s8),
              Container(key: Key('announcementUnread-${a.id}'), width: 10, height: 10, margin: const EdgeInsets.only(top: 6), decoration: BoxDecoration(color: c.primary, shape: BoxShape.circle)),
            ],
          ],
        ),
      ),
    );
  }
}

/// One announcement: the full text, its files, and the Acknowledge button. Opening it marks it read.
class AnnouncementDetailScreen extends StatefulWidget {
  const AnnouncementDetailScreen({super.key, required this.controller, required this.announcement, this.openFile = openWithSystem});

  final AnnouncementsController controller;
  final Announcement announcement;
  final OpenFile openFile;

  static Future<void> open(BuildContext context, AnnouncementsController controller, Announcement a, {OpenFile openFile = openWithSystem}) =>
      Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => AnnouncementDetailScreen(controller: controller, announcement: a, openFile: openFile)));

  @override
  State<AnnouncementDetailScreen> createState() => _AnnouncementDetailScreenState();
}

class _AnnouncementDetailScreenState extends State<AnnouncementDetailScreen> {
  late Announcement _a = widget.announcement;
  bool _acking = false;
  String? _opening;

  @override
  void initState() {
    super.initState();
    _markRead();
  }

  Future<void> _markRead() async {
    try {
      final a = await widget.controller.markRead(_a);
      if (mounted) setState(() => _a = a);
    } on ApiException {
      // It stays unread; the next open marks it.
    }
  }

  void _snack(String text) => ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(text)));

  Future<void> _ack() async {
    setState(() => _acking = true);
    try {
      final a = await widget.controller.acknowledge(_a);
      if (mounted) setState(() => _a = a);
    } on ApiException catch (e) {
      if (mounted) _snack(context.l10n.errorText(e));
    } finally {
      if (mounted) setState(() => _acking = false);
    }
  }

  Future<void> _open(AttachedFile f) async {
    setState(() => _opening = f.id);
    try {
      final bytes = await widget.controller.api.announcementFile(_a.id, f.id);
      final ok = await widget.openFile(bytes, f.name, f.type);
      if (!ok && mounted) _snack(context.l10n.inboxFileFailed);
    } on ApiException catch (e) {
      if (mounted) _snack(context.l10n.errorText(e));
    } finally {
      if (mounted) setState(() => _opening = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final a = _a;
    return Scaffold(
      appBar: AppBar(title: Text(context.l10n.inboxTitle)),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s8, Kx.s16, Kx.s32),
        children: [
          if (a.important) Align(alignment: Alignment.centerLeft, child: Pill(context.l10n.inboxImportant, icon: Icons.priority_high, background: c.tertiaryContainer, foreground: c.onTertiaryContainer)),
          const SizedBox(height: Kx.s8),
          Text(a.title, key: const Key('announcementTitle'), style: context.text.headlineSmall),
          const SizedBox(height: Kx.s4),
          Text(
            [context.l10n.inboxFrom(a.senderName), _when(context, a.sentAt), if (a.expiresAt != null) context.l10n.inboxUntil(_when(context, a.expiresAt!))].join(' · '),
            style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant),
          ),
          const SizedBox(height: Kx.s16),
          RichBody(a.body),
          if (a.attachments.isNotEmpty) ...[
            const SizedBox(height: Kx.s24),
            Text(context.l10n.inboxFiles, style: context.text.titleSmall),
            const SizedBox(height: Kx.s8),
            for (final f in a.attachments)
              Card(
                margin: const EdgeInsets.only(bottom: Kx.s8),
                child: ListTile(
                  key: Key('announcementFile-${f.id}'),
                  leading: Icon(f.isPdf ? Icons.picture_as_pdf_outlined : Icons.image_outlined, color: c.primary),
                  title: Text(f.name, maxLines: 1, overflow: TextOverflow.ellipsis),
                  subtitle: Text(f.sizeLabel),
                  trailing: _opening == f.id ? const SizedBox(width: 24, height: 24, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.open_in_new),
                  onTap: _opening == null ? () => _open(f) : null,
                ),
              ),
          ],
          if (a.canAcknowledge) ...[
            const SizedBox(height: Kx.s24),
            if (a.acknowledgedAt != null)
              Row(
                key: const Key('announcementAcknowledged'),
                children: [
                  Icon(Icons.check_circle, color: c.primary),
                  const SizedBox(width: Kx.s8),
                  Expanded(child: Text(context.l10n.inboxAcknowledgedOn(_when(context, a.acknowledgedAt!)), style: context.text.bodyMedium)),
                ],
              )
            else ...[
              Text(context.l10n.inboxAckPrompt, style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant)),
              const SizedBox(height: Kx.s8),
              FilledButton.icon(
                key: const Key('acknowledgeAnnouncement'),
                onPressed: _acking ? null : _ack,
                icon: _acking ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.done),
                label: Text(context.l10n.inboxAcknowledge),
              ),
            ],
          ],
        ],
      ),
    );
  }
}

/// The light rich text of announcements: paragraphs, bullet and numbered lists, bold and links.
class RichBody extends StatefulWidget {
  const RichBody(this.body, {super.key});

  final String body;

  @override
  State<RichBody> createState() => _RichBodyState();
}

class _RichBodyState extends State<RichBody> {
  final _taps = <TapGestureRecognizer>[];

  @override
  void dispose() {
    for (final t in _taps) {
      t.dispose();
    }
    super.dispose();
  }

  TextSpan _runs(BuildContext context, List<RichRun> runs) {
    final c = context.colors;
    return TextSpan(
      children: [
        for (final r in runs)
          switch (r) {
            BoldRun() => TextSpan(text: r.text, style: const TextStyle(fontWeight: FontWeight.w700)),
            LinkRun() => TextSpan(
              text: r.text,
              style: TextStyle(color: c.primary, decoration: TextDecoration.underline),
              recognizer: (TapGestureRecognizer()..onTap = () => launchUrl(Uri.parse(r.url), mode: LaunchMode.externalApplication)).also(_taps.add),
            ),
            PlainRun() => TextSpan(text: r.text),
          },
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    for (final t in _taps) {
      t.dispose();
    }
    _taps.clear();
    final style = context.text.bodyLarge;
    return Column(
      key: const Key('richBody'),
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (final b in parseRich(widget.body))
          Padding(
            padding: const EdgeInsets.only(bottom: Kx.s12),
            child: switch (b.kind) {
              RichBlockKind.paragraph => Text.rich(TextSpan(children: [for (final (i, l) in b.lines.indexed) ...[if (i > 0) const TextSpan(text: '\n'), _runs(context, l)]]), style: style),
              RichBlockKind.bullets || RichBlockKind.numbers => Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  for (final (i, l) in b.lines.indexed)
                    Padding(
                      padding: const EdgeInsets.only(bottom: Kx.s4),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          SizedBox(width: 24, child: Text(b.kind == RichBlockKind.bullets ? '•' : '${i + 1}.', style: style)),
                          Expanded(child: Text.rich(_runs(context, l), style: style)),
                        ],
                      ),
                    ),
                ],
              ),
            },
          ),
      ],
    );
  }
}

/// The way into announcements from a list: how many are unread, and the pinned one if any.
class AnnouncementsCard extends StatelessWidget {
  const AnnouncementsCard({super.key, required this.controller});

  final AnnouncementsController controller;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final pinned = controller.items.where((a) => a.pinned).firstOrNull;
    return Card(
      margin: const EdgeInsets.fromLTRB(Kx.s16, Kx.s8, Kx.s16, Kx.s4),
      color: pinned != null ? c.tertiaryContainer : null,
      child: ListTile(
        key: const Key('openAnnouncements'),
        leading: Badge(
          key: const Key('announcementsBadge'),
          isLabelVisible: controller.unread > 0,
          label: Text('${controller.unread}'),
          child: Icon(Icons.campaign_outlined, color: pinned != null ? c.onTertiaryContainer : c.primary),
        ),
        title: Text(context.l10n.inboxTitle),
        subtitle: Text(
          pinned?.title ?? (controller.unread > 0 ? context.l10n.inboxUnread(controller.unread) : context.l10n.inboxAllRead),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
        trailing: const Icon(Icons.chevron_right),
        onTap: () => AnnouncementsScreen.open(context, controller),
      ),
    );
  }
}

extension<T> on T {
  /// Passes the value to [f] and returns it (for registering recognizers inline).
  T also(void Function(T) f) {
    f(this);
    return this;
  }
}

/// "Tue, 6 Oct, 10:24 AM".
String _when(BuildContext context, DateTime d) {
  final f = Fmt.of(context);
  return '${f.shortDay(d)}, ${f.time(d)}';
}

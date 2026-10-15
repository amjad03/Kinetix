import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:zynetix_ui/zynetix_ui.dart';

import '../../core/api.dart';
import '../../core/attachments.dart';
import '../../core/files.dart';
import '../../core/format.dart';
import '../../core/models.dart';
import '../../l10n/l10n.dart';
import '../../widgets/common.dart';
import 'messages_controller.dart';

/// One conversation with a teacher: bubbles grouped by day, newest at the bottom. Pull down for
/// earlier messages. Opening it (and every new reply while it is open) marks it read.
class ChatScreen extends StatefulWidget {
  const ChatScreen({super.key, required this.controller, required this.conversationId, this.initial});

  final MessagesController controller;
  final String conversationId;

  /// Shown in the title while the thread loads.
  final Conversation? initial;

  /// How often an open conversation checks for replies while the realtime connection is down
  /// (when it is up, `message.new` brings them).
  static Duration pollEvery = const Duration(seconds: 15);

  static Future<void> open(BuildContext context, MessagesController controller, String conversationId, {Conversation? initial}) async {
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) =>
            ChatScreen(controller: controller, conversationId: conversationId, initial: initial ?? controller.byId(conversationId)),
      ),
    );
    // Previews and unread counts changed while it was open.
    controller.load();
  }

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  static const _pageSize = 50;

  StudentApi get api => widget.controller.api;
  String get meId => widget.controller.meId;

  late Conversation? _conversation = widget.initial;
  final _items = <ChatMessage>[];
  bool _loading = true;
  ApiException? _error;
  bool _hasOlder = false;
  bool _sending = false;
  final _text = TextEditingController();
  final _scroll = ScrollController();

  /// A photo or PDF waiting to go with the next message.
  UploadFile? _file;

  /// From the last page: whether the family may write, and the office hours note.
  bool _canWrite = true;
  ({String start, String end})? _afterHours;
  Timer? _poll;
  StreamSubscription<Object>? _incoming;

  @override
  void initState() {
    super.initState();
    _loadLatest(first: true);
    _poll = Timer.periodic(ChatScreen.pollEvery, (_) {
      if (!widget.controller.realtime()) _loadLatest();
    });
    _incoming = widget.controller.incoming.where((m) => m.conversationId == widget.conversationId).listen((_) => _loadLatest());
  }

  @override
  void dispose() {
    _poll?.cancel();
    _incoming?.cancel();
    _text.dispose();
    _scroll.dispose();
    super.dispose();
  }

  void _merge(Iterable<ChatMessage> page) {
    final known = {for (final m in _items) m.id};
    _items
      ..addAll(page.where((m) => !known.contains(m.id)))
      ..sort((a, b) => a.createdAt.compareTo(b.createdAt));
  }

  /// Jumps to the newest message. Twice: the list only knows its full length once the rows near
  /// the end are laid out.
  void _toBottom([int again = 1]) => WidgetsBinding.instance.addPostFrameCallback((_) {
    if (!_scroll.hasClients) return;
    final max = _scroll.position.maxScrollExtent;
    _scroll.jumpTo(max);
    if (again > 0) _toBottom(again - 1);
  });

  Future<void> _loadLatest({bool first = false}) async {
    try {
      final page = await api.messages(widget.conversationId);
      if (!mounted) return;
      final before = _items.length;
      final atBottom = !_scroll.hasClients || _scroll.position.extentAfter < 80;
      setState(() {
        _conversation = page.conversation;
        // Ticks change on messages already shown: the newest page replaces them.
        final fresh = {for (final m in page.messages) m.id};
        _items.removeWhere((m) => fresh.contains(m.id));
        _merge(page.messages);
        _canWrite = page.canWrite;
        _afterHours = page.afterHours ? page.officeHours : null;
        if (first) _hasOlder = page.messages.length >= _pageSize;
        _loading = false;
        _error = null;
      });
      if (first || (_items.length > before && atBottom)) _toBottom();
      if (first || page.conversation.unread > 0) _markRead();
    } on ApiException catch (e) {
      if (!mounted) return;
      // A failed background check keeps what is on screen.
      if (first || _items.isEmpty) {
        setState(() {
          _loading = false;
          _error = e;
        });
      }
    }
  }

  Future<void> _markRead() async {
    widget.controller.seen(widget.conversationId);
    try {
      await api.markConversationRead(widget.conversationId);
    } on ApiException {
      // The next open marks it again.
    }
  }

  Future<void> _loadOlder() async {
    if (!_hasOlder || _items.isEmpty) return;
    try {
      final page = await api.messages(widget.conversationId, before: _items.first.createdAt);
      if (!mounted) return;
      setState(() {
        _merge(page.messages);
        _hasOlder = page.messages.length >= _pageSize;
      });
    } on ApiException catch (e) {
      if (mounted) _snack(context.errorText(e));
    }
  }

  void _snack(String text) => ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(text)));

  Future<void> _send() async {
    final body = _text.text.trim();
    if ((body.isEmpty && _file == null) || _sending) return;
    setState(() => _sending = true);
    try {
      final m = await api.sendMessage(widget.conversationId, body, attachment: _file);
      if (!mounted) return;
      _text.clear();
      setState(() {
        _file = null;
        _merge([m]);
      });
      _toBottom();
      // Ticks and the office-hours note come with the page.
      _loadLatest();
    } on ApiException catch (e) {
      if (mounted) _snack(context.l10n.couldNotSend(context.errorText(e)));
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  /// Chooses a photo (camera or gallery) or a PDF to send.
  Future<void> _attach() async {
    final source = await showModalBottomSheet<AttachmentSource>(
      context: context,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(key: const Key('attachCamera'), leading: const Icon(Icons.photo_camera_outlined), title: Text(context.l10n.chatCamera), onTap: () => Navigator.pop(context, AttachmentSource.camera)),
            ListTile(key: const Key('attachGallery'), leading: const Icon(Icons.photo_library_outlined), title: Text(context.l10n.chatGallery), onTap: () => Navigator.pop(context, AttachmentSource.gallery)),
            ListTile(key: const Key('attachPdf'), leading: const Icon(Icons.picture_as_pdf_outlined), title: Text(context.l10n.chatPdf), onTap: () => Navigator.pop(context, AttachmentSource.pdf)),
          ],
        ),
      ),
    );
    if (source == null) return;
    final files = await AttachmentPicker.instance.pick(source, max: 1);
    if (files.isEmpty || !mounted) return;
    final f = files.first;
    if (!const ['image/jpeg', 'image/png', 'application/pdf'].contains(f.mime)) return _snack(context.l10n.chatFileType);
    if (f.bytes.length > chatMaxBytes) return _snack(context.l10n.chatFileTooBig);
    setState(() => _file = f);
  }

  Future<void> _openFile(ChatMessage m) async {
    final f = m.attachment;
    if (f == null) return;
    try {
      final bytes = await api.messageFile(widget.conversationId, m.id);
      final ok = await openWithSystem(bytes, f.name, f.type);
      if (!ok && mounted) _snack(context.l10n.inboxFileFailed);
    } on ApiException catch (e) {
      if (mounted) _snack(context.errorText(e));
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final conv = _conversation;
    final now = DateTime.now();
    return Scaffold(
      appBar: AppBar(
        titleSpacing: 0,
        title: Row(
          children: [
            if (conv != null) ...[KxAvatar(name: conv.staff.fullName, size: 36), const SizedBox(width: Kx.s12)],
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(conv == null ? context.l10n.message : conv.office ? context.l10n.chatOffice : conv.staff.fullName, maxLines: 1, overflow: TextOverflow.ellipsis),
                  if (conv != null)
                    Text(
                      conv.className,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
      body: Column(
        children: [
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : _error != null
                ? Padding(
                    padding: const EdgeInsets.all(Kx.s16),
                    child: Align(
                      alignment: Alignment.topCenter,
                      child: ErrorBanner(
                        _error!,
                        onRetry: () {
                          setState(() => _loading = true);
                          _loadLatest(first: true);
                        },
                      ),
                    ),
                  )
                : RefreshIndicator(
                    onRefresh: _loadOlder,
                    child: ListView(
                      key: const Key('chatList'),
                      controller: _scroll,
                      physics: const AlwaysScrollableScrollPhysics(),
                      padding: const EdgeInsets.fromLTRB(Kx.s12, Kx.s8, Kx.s12, Kx.s8),
                      children: [
                        if (_hasOlder)
                          Padding(
                            padding: const EdgeInsets.all(Kx.s8),
                            child: Text(
                              context.l10n.pullForEarlier,
                              textAlign: TextAlign.center,
                              style: context.text.labelMedium?.copyWith(color: c.onSurfaceVariant),
                            ),
                          ),
                        if (_items.isEmpty && conv != null)
                          Padding(
                            padding: const EdgeInsets.symmetric(vertical: Kx.s32, horizontal: Kx.s16),
                            child: Text(
                              '${context.l10n.writeToAbout(conv.staff.fullName)} ${context.l10n.teachersReply}',
                              textAlign: TextAlign.center,
                              style: context.text.bodyLarge?.copyWith(color: c.onSurfaceVariant),
                            ),
                          ),
                        for (final (i, m) in _items.indexed) ...[
                          if (i == 0 || Fmt.daysBetween(_items[i - 1].createdAt, m.createdAt) != 0)
                            _DayChip(context.fmt.relativeDay(m.createdAt, now)),
                          if (m.system) _SystemLine(m) else MessageBubble(message: m, mine: m.senderId == meId, onOpenFile: () => _openFile(m)),
                        ],
                      ],
                    ),
                  ),
          ),
          if (_afterHours != null)
            Container(
              key: const Key('afterHoursNote'),
              width: double.infinity,
              color: c.secondaryContainer,
              padding: const EdgeInsets.symmetric(horizontal: Kx.s16, vertical: Kx.s8),
              child: Text(context.l10n.chatAfterHours(_afterHours!.start, _afterHours!.end), style: context.text.bodySmall?.copyWith(color: c.onSecondaryContainer)),
            ),
          if (_file != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(Kx.s12, Kx.s8, Kx.s12, 0),
              child: InputChip(
                key: const Key('pendingAttachment'),
                avatar: Icon(_file!.isImage ? Icons.image_outlined : Icons.picture_as_pdf_outlined),
                label: Text(_file!.name, overflow: TextOverflow.ellipsis),
                onDeleted: () => setState(() => _file = null),
              ),
            ),
          const Divider(height: 1),
          if (!_canWrite)
            SafeArea(
              top: false,
              child: Padding(
                key: const Key('chatClosed'),
                padding: const EdgeInsets.all(Kx.s16),
                child: Text(context.l10n.chatClosedFamily, textAlign: TextAlign.center, style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant)),
              ),
            )
          else
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(Kx.s12, Kx.s8, Kx.s8, Kx.s8),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  IconButton(
                    key: const Key('attachFile'),
                    tooltip: context.l10n.chatAttach,
                    onPressed: _loading || _error != null || _sending ? null : _attach,
                    icon: const Icon(Icons.attach_file),
                  ),
                  Expanded(
                    child: TextField(
                      key: const Key('messageField'),
                      controller: _text,
                      minLines: 1,
                      maxLines: 5,
                      maxLength: 2000,
                      enabled: !_loading && _error == null,
                      textCapitalization: TextCapitalization.sentences,
                      buildCounter: (context, {required currentLength, required isFocused, maxLength}) =>
                          currentLength > 1800 ? Text('$currentLength / $maxLength') : null,
                      decoration: InputDecoration(
                        hintText: context.l10n.message,
                        filled: true,
                        fillColor: c.surfaceContainerHigh,
                        border: const OutlineInputBorder(borderRadius: Kx.radiusXl, borderSide: BorderSide.none),
                        enabledBorder: const OutlineInputBorder(borderRadius: Kx.radiusXl, borderSide: BorderSide.none),
                        focusedBorder: OutlineInputBorder(
                          borderRadius: Kx.radiusXl,
                          borderSide: BorderSide(color: c.primary, width: 1.5),
                        ),
                        contentPadding: const EdgeInsets.symmetric(horizontal: Kx.s16, vertical: Kx.s12),
                      ),
                      onSubmitted: (_) => _send(),
                    ),
                  ),
                  const SizedBox(width: Kx.s8),
                  ListenableBuilder(
                    listenable: _text,
                    builder: (context, _) => IconButton.filled(
                      key: const Key('sendMessage'),
                      tooltip: context.l10n.send,
                      onPressed: (_text.text.trim().isEmpty && _file == null) || _sending ? null : _send,
                      icon: _sending
                          ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                          : const Icon(Icons.send),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _DayChip extends StatelessWidget {
  const _DayChip(this.label);

  final String label;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: Kx.s12),
    child: Center(
      child: Pill(label, background: context.colors.surfaceContainerHighest, foreground: context.colors.onSurfaceVariant),
    ),
  );
}

/// A chat bubble: the student's on the right in the accent colour, the teacher's on the left.
/// The largest file a chat message takes (services/api common/blob.ts).
const chatMaxBytes = 4000000;

/// "Closed by …", "Assigned to …": a centred line, not a bubble.
class _SystemLine extends StatelessWidget {
  const _SystemLine(this.message);

  final ChatMessage message;

  @override
  Widget build(BuildContext context) => Padding(
    key: Key('system-${message.id}'),
    padding: const EdgeInsets.symmetric(vertical: Kx.s8),
    child: Text(
      '${message.body} · ${context.fmt.time(message.createdAt)}',
      textAlign: TextAlign.center,
      style: context.text.labelMedium?.copyWith(color: context.colors.onSurfaceVariant),
    ),
  );
}

class MessageBubble extends StatelessWidget {
  const MessageBubble({super.key, required this.message, required this.mine, this.onOpenFile});

  final ChatMessage message;
  final bool mine;

  /// Opens the message's photo or PDF.
  final VoidCallback? onOpenFile;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final (bg, fg) = mine ? (c.primary, c.onPrimary) : (c.surfaceContainerHigh, c.onSurface);
    const r = Radius.circular(Kx.rLg);
    const tail = Radius.circular(Kx.rXs);
    // Long press copies the text (selectable text would fight the list's scrolling).
    Future<void> copy() async {
      await Clipboard.setData(ClipboardData(text: message.body));
      if (!context.mounted) return;
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text(context.l10n.messageCopied)));
    }

    return Align(
      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
      child: ConstrainedBox(
        constraints: BoxConstraints(maxWidth: MediaQuery.sizeOf(context).width * 0.78),
        child: GestureDetector(
          onLongPress: copy,
          child: Container(
            key: Key('message-${message.id}'),
            margin: const EdgeInsets.symmetric(vertical: 3),
            padding: const EdgeInsets.fromLTRB(Kx.s12, Kx.s8, Kx.s12, Kx.s8),
            decoration: BoxDecoration(
              color: bg,
              borderRadius: BorderRadius.only(topLeft: r, topRight: r, bottomLeft: mine ? r : tail, bottomRight: mine ? tail : r),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                if (message.attachment != null)
                  InkWell(
                    key: Key('messageFile-${message.id}'),
                    onTap: onOpenFile,
                    borderRadius: Kx.radiusMd,
                    child: Container(
                      margin: const EdgeInsets.only(bottom: Kx.s4),
                      padding: const EdgeInsets.all(Kx.s8),
                      decoration: BoxDecoration(color: c.surface.withValues(alpha: mine ? 0.9 : 0.6), borderRadius: Kx.radiusMd),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(message.attachment!.isPdf ? Icons.picture_as_pdf_outlined : Icons.image_outlined, color: c.primary),
                          const SizedBox(width: Kx.s8),
                          Flexible(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(message.attachment!.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: context.text.bodyMedium?.copyWith(color: c.onSurface)),
                                Text(message.attachment!.sizeLabel, style: context.text.labelSmall?.copyWith(color: c.onSurfaceVariant)),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                if (message.body.isNotEmpty) Text(message.body, style: context.text.bodyLarge?.copyWith(color: fg)),
                const SizedBox(height: 2),
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(context.fmt.time(message.createdAt), style: context.text.labelSmall?.copyWith(color: fg.withValues(alpha: 0.75))),
                    if (mine && message.tick != null) ...[
                      const SizedBox(width: Kx.s4),
                      Icon(
                        message.tick == MessageTick.sent ? Icons.done : Icons.done_all,
                        key: Key('tick-${message.id}-${message.tick!.name}'),
                        size: 14,
                        semanticLabel: switch (message.tick!) {
                          MessageTick.sent => context.l10n.chatTickSent,
                          MessageTick.delivered => context.l10n.chatTickDelivered,
                          MessageTick.read => context.l10n.chatTickRead,
                        },
                        color: message.tick == MessageTick.read ? Colors.lightBlueAccent : fg.withValues(alpha: 0.75),
                      ),
                    ],
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

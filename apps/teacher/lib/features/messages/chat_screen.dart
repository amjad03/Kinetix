import 'dart:async';

import 'package:flutter/material.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';
import 'package:zynetix_ui/zynetix_ui.dart';

import '../../core/api.dart';
import '../../core/files.dart';
import '../../core/format.dart';
import '../../core/l10n.dart';
import '../../core/models.dart';
import '../../core/realtime.dart';
import '../../widgets/common.dart';

/// A message on screen: sent, still sending, or failed to send.
class ChatBubble {
  ChatBubble(this.message, {this.sending = false, this.failed = false, this.upload});

  final ChatMessage message;
  bool sending;
  bool failed;

  /// The photo going with it, kept for a retry.
  final ChatUpload? upload;
}

/// Picks a photo to send (camera or gallery), scaled for a chat.
typedef PickChatPhoto = Future<ChatUpload?> Function(ImageSource source);

/// The photo picker chats use; tests replace it.
PickChatPhoto chatPhotoPicker = pickChatPhoto;

Future<ChatUpload?> pickChatPhoto(ImageSource source) async {
  final x = await ImagePicker().pickImage(source: source, maxWidth: 2000, maxHeight: 2000, imageQuality: 80);
  if (x == null) return null;
  final name = x.name.toLowerCase().endsWith('.png') ? x.name : (x.name.contains('.') ? '${x.name.substring(0, x.name.lastIndexOf('.'))}.jpg' : '${x.name}.jpg');
  return ChatUpload(name: name, mime: name.endsWith('.png') ? 'image/png' : 'image/jpeg', bytes: await x.readAsBytes());
}

/// Picks a PDF (a circular, a form, a marks sheet) to send.
typedef PickChatPdf = Future<ChatUpload?> Function();

/// The PDF picker chats use; tests replace it.
PickChatPdf chatPdfPicker = pickChatPdf;

Future<ChatUpload?> pickChatPdf() async {
  final f = await FilePicker.pickFile(type: FileType.custom, allowedExtensions: const ['pdf']);
  final x = f?.xFile;
  if (x == null || !x.name.toLowerCase().endsWith('.pdf')) return null;
  return ChatUpload(name: x.name, mime: 'application/pdf', bytes: await x.readAsBytes());
}

enum _AttachFrom { camera, gallery, pdf }

/// The largest file a chat message takes (services/api common/blob.ts).
const chatMaxBytes = 4000000;

/// One thread with a family: newest at the bottom, pull down for earlier messages.
class ChatController extends ChangeNotifier {
  ChatController({required this.api, required this.conversation, required this.myId});

  final TeacherApi api;
  final String myId;
  Conversation conversation;

  /// Oldest first.
  final bubbles = <ChatBubble>[];
  bool loading = false;
  bool loadingOlder = false;
  bool hasMore = false;
  ApiException? error;
  int _localId = 0;

  Future<void> load() async {
    loading = true;
    error = null;
    notifyListeners();
    try {
      final page = await api.conversationMessages(conversation.id);
      conversation = page.conversation.copyWith(unread: 0);
      bubbles
        ..clear()
        ..addAll(page.messages.map(ChatBubble.new));
      hasMore = page.messages.length >= ChatPage.pageSize;
      await _markRead();
    } on ApiException catch (e) {
      error = e;
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  /// Fetches the newest page and adds messages not on screen yet (one just arrived). Messages
  /// still sending or failed stay where they are, at the bottom.
  Future<bool> refresh() async {
    if (loading) return false;
    try {
      final page = await api.conversationMessages(conversation.id);
      final have = {for (final b in bubbles) b.message.id};
      final fresh = [
        for (final m in page.messages)
          if (!have.contains(m.id)) m,
      ];
      // Ticks change on messages already shown (the family read them).
      final byId = {for (final m in page.messages) m.id: m};
      var ticked = false;
      for (final (i, b) in bubbles.indexed) {
        final now = byId[b.message.id];
        if (now != null && !b.sending && !b.failed && now.tick != b.message.tick) {
          bubbles[i] = ChatBubble(now);
          ticked = true;
        }
      }
      final changed = page.conversation.status != conversation.status || page.conversation.muted != conversation.muted;
      if (fresh.isEmpty && !ticked && !changed) return false;
      final pending = [
        for (final b in bubbles)
          if (b.sending || b.failed) b,
      ];
      bubbles
        ..removeWhere(pending.contains)
        ..addAll(fresh.map(ChatBubble.new))
        ..addAll(pending);
      conversation = page.conversation.copyWith(unread: 0);
      error = null;
      notifyListeners();
      await _markRead();
      return true;
    } on ApiException {
      // Offline: the message shows on the next refresh.
      return false;
    }
  }

  Future<void> _markRead() async {
    try {
      await api.markConversationRead(conversation.id);
    } on ApiException {
      // The badge comes back on the next inbox refresh; nothing to tell the teacher.
    }
  }

  Future<void> loadOlder() async {
    if (!hasMore || loadingOlder || bubbles.isEmpty) return;
    loadingOlder = true;
    notifyListeners();
    try {
      final page = await api.conversationMessages(conversation.id, before: bubbles.first.message.createdAt);
      bubbles.insertAll(0, page.messages.map(ChatBubble.new));
      hasMore = page.messages.length >= ChatPage.pageSize;
    } on ApiException catch (e) {
      error = e;
    } finally {
      loadingOlder = false;
      notifyListeners();
    }
  }

  /// Shows the message straight away and sends it; a failed one can be retried.
  Future<void> send(String body, {ChatUpload? upload}) async {
    final id = 'local-${_localId++}';
    final b = ChatBubble(
      ChatMessage(
        id: id,
        senderId: myId,
        body: body,
        createdAt: DateTime.now(),
        attachment: upload == null ? null : AttachedFile(id: id, name: upload.name, type: upload.mime, size: upload.bytes.length),
      ),
      sending: true,
      upload: upload,
    );
    bubbles.add(b);
    notifyListeners();
    await _deliver(b);
  }

  Future<void> retry(ChatBubble b) async {
    b
      ..failed = false
      ..sending = true;
    notifyListeners();
    await _deliver(b);
  }

  Future<void> _deliver(ChatBubble b) async {
    try {
      final sent = await api.sendMessage(conversation.id, b.message.body, attachment: b.upload);
      final i = bubbles.indexOf(b);
      if (i >= 0) bubbles[i] = ChatBubble(sent);
      conversation = conversation.copyWith(lastMessage: sent.body.isEmpty ? sent.attachment?.name : sent.body, lastMessageAt: sent.createdAt, unread: 0);
    } on ApiException {
      b
        ..sending = false
        ..failed = true;
    }
    notifyListeners();
  }

  /// Close, reopen or resolve the thread (the system line comes with the refresh).
  Future<void> setStatus(ThreadStatus status) async {
    conversation = (await api.setConversationStatus(conversation.id, status)).copyWith(unread: 0);
    notifyListeners();
    await refresh();
  }

  Future<void> setMuted(bool muted) async {
    conversation = (await api.muteConversation(conversation.id, muted)).copyWith(unread: 0);
    notifyListeners();
  }
}

class ChatScreen extends StatefulWidget {
  const ChatScreen({super.key, required this.api, required this.conversation, required this.myId, this.onChanged, this.live, this.openFile = openWithSystem});

  final TeacherApi api;
  final Conversation conversation;
  final String myId;

  /// Called when the thread is read or a message is sent, so the inbox can update.
  final ValueChanged<Conversation>? onChanged;

  /// New messages as they arrive; the thread fetches the ones sent in it.
  final Stream<MessageNew>? live;

  final OpenFile openFile;

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  late final controller = ChatController(api: widget.api, conversation: widget.conversation, myId: widget.myId);
  final _text = TextEditingController();
  final _scroll = ScrollController();
  final _bottom = GlobalKey();
  StreamSubscription<MessageNew>? _live;

  /// A photo waiting to go with the next message.
  ChatUpload? _photo;

  @override
  void initState() {
    super.initState();
    _text.addListener(() => setState(() {}));
    controller.load().then((_) => _changed());
    _live = widget.live?.listen(_arrived);
  }

  Future<void> _arrived(MessageNew m) async {
    if (m.conversationId != controller.conversation.id) return;
    if (controller.bubbles.any((b) => b.message.id == m.messageId)) return;
    if (await controller.refresh() && mounted) _changed();
  }

  @override
  void dispose() {
    _live?.cancel();
    controller.dispose();
    _text.dispose();
    _scroll.dispose();
    super.dispose();
  }

  void _changed() => widget.onChanged?.call(controller.conversation);

  Future<void> _send() async {
    final body = _text.text.trim();
    final photo = _photo;
    if (body.isEmpty && photo == null) return;
    _text.clear();
    setState(() => _photo = null);
    if (_scroll.hasClients) _scroll.jumpTo(0);
    await controller.send(body, upload: photo);
    _changed();
  }

  void _snack(String text) => ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(text)));

  Future<void> _attach() async {
    final from = await showModalBottomSheet<_AttachFrom>(
      context: context,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(key: const Key('attachCamera'), leading: const Icon(Icons.photo_camera_outlined), title: Text(context.l10n.chatCamera), onTap: () => Navigator.pop(context, _AttachFrom.camera)),
            ListTile(key: const Key('attachGallery'), leading: const Icon(Icons.photo_library_outlined), title: Text(context.l10n.chatGallery), onTap: () => Navigator.pop(context, _AttachFrom.gallery)),
            ListTile(key: const Key('attachPdf'), leading: const Icon(Icons.picture_as_pdf_outlined), title: Text(context.l10n.chatPdf), onTap: () => Navigator.pop(context, _AttachFrom.pdf)),
          ],
        ),
      ),
    );
    if (from == null) return;
    final file = switch (from) {
      _AttachFrom.camera => await chatPhotoPicker(ImageSource.camera),
      _AttachFrom.gallery => await chatPhotoPicker(ImageSource.gallery),
      _AttachFrom.pdf => await chatPdfPicker(),
    };
    if (file == null || !mounted) return;
    if (file.bytes.length > chatMaxBytes) return _snack(context.l10n.chatFileTooBig);
    setState(() => _photo = file);
  }

  Future<void> _openFile(ChatMessage m) async {
    final f = m.attachment;
    if (f == null || m.id.startsWith('local-')) return;
    try {
      final bytes = await widget.api.messageFile(controller.conversation.id, m.id);
      final ok = await widget.openFile(bytes, f.name, f.type);
      if (!ok && mounted) _snack(context.l10n.inboxFileFailed);
    } on ApiException catch (e) {
      if (mounted) _snack(context.l10n.errorText(e));
    }
  }

  Future<void> _act(Future<void> Function() action) async {
    try {
      await action();
      _changed();
    } on ApiException catch (e) {
      if (mounted) _snack(context.l10n.errorText(e));
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return ListenableBuilder(listenable: controller, builder: (context, _) => _scaffold(context, c));
  }

  Widget _scaffold(BuildContext context, ColorScheme c) {
    final conv = controller.conversation;
    return Scaffold(
      appBar: AppBar(
        actions: [
          PopupMenuButton<String>(
            key: const Key('threadMenu'),
            onSelected: (v) => _act(switch (v) {
              'close' => () => controller.setStatus(ThreadStatus.closed),
              'reopen' => () => controller.setStatus(ThreadStatus.open),
              'resolve' => () => controller.setStatus(ThreadStatus.resolved),
              _ => () => controller.setMuted(!conv.muted),
            }),
            itemBuilder: (context) => [
              if (conv.status == ThreadStatus.open) ...[
                PopupMenuItem(key: const Key('threadResolve'), value: 'resolve', child: Text(context.l10n.chatResolve)),
                PopupMenuItem(key: const Key('threadClose'), value: 'close', child: Text(context.l10n.chatClose)),
              ] else
                PopupMenuItem(key: const Key('threadReopen'), value: 'reopen', child: Text(context.l10n.chatReopen)),
              PopupMenuItem(key: const Key('threadMute'), value: 'mute', child: Text(conv.muted ? context.l10n.chatUnmute : context.l10n.chatMute)),
            ],
          ),
        ],
        titleSpacing: 0,
        title: Row(
          children: [
            KxAvatar(name: conv.family.name, size: 36),
            const SizedBox(width: Kx.s12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(conv.family.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: context.text.titleMedium),
                  Text(
                    [
                      context.l10n.conversationAbout(conv),
                      if (conv.office) context.l10n.chatOffice,
                      if (conv.status == ThreadStatus.resolved) context.l10n.chatStatusResolved,
                    ].join(' · '),
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
            child: ListenableBuilder(
              listenable: controller,
              builder: (context, _) {
                if (controller.loading && controller.bubbles.isEmpty) return const Center(child: CircularProgressIndicator());
                if (controller.error != null && controller.bubbles.isEmpty) {
                  return Padding(
                    padding: const EdgeInsets.all(Kx.s16),
                    child: Align(
                      alignment: Alignment.topCenter,
                      child: ErrorBanner.api(controller.error!, onRetry: controller.load),
                    ),
                  );
                }
                return _Messages(controller: controller, scroll: _scroll, bottomKey: _bottom, onOpenFile: _openFile);
              },
            ),
          ),
          if (conv.status == ThreadStatus.closed)
            Container(
              key: const Key('threadClosedNote'),
              width: double.infinity,
              color: c.surfaceContainerHigh,
              padding: const EdgeInsets.symmetric(horizontal: Kx.s16, vertical: Kx.s8),
              child: Text(context.l10n.chatClosedStaff, style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant)),
            ),
          if (_photo != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(Kx.s12, Kx.s8, Kx.s12, 0),
              child: Align(
                alignment: Alignment.centerLeft,
                child: InputChip(
                  key: const Key('pendingAttachment'),
                  avatar: Icon(_photo!.mime == 'application/pdf' ? Icons.picture_as_pdf_outlined : Icons.image_outlined),
                  label: Text(_photo!.name, overflow: TextOverflow.ellipsis),
                  onDeleted: () => setState(() => _photo = null),
                ),
              ),
            ),
          _Composer(controller: _text, recipient: conv.family.name, onSend: _send, onAttach: _attach, hasPhoto: _photo != null),
        ],
      ),
    );
  }
}

class _Messages extends StatelessWidget {
  const _Messages({required this.controller, required this.scroll, required this.bottomKey, required this.onOpenFile});

  final ChatController controller;
  final ScrollController scroll;
  final Key bottomKey;
  final ValueChanged<ChatMessage> onOpenFile;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final items = controller.bubbles;
    final now = DateTime.now();
    final fmt = Fmt.of(context);
    // Messages grow upward from the bottom (the centre sliver), so earlier pages are added above
    // without moving what the teacher is reading, and a short thread sits at the bottom like a chat.
    return RefreshIndicator(
      onRefresh: controller.loadOlder,
      notificationPredicate: (n) => controller.hasMore && n.depth == 0,
      child: CustomScrollView(
        key: const Key('chatMessages'),
        controller: scroll,
        center: bottomKey,
        anchor: 1,
        physics: const AlwaysScrollableScrollPhysics(),
        slivers: [
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(Kx.s12, Kx.s8, Kx.s12, Kx.s8),
            sliver: SliverList.builder(
              itemCount: items.length + 1,
              itemBuilder: (context, i) {
                // i counts back from the newest message; the extra last item is the thread's top.
                if (i == items.length) return _Top(controller: controller);
                final k = items.length - 1 - i;
                final b = items[k];
                final prev = k > 0 ? items[k - 1].message : null;
                final next = k < items.length - 1 ? items[k + 1].message : null;
                final m = b.message;
                final newDay = prev == null || !DateUtils.isSameDay(prev.createdAt, m.createdAt);
                // Staff side: the teacher's own messages, and office colleagues' in an office thread.
                final mine = m.senderId == controller.myId || (controller.conversation.office && m.senderId != controller.conversation.family.id);
                final grouped = next != null && next.senderId == m.senderId && DateUtils.isSameDay(next.createdAt, m.createdAt);
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    if (newDay)
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: Kx.s12),
                        child: Center(
                          child: Pill(fmt.chatDay(m.createdAt, now), background: c.surfaceContainerHigh, foreground: c.onSurfaceVariant),
                        ),
                      ),
                    if (m.system)
                      Padding(
                        key: Key('system-${m.id}'),
                        padding: const EdgeInsets.symmetric(vertical: Kx.s8),
                        child: Text('${m.body} · ${fmt.time(m.createdAt)}', textAlign: TextAlign.center, style: context.text.labelMedium?.copyWith(color: c.onSurfaceVariant)),
                      )
                    else
                      _BubbleView(bubble: b, mine: mine, grouped: grouped, onRetry: b.failed ? () => controller.retry(b) : null, onOpenFile: () => onOpenFile(m)),
                  ],
                );
              },
            ),
          ),
          SliverToBoxAdapter(key: bottomKey, child: const SizedBox.shrink()),
        ],
      ),
    );
  }
}

class _Top extends StatelessWidget {
  const _Top({required this.controller});

  final ChatController controller;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final style = context.text.bodySmall?.copyWith(color: c.onSurfaceVariant);
    final Widget child;
    if (controller.loadingOlder) {
      child = const SizedBox.square(dimension: 20, child: CircularProgressIndicator(strokeWidth: 2));
    } else if (controller.hasMore) {
      child = Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.arrow_downward, size: 14, color: c.onSurfaceVariant),
          const SizedBox(width: Kx.s4),
          Flexible(child: Text(context.l10n.pullForEarlier, style: style)),
        ],
      );
    } else {
      child = Text(
        context.l10n.chatTop(controller.conversation.student.name, controller.conversation.family.name),
        textAlign: TextAlign.center,
        style: style,
      );
    }
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: Kx.s16, horizontal: Kx.s24),
      child: Center(child: child),
    );
  }
}

class _BubbleView extends StatelessWidget {
  const _BubbleView({required this.bubble, required this.mine, required this.grouped, this.onRetry, this.onOpenFile});

  final ChatBubble bubble;
  final bool mine;

  /// The next message is from the same person, so this one sits closer to it.
  final bool grouped;
  final VoidCallback? onRetry;
  final VoidCallback? onOpenFile;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final m = bubble.message;
    final bg = mine ? c.primary : c.surfaceContainerHigh;
    final fg = mine ? c.onPrimary : c.onSurface;
    const r = Radius.circular(Kx.rLg);
    const tight = Radius.circular(Kx.rXs);
    final l = context.l10n;
    final status = bubble.failed
        ? l.notSentRetry
        : bubble.sending
        ? l.sending
        : Fmt.of(context).time(m.createdAt);
    return Padding(
      padding: EdgeInsets.only(bottom: grouped ? 2 : Kx.s8),
      child: Align(
        alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
        child: ConstrainedBox(
          constraints: BoxConstraints(maxWidth: MediaQuery.sizeOf(context).width * 0.78),
          child: GestureDetector(
            onTap: onRetry,
            onLongPress: () {
              Clipboard.setData(ClipboardData(text: m.body));
              ScaffoldMessenger.of(context)
                ..hideCurrentSnackBar()
                ..showSnackBar(SnackBar(content: Text(l.messageCopied)));
            },
            child: Container(
              key: Key('message-${m.id}'),
              padding: const EdgeInsets.fromLTRB(Kx.s12, Kx.s8, Kx.s12, Kx.s4 + 2),
              decoration: BoxDecoration(
                color: bubble.failed ? c.errorContainer : bg,
                borderRadius: BorderRadius.only(
                  topLeft: r,
                  topRight: r,
                  bottomLeft: mine || grouped ? r : tight,
                  bottomRight: mine && !grouped ? tight : r,
                ),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  if (m.attachment != null)
                    InkWell(
                      key: Key('messageFile-${m.id}'),
                      onTap: onOpenFile,
                      borderRadius: Kx.radiusMd,
                      child: Container(
                        margin: const EdgeInsets.only(bottom: Kx.s4),
                        padding: const EdgeInsets.all(Kx.s8),
                        decoration: BoxDecoration(color: c.surface.withValues(alpha: mine ? 0.9 : 0.6), borderRadius: Kx.radiusMd),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(m.attachment!.isPdf ? Icons.picture_as_pdf_outlined : Icons.image_outlined, color: c.primary),
                            const SizedBox(width: Kx.s8),
                            Flexible(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(m.attachment!.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: context.text.bodyMedium?.copyWith(color: c.onSurface)),
                                  Text(m.attachment!.sizeLabel, style: context.text.labelSmall?.copyWith(color: c.onSurfaceVariant)),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  if (m.body.isNotEmpty)
                    Align(
                      alignment: Alignment.centerLeft,
                      widthFactor: 1,
                      child: Text(m.body, style: context.text.bodyLarge?.copyWith(color: bubble.failed ? c.onErrorContainer : fg)),
                    ),
                  const SizedBox(height: 2),
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      if (bubble.failed) ...[Icon(Icons.error_outline, size: 12, color: c.onErrorContainer), const SizedBox(width: 2)],
                      Flexible(
                        child: Text(
                          status,
                          key: Key('status-${m.id}'),
                          style: context.text.labelSmall?.copyWith(color: bubble.failed ? c.onErrorContainer : fg.withValues(alpha: 0.72)),
                        ),
                      ),
                      if (mine && m.tick != null && !bubble.sending && !bubble.failed) ...[
                        const SizedBox(width: Kx.s4),
                        Icon(
                          m.tick == MessageTick.sent ? Icons.done : Icons.done_all,
                          key: Key('tick-${m.id}-${m.tick!.name}'),
                          size: 14,
                          semanticLabel: switch (m.tick!) {
                            MessageTick.sent => l.chatTickSent,
                            MessageTick.delivered => l.chatTickDelivered,
                            MessageTick.read => l.chatTickRead,
                          },
                          color: m.tick == MessageTick.read ? Colors.lightBlueAccent : fg.withValues(alpha: 0.72),
                        ),
                      ],
                    ],
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _Composer extends StatelessWidget {
  const _Composer({required this.controller, required this.recipient, required this.onSend, required this.onAttach, required this.hasPhoto});

  final TextEditingController controller;
  final String recipient;
  final VoidCallback onSend;
  final VoidCallback onAttach;
  final bool hasPhoto;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final canSend = controller.text.trim().isNotEmpty || hasPhoto;
    return Material(
      color: c.surfaceContainer,
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(Kx.s12, Kx.s8, Kx.s8, Kx.s8),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              IconButton(key: const Key('attachFile'), tooltip: context.l10n.chatAttach, onPressed: onAttach, icon: const Icon(Icons.attach_file)),
              Expanded(
                child: TextField(
                  key: const Key('messageField'),
                  controller: controller,
                  minLines: 1,
                  maxLines: 5,
                  textCapitalization: TextCapitalization.sentences,
                  inputFormatters: [LengthLimitingTextInputFormatter(2000)],
                  decoration: InputDecoration(
                    hintText: context.l10n.messageHint(recipient),
                    filled: true,
                    fillColor: c.surfaceContainerHighest,
                    isDense: true,
                    contentPadding: const EdgeInsets.symmetric(horizontal: Kx.s16, vertical: Kx.s12),
                    border: const OutlineInputBorder(borderRadius: Kx.radiusXl, borderSide: BorderSide.none),
                    enabledBorder: const OutlineInputBorder(borderRadius: Kx.radiusXl, borderSide: BorderSide.none),
                    focusedBorder: const OutlineInputBorder(borderRadius: Kx.radiusXl, borderSide: BorderSide.none),
                  ),
                ),
              ),
              const SizedBox(width: Kx.s8),
              IconButton.filled(
                key: const Key('sendMessage'),
                tooltip: context.l10n.send,
                onPressed: canSend ? onSend : null,
                icon: const Icon(Icons.send),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

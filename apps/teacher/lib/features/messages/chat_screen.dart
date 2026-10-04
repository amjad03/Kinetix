import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/format.dart';
import '../../core/l10n.dart';
import '../../core/models.dart';
import '../../widgets/common.dart';

/// A message on screen: sent, still sending, or failed to send.
class ChatBubble {
  ChatBubble(this.message, {this.sending = false, this.failed = false});

  final ChatMessage message;
  bool sending;
  bool failed;
}

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
  Future<void> send(String body) async {
    final b = ChatBubble(ChatMessage(id: 'local-${_localId++}', senderId: myId, body: body, createdAt: DateTime.now()), sending: true);
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
      final sent = await api.sendMessage(conversation.id, b.message.body);
      final i = bubbles.indexOf(b);
      if (i >= 0) bubbles[i] = ChatBubble(sent);
      conversation = conversation.copyWith(lastMessage: sent.body, lastMessageAt: sent.createdAt, unread: 0);
    } on ApiException {
      b
        ..sending = false
        ..failed = true;
    }
    notifyListeners();
  }
}

class ChatScreen extends StatefulWidget {
  const ChatScreen({super.key, required this.api, required this.conversation, required this.myId, this.onChanged});

  final TeacherApi api;
  final Conversation conversation;
  final String myId;

  /// Called when the thread is read or a message is sent, so the inbox can update.
  final ValueChanged<Conversation>? onChanged;

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  late final controller = ChatController(api: widget.api, conversation: widget.conversation, myId: widget.myId);
  final _text = TextEditingController();
  final _scroll = ScrollController();
  final _bottom = GlobalKey();

  @override
  void initState() {
    super.initState();
    _text.addListener(() => setState(() {}));
    controller.load().then((_) => _changed());
  }

  @override
  void dispose() {
    controller.dispose();
    _text.dispose();
    _scroll.dispose();
    super.dispose();
  }

  void _changed() => widget.onChanged?.call(controller.conversation);

  Future<void> _send() async {
    final body = _text.text.trim();
    if (body.isEmpty) return;
    _text.clear();
    if (_scroll.hasClients) _scroll.jumpTo(0);
    await controller.send(body);
    _changed();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final conv = controller.conversation;
    return Scaffold(
      appBar: AppBar(
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
                    context.l10n.conversationAbout(conv),
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
                return _Messages(controller: controller, scroll: _scroll, bottomKey: _bottom);
              },
            ),
          ),
          _Composer(controller: _text, recipient: conv.family.name, onSend: _send),
        ],
      ),
    );
  }
}

class _Messages extends StatelessWidget {
  const _Messages({required this.controller, required this.scroll, required this.bottomKey});

  final ChatController controller;
  final ScrollController scroll;
  final Key bottomKey;

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
                final mine = m.senderId == controller.myId;
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
                    _BubbleView(bubble: b, mine: mine, grouped: grouped, onRetry: b.failed ? () => controller.retry(b) : null),
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
  const _BubbleView({required this.bubble, required this.mine, required this.grouped, this.onRetry});

  final ChatBubble bubble;
  final bool mine;

  /// The next message is from the same person, so this one sits closer to it.
  final bool grouped;
  final VoidCallback? onRetry;

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
  const _Composer({required this.controller, required this.recipient, required this.onSend});

  final TextEditingController controller;
  final String recipient;
  final VoidCallback onSend;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final canSend = controller.text.trim().isNotEmpty;
    return Material(
      color: c.surfaceContainer,
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(Kx.s12, Kx.s8, Kx.s8, Kx.s8),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
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

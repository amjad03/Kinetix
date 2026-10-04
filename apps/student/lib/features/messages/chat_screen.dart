import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/format.dart';
import '../../core/models.dart';
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

  /// How often an open conversation checks for replies (there is no push yet).
  static Duration pollEvery = const Duration(seconds: 15);

  static Future<void> open(BuildContext context, MessagesController controller, String conversationId, {Conversation? initial}) async {
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => ChatScreen(controller: controller, conversationId: conversationId, initial: initial ?? controller.byId(conversationId)),
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
  String? _error;
  bool _hasOlder = false;
  bool _sending = false;
  final _text = TextEditingController();
  final _scroll = ScrollController();
  Timer? _poll;

  @override
  void initState() {
    super.initState();
    _loadLatest(first: true);
    _poll = Timer.periodic(ChatScreen.pollEvery, (_) => _loadLatest());
  }

  @override
  void dispose() {
    _poll?.cancel();
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
        _merge(page.messages);
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
          _error = e.message;
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
      if (mounted) _snack(e.message);
    }
  }

  void _snack(String text) => ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(text)));

  Future<void> _send() async {
    final body = _text.text.trim();
    if (body.isEmpty || _sending) return;
    setState(() => _sending = true);
    try {
      final m = await api.sendMessage(widget.conversationId, body);
      if (!mounted) return;
      _text.clear();
      setState(() => _merge([m]));
      _toBottom();
    } on ApiException catch (e) {
      if (mounted) _snack("Couldn't send: ${e.message}");
    } finally {
      if (mounted) setState(() => _sending = false);
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
                  Text(conv?.staff.fullName ?? 'Message', maxLines: 1, overflow: TextOverflow.ellipsis),
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
                      child: ErrorBanner(_error!, onRetry: () {
                        setState(() => _loading = true);
                        _loadLatest(first: true);
                      }),
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
                              'Pull down for earlier messages',
                              textAlign: TextAlign.center,
                              style: context.text.labelMedium?.copyWith(color: c.onSurfaceVariant),
                            ),
                          ),
                        if (_items.isEmpty && conv != null)
                          Padding(
                            padding: const EdgeInsets.symmetric(vertical: Kx.s32, horizontal: Kx.s16),
                            child: Text(
                              'Write to ${conv.staff.fullName} about a class, homework or a doubt. '
                              'Teachers reply when they can, usually during college hours.',
                              textAlign: TextAlign.center,
                              style: context.text.bodyLarge?.copyWith(color: c.onSurfaceVariant),
                            ),
                          ),
                        for (final (i, m) in _items.indexed) ...[
                          if (i == 0 || Fmt.daysBetween(_items[i - 1].createdAt, m.createdAt) != 0)
                            _DayChip(Fmt.relativeDay(m.createdAt, now)),
                          MessageBubble(message: m, mine: m.senderId == meId),
                        ],
                      ],
                    ),
                  ),
          ),
          const Divider(height: 1),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(Kx.s12, Kx.s8, Kx.s8, Kx.s8),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
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
                        hintText: 'Message',
                        filled: true,
                        fillColor: c.surfaceContainerHigh,
                        border: OutlineInputBorder(borderRadius: Kx.radiusXl, borderSide: BorderSide.none),
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
                      tooltip: 'Send',
                      onPressed: _text.text.trim().isEmpty || _sending ? null : _send,
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
class MessageBubble extends StatelessWidget {
  const MessageBubble({super.key, required this.message, required this.mine});

  final ChatMessage message;
  final bool mine;

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
        ..showSnackBar(const SnackBar(content: Text('Message copied')));
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
              Text(message.body, style: context.text.bodyLarge?.copyWith(color: fg)),
              const SizedBox(height: 2),
              Text(Fmt.time(message.createdAt), style: context.text.labelSmall?.copyWith(color: fg.withValues(alpha: 0.75))),
            ],
          ),
        ),
        ),
      ),
    );
  }
}

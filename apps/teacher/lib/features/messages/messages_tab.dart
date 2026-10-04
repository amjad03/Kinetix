import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/format.dart';
import '../../core/models.dart';
import '../../widgets/common.dart';
import 'chat_screen.dart';
import 'new_message_screen.dart';

/// The teacher's threads with families, latest first, and the unread total for the badge.
class MessagesController extends ChangeNotifier {
  MessagesController(this.api);

  final TeacherApi api;
  List<Conversation>? items;
  bool loading = false;
  String? error;

  int get unread => (items ?? const <Conversation>[]).fold(0, (n, c) => n + c.unread);

  Future<void> load() async {
    loading = true;
    error = null;
    notifyListeners();
    try {
      items = await api.conversations();
    } on ApiException catch (e) {
      error = e.message;
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  /// After opening a thread or sending in it: update its preview and unread count, move it to the top.
  void updated(Conversation c) {
    final rest = [for (final x in items ?? const <Conversation>[]) if (x.id != c.id) x];
    items = [c, ...rest]..sort((x, y) => (y.lastMessageAt ?? DateTime(0)).compareTo(x.lastMessageAt ?? DateTime(0)));
    notifyListeners();
  }
}

class MessagesTab extends StatelessWidget {
  const MessagesTab({super.key, required this.controller, required this.myId, this.profileButton});

  final MessagesController controller;
  final String myId;
  final Widget? profileButton;

  Future<void> _open(BuildContext context, Conversation c) => open(context, controller, c, myId);

  static Future<void> open(BuildContext context, MessagesController controller, Conversation c, String myId) async {
    controller.updated(c.copyWith(unread: 0));
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => ChatScreen(api: controller.api, conversation: c, myId: myId, onChanged: controller.updated),
      ),
    );
  }

  /// "New message": choose a student's parent or guardian, then go to the thread.
  static Future<void> compose(BuildContext context, MessagesController controller, String myId) async {
    final c = await Navigator.of(context).push<Conversation>(
      MaterialPageRoute(fullscreenDialog: true, builder: (_) => NewMessageScreen(api: controller.api)),
    );
    if (c == null || !context.mounted) return;
    await open(context, controller, c, myId);
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: controller,
      builder: (context, _) {
        final items = controller.items;
        return RefreshIndicator(
          onRefresh: controller.load,
          child: CustomScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            slivers: [
              SliverAppBar.large(title: const Text('Messages'), actions: [?profileButton]),
              if (controller.error != null)
                SliverPadding(
                  padding: const EdgeInsets.all(Kx.s16),
                  sliver: SliverToBoxAdapter(child: ErrorBanner(controller.error!, onRetry: controller.load)),
                ),
              if (items == null && controller.loading)
                const SliverFillRemaining(hasScrollBody: false, child: Center(child: CircularProgressIndicator()))
              else if (items != null && items.isEmpty)
                const SliverFillRemaining(
                  hasScrollBody: false,
                  child: KxEmptyState(
                    icon: Icons.forum_outlined,
                    message: 'No messages yet.\nWrite to a student’s parent with New message, or wait for families to write to you.',
                  ),
                )
              else if (items != null)
                SliverPadding(
                  // Leaves room for the floating action button.
                  padding: const EdgeInsets.only(bottom: 96),
                  sliver: SliverList.builder(
                    itemCount: items.length,
                    itemBuilder: (context, i) => ConversationTile(conversation: items[i], onTap: () => _open(context, items[i])),
                  ),
                ),
            ],
          ),
        );
      },
    );
  }
}

/// One thread: who, about which student, the last message, when, and an unread badge.
class ConversationTile extends StatelessWidget {
  const ConversationTile({super.key, required this.conversation, required this.onTap});

  final Conversation conversation;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final conv = conversation;
    final unread = conv.unread > 0;
    final strong = unread ? FontWeight.w700 : null;
    return InkWell(
      key: Key('conversation-${conv.id}'),
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: Kx.s16, vertical: Kx.s12),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            KxAvatar(name: conv.family.name),
            const SizedBox(width: Kx.s16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          conv.family.name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: context.text.titleMedium?.copyWith(fontWeight: strong),
                        ),
                      ),
                      if (conv.lastMessageAt != null)
                        Text(
                          Fmt.stamp(conv.lastMessageAt!, DateTime.now()),
                          style: context.text.labelMedium?.copyWith(color: unread ? c.primary : c.onSurfaceVariant, fontWeight: strong),
                        ),
                    ],
                  ),
                  Text(conv.about, maxLines: 1, overflow: TextOverflow.ellipsis, style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant)),
                  const SizedBox(height: 2),
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          conv.lastMessage ?? 'No messages yet',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: context.text.bodyMedium?.copyWith(
                            color: unread ? c.onSurface : c.onSurfaceVariant,
                            fontWeight: unread ? FontWeight.w500 : null,
                          ),
                        ),
                      ),
                      if (unread) ...[
                        const SizedBox(width: Kx.s8),
                        Badge(
                          key: Key('unread-${conv.id}'),
                          label: Text('${conv.unread}'),
                          backgroundColor: c.primary,
                          textColor: c.onPrimary,
                        ),
                      ],
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/format.dart';
import '../../core/models.dart';
import '../../widgets/common.dart';
import 'chat_screen.dart';
import 'messages_controller.dart';

/// The student's conversations with teachers, latest first, with unread counts.
class MessagesScreen extends StatefulWidget {
  const MessagesScreen({super.key, required this.controller});

  final MessagesController controller;

  static Future<void> open(BuildContext context, MessagesController controller) =>
      Navigator.of(context).push(MaterialPageRoute(builder: (_) => MessagesScreen(controller: controller)));

  @override
  State<MessagesScreen> createState() => _MessagesScreenState();
}

class _MessagesScreenState extends State<MessagesScreen> {
  MessagesController get controller => widget.controller;

  @override
  void initState() {
    super.initState();
    controller.load();
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: controller,
      builder: (context, _) {
        final threads = controller.threads;
        final now = DateTime.now();
        return Scaffold(
          floatingActionButton: FloatingActionButton.extended(
            key: const Key('newMessage'),
            onPressed: () => NewMessageScreen.open(context, controller),
            icon: const Icon(Icons.edit_outlined),
            label: const Text('New message'),
          ),
          body: RefreshIndicator(
            onRefresh: controller.load,
            child: CustomScrollView(
              physics: const AlwaysScrollableScrollPhysics(),
              slivers: [
                const SliverAppBar.large(title: Text('Messages')),
                if (controller.error != null)
                  CenteredSliver(
                    top: Kx.s8,
                    bottom: Kx.s8,
                    sliver: SliverToBoxAdapter(child: ErrorBanner(controller.error!, onRetry: controller.load)),
                  ),
                if (!controller.loaded && controller.loading)
                  const SliverFillRemaining(hasScrollBody: false, child: Center(child: CircularProgressIndicator()))
                else if (controller.loaded && threads.isEmpty)
                  const SliverFillRemaining(
                    hasScrollBody: false,
                    child: KxEmptyState(
                      icon: Icons.forum_outlined,
                      message: 'No messages yet.\nWrite to your teachers about a class, homework or a doubt.',
                    ),
                  )
                else ...[
                  CenteredSliver(
                    flush: true,
                    sliver: SliverList.list(
                      children: [
                        for (final t in threads)
                          ThreadTile(thread: t, now: now, onTap: () => ChatScreen.open(context, controller, t.id, initial: t)),
                      ],
                    ),
                  ),
                  const SliverToBoxAdapter(child: SizedBox(height: 88)),
                ],
              ],
            ),
          ),
        );
      },
    );
  }
}

class ThreadTile extends StatelessWidget {
  const ThreadTile({super.key, required this.thread, required this.now, required this.onTap});

  final Conversation thread;
  final DateTime now;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final t = thread;
    final unread = t.unread > 0;
    return InkWell(
      key: Key('thread-${t.id}'),
      onTap: onTap,
      child: Container(
        color: unread ? c.primaryContainer.withValues(alpha: 0.25) : null,
        padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s12, Kx.s16, Kx.s12),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            KxAvatar(name: t.staff.fullName, size: 44),
            const SizedBox(width: Kx.s16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          t.staff.fullName,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: context.text.titleSmall?.copyWith(fontWeight: unread ? FontWeight.w700 : FontWeight.w500),
                        ),
                      ),
                      if (t.lastMessageAt != null)
                        Text(
                          Fmt.messageDay(t.lastMessageAt!, now),
                          style: context.text.labelMedium?.copyWith(color: unread ? c.primary : c.onSurfaceVariant),
                        ),
                    ],
                  ),
                  const SizedBox(height: 2),
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: Text(
                          t.lastMessage ?? 'No messages yet',
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: context.text.bodyMedium?.copyWith(
                            color: unread ? c.onSurface : c.onSurfaceVariant,
                            fontWeight: unread ? FontWeight.w500 : null,
                          ),
                        ),
                      ),
                      if (unread) ...[
                        const SizedBox(width: Kx.s8),
                        Badge(key: Key('threadUnread-${t.id}'), label: Text('${t.unread}'), backgroundColor: c.primary),
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

/// Pick one of the class's teachers (with what they teach); opens the thread.
class NewMessageScreen extends StatefulWidget {
  const NewMessageScreen({super.key, required this.controller});

  final MessagesController controller;

  static Future<void> open(BuildContext context, MessagesController controller) =>
      Navigator.of(context).push(MaterialPageRoute(builder: (_) => NewMessageScreen(controller: controller)));

  @override
  State<NewMessageScreen> createState() => _NewMessageScreenState();
}

class _NewMessageScreenState extends State<NewMessageScreen> {
  String? _opening;

  MessagesController get controller => widget.controller;

  @override
  void initState() {
    super.initState();
    if (controller.contacts == null) controller.loadContacts();
  }

  Future<void> _start(ContactGroup me, StaffContact teacher) async {
    setState(() => _opening = teacher.id);
    try {
      final conv = await controller.api.startConversation(studentId: me.studentId, teacherId: teacher.id);
      if (!mounted) return;
      final c = controller;
      await Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => ChatScreen(controller: c, conversationId: conv.id, initial: conv)),
      );
      c.load();
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _opening = null);
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('New message')),
      body: ListenableBuilder(
        listenable: controller,
        builder: (context, _) {
          final c = context.colors;
          final all = controller.contacts;
          if (all == null) {
            return controller.contactsError == null
                ? const Center(child: CircularProgressIndicator())
                : Padding(
                    padding: const EdgeInsets.all(Kx.s16),
                    child: ErrorBanner(controller.contactsError!, onRetry: controller.loadContacts),
                  );
          }
          final me = all.firstOrNull;
          if (me == null || me.staff.isEmpty) {
            return const KxEmptyState(icon: Icons.forum_outlined, message: 'No teachers are on your timetable yet.');
          }
          return LayoutBuilder(
            builder: (context, box) => ListView(
              padding: EdgeInsets.fromLTRB(sideGutter(box.maxWidth) - Kx.s16, 0, sideGutter(box.maxWidth) - Kx.s16, Kx.s32),
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s8, Kx.s16, Kx.s4),
                  child: Text('Your teachers · ${me.className}', style: context.text.titleSmall?.copyWith(color: c.primary)),
                ),
                for (final t in me.staff)
                  ListTile(
                    key: Key('pickTeacher-${t.id}'),
                    leading: KxAvatar(name: t.fullName),
                    title: Text(t.fullName),
                    subtitle: Text(t.subjects.isEmpty ? 'Teacher' : t.subjects.join(' · ')),
                    trailing: _opening == t.id
                        ? const SizedBox(width: 24, height: 24, child: CircularProgressIndicator(strokeWidth: 2))
                        : const Icon(Icons.chevron_right),
                    enabled: _opening == null,
                    onTap: () => _start(me, t),
                  ),
              ],
            ),
          );
        },
      ),
    );
  }
}

/// Today's messages card (colleges only): unread replies, or a prompt to write.
class MessagesCard extends StatelessWidget {
  const MessagesCard({super.key, required this.controller});

  final MessagesController controller;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final unread = controller.unread;
    final latest = controller.threads.firstOrNull;
    void open() => MessagesScreen.open(context, controller);
    return SectionCard(
      key: const Key('messagesCard'),
      icon: Icons.forum_outlined,
      title: 'Messages',
      caption: unread > 0 ? '$unread unread' : null,
      onTap: open,
      footer: CardLink(controller.threads.isEmpty ? 'Write to a teacher' : 'Open messages', onTap: open),
      child: latest == null
          ? Text(
              'Ask your teachers about a class, homework or a doubt.',
              style: context.text.bodyLarge?.copyWith(color: c.onSurfaceVariant),
            )
          : Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                KxAvatar(name: latest.staff.fullName),
                const SizedBox(width: Kx.s12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(latest.staff.fullName, style: context.text.titleSmall),
                      Text(
                        latest.lastMessage ?? 'No messages yet',
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: context.text.bodyMedium?.copyWith(
                          color: latest.unread > 0 ? c.onSurface : c.onSurfaceVariant,
                          fontWeight: latest.unread > 0 ? FontWeight.w500 : null,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
    );
  }
}

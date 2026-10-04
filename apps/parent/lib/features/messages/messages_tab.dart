import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/family.dart';
import '../../core/models.dart';
import '../../l10n/l10n.dart';
import '../../widgets/common.dart';
import 'chat_screen.dart';
import 'messages_controller.dart';

/// Conversations with teachers, latest first, with unread counts. "New message" picks a child and
/// one of their teachers.
class MessagesTab extends StatelessWidget {
  const MessagesTab({super.key, required this.controller, required this.family});

  final MessagesController controller;
  final FamilyController family;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: Listenable.merge([controller, family]),
      builder: (context, _) {
        final threads = controller.threads;
        final now = DateTime.now();
        return Scaffold(
          floatingActionButton: FloatingActionButton.extended(
            key: const Key('newMessage'),
            onPressed: () => NewMessageScreen.open(context, controller, family),
            icon: const Icon(Icons.edit_outlined),
            label: Text(context.l10n.newMessage),
          ),
          body: RefreshIndicator(
            onRefresh: controller.load,
            child: CustomScrollView(
              physics: const AlwaysScrollableScrollPhysics(),
              slivers: [
                SliverAppBar.large(title: Text(context.l10n.navMessages)),
                if (controller.error != null)
                  SliverPadding(
                    padding: const EdgeInsets.all(Kx.s16),
                    sliver: SliverToBoxAdapter(child: ErrorBanner(controller.error!, onRetry: controller.load)),
                  ),
                if (!controller.loaded && controller.loading)
                  const SliverFillRemaining(hasScrollBody: false, child: Center(child: CircularProgressIndicator()))
                else if (controller.loaded && threads.isEmpty)
                  SliverFillRemaining(
                    hasScrollBody: false,
                    child: KxEmptyState(
                      icon: Icons.forum_outlined,
                      message: family.children.length == 1
                          ? context.l10n.noMessagesOneChild(family.children.single.firstName)
                          : context.l10n.noMessagesChildren,
                    ),
                  )
                else ...[
                  SliverList.list(
                    children: [
                      for (final t in threads)
                        ThreadTile(
                          thread: t,
                          now: now,
                          onTap: () => ChatScreen.open(context, controller, t.id, initial: t),
                        ),
                    ],
                  ),
                  // Room for the floating button over the last thread.
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
                          context.fmt.messageDay(t.lastMessageAt!, now),
                          style: context.text.labelMedium?.copyWith(color: unread ? c.primary : c.onSurfaceVariant),
                        ),
                    ],
                  ),
                  Text(
                    '${context.l10n.aboutName(t.student.fullName.split(' ').first)} · ${t.className}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: context.text.labelMedium?.copyWith(color: c.onSurfaceVariant),
                  ),
                  const SizedBox(height: 2),
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: Text(
                          t.lastMessage ?? context.l10n.noMessagesYet,
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

/// Choose a child (when there are several), then one of their teachers; opens the thread.
class NewMessageScreen extends StatefulWidget {
  const NewMessageScreen({super.key, required this.controller, required this.family});

  final MessagesController controller;
  final FamilyController family;

  static Future<void> open(BuildContext context, MessagesController controller, FamilyController family) => Navigator.of(context).push(
    MaterialPageRoute(
      builder: (_) => NewMessageScreen(controller: controller, family: family),
    ),
  );

  @override
  State<NewMessageScreen> createState() => _NewMessageScreenState();
}

class _NewMessageScreenState extends State<NewMessageScreen> {
  String? _childId;
  String? _opening;

  MessagesController get controller => widget.controller;

  @override
  void initState() {
    super.initState();
    _childId = widget.family.selected?.id;
    controller.loadContacts();
  }

  Future<void> _start(ChildContacts child, StaffContact teacher) async {
    setState(() => _opening = teacher.id);
    try {
      final conv = await controller.api.startConversation(childId: child.studentId, teacherId: teacher.id);
      if (!mounted) return;
      final c = controller;
      await Navigator.of(context).pushReplacement(
        MaterialPageRoute(
          builder: (_) => ChatScreen(controller: c, conversationId: conv.id, initial: conv),
        ),
      );
      c.load();
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _opening = null);
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text(context.errorText(e))));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(context.l10n.newMessage)),
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
          if (all.isEmpty) {
            return KxEmptyState(icon: Icons.forum_outlined, message: context.l10n.noChildrenLinkedShort);
          }
          final child = all.where((k) => k.studentId == _childId).firstOrNull ?? all.first;
          return ListView(
            padding: const EdgeInsets.only(bottom: Kx.s32),
            children: [
              if (all.length > 1) ...[
                Padding(
                  padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s8, Kx.s16, Kx.s4),
                  child: Text(context.l10n.aboutHeader, style: context.text.titleSmall?.copyWith(color: c.primary)),
                ),
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: Kx.s16),
                  child: Row(
                    children: [
                      for (final k in all) ...[
                        ChoiceChip(
                          key: Key('pickChild-${k.studentId}'),
                          selected: k.studentId == child.studentId,
                          showCheckmark: false,
                          shape: const StadiumBorder(),
                          selectedColor: c.secondaryContainer,
                          avatar: KxAvatar(name: k.studentName, size: 28),
                          label: Text(k.studentName.split(' ').first),
                          onSelected: (_) => setState(() => _childId = k.studentId),
                        ),
                        const SizedBox(width: Kx.s8),
                      ],
                    ],
                  ),
                ),
              ],
              Padding(
                padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s16, Kx.s16, Kx.s4),
                child: Text(
                  '${context.l10n.childTeachers(child.studentName.split(' ').first)} · ${child.className}',
                  style: context.text.titleSmall?.copyWith(color: c.primary),
                ),
              ),
              if (child.staff.isEmpty)
                Padding(
                  padding: const EdgeInsets.all(Kx.s16),
                  child: Text(
                    context.l10n.noTeachersOnTimetable(child.studentName.split(' ').first),
                    style: context.text.bodyLarge?.copyWith(color: c.onSurfaceVariant),
                  ),
                ),
              for (final t in child.staff)
                ListTile(
                  key: Key('pickTeacher-${t.id}'),
                  leading: KxAvatar(name: t.fullName),
                  title: Text(t.fullName),
                  subtitle: Text(t.subjects.isEmpty ? context.l10n.teacher : t.subjects.join(' · ')),
                  trailing: _opening == t.id
                      ? const SizedBox(width: 24, height: 24, child: CircularProgressIndicator(strokeWidth: 2))
                      : const Icon(Icons.chevron_right),
                  enabled: _opening == null,
                  onTap: () => _start(child, t),
                ),
            ],
          );
        },
      ),
    );
  }
}

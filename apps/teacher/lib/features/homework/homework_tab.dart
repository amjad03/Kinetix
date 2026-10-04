import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/format.dart';
import '../../core/l10n.dart';
import '../../core/models.dart';
import '../../widgets/common.dart';
import 'homework_form.dart';

class HomeworkController extends ChangeNotifier {
  HomeworkController(this.api);

  final TeacherApi api;
  List<Homework>? items;
  bool loading = false;
  ApiException? error;

  Future<void> load() async {
    loading = true;
    error = null;
    notifyListeners();
    try {
      items = await api.myHomework();
    } on ApiException catch (e) {
      error = e;
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  void added(Homework h) {
    items = [h, ...?items];
    notifyListeners();
  }
}

class HomeworkTab extends StatelessWidget {
  const HomeworkTab({super.key, required this.controller, this.profileButton});

  final HomeworkController controller;

  /// Opens Profile from the app bar.
  final Widget? profileButton;

  static Future<void> assign(BuildContext context, HomeworkController controller) async {
    final created = await Navigator.of(context)
        .push<Homework>(MaterialPageRoute(fullscreenDialog: true, builder: (_) => HomeworkForm(api: controller.api)));
    if (created == null || !context.mounted) return;
    controller.added(created);
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(context.l10n.homeworkAssigned(created.section.name))));
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: controller,
      builder: (context, _) {
        final l = context.l10n;
        final items = controller.items;
        return RefreshIndicator(
          onRefresh: controller.load,
          child: CustomScrollView(
            slivers: [
              SliverAppBar.large(title: Text(l.navHomework), actions: [?profileButton]),
              if (controller.error != null)
                SliverPadding(
                  padding: const EdgeInsets.all(Kx.s16),
                  sliver: SliverToBoxAdapter(child: ErrorBanner.api(controller.error!, onRetry: controller.load)),
                ),
              if (items == null && controller.loading)
                const SliverFillRemaining(hasScrollBody: false, child: Center(child: CircularProgressIndicator()))
              else if (items != null && items.isEmpty)
                SliverFillRemaining(
                  hasScrollBody: false,
                  child: KxEmptyState(icon: Icons.assignment_outlined, message: l.noHomework),
                )
              else if (items != null)
                SliverPadding(
                  // Leaves room for the floating action button.
                  padding: const EdgeInsets.fromLTRB(Kx.s16, 0, Kx.s16, 96),
                  sliver: SliverList.separated(
                    itemCount: items.length,
                    separatorBuilder: (_, _) => const SizedBox(height: Kx.s12),
                    itemBuilder: (context, i) => _HomeworkCard(items[i]),
                  ),
                ),
            ],
          ),
        );
      },
    );
  }
}

class _HomeworkCard extends StatelessWidget {
  const _HomeworkCard(this.homework);

  final Homework homework;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final l = context.l10n;
    final fmt = Fmt.of(context);
    final today = DateUtils.dateOnly(DateTime.now());
    final overdue = homework.dueOn.isBefore(today);
    final days = homework.dueOn.difference(today).inDays;
    final due = switch (days) {
      0 => l.dueToday,
      1 => l.dueTomorrow,
      -1 => l.wasDueYesterday,
      _ => overdue ? l.wasDueOn(fmt.shortDay(homework.dueOn)) : l.dueOn(fmt.shortDay(homework.dueOn)),
    };
    return Card(
      key: Key('homework-${homework.id}'),
      child: Padding(
        padding: const EdgeInsets.all(Kx.s16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(homework.title, style: context.text.titleMedium),
            const SizedBox(height: Kx.s4),
            // On its own line: "was due" labels are long in Hindi and Kannada.
            Pill(
              due,
              key: const Key('dueLabel'),
              icon: Icons.event_outlined,
              background: overdue ? c.surfaceContainerHighest : c.secondaryContainer,
              foreground: overdue ? c.onSurfaceVariant : c.onSecondaryContainer,
            ),
            const SizedBox(height: Kx.s4),
            Text(
              '${homework.section.name} · ${homework.subject.name}',
              style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant),
            ),
            if (homework.instructions.isNotEmpty) ...[
              const SizedBox(height: Kx.s8),
              Text(homework.instructions, maxLines: 3, overflow: TextOverflow.ellipsis, style: context.text.bodyMedium),
            ],
          ],
        ),
      ),
    );
  }
}

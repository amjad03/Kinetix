import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/format.dart';
import '../../core/models.dart';
import '../../widgets/common.dart';
import 'assessment_form.dart';
import 'marks_entry_screen.dart';

/// The teacher's classes and, for the selected one, its tests and assignments with class averages.
class MarksController extends ChangeNotifier {
  MarksController(this.api);

  final TeacherApi api;
  List<TeacherClass>? classes;
  Ref? section;
  List<Assessment>? items;

  /// Details (roster and stats) by assessment id, loaded after the list for the averages.
  final details = <String, Assessment>{};
  bool loading = false;
  String? error;

  List<Ref> get sections => {for (final c in classes ?? const <TeacherClass>[]) c.section}.toList();

  Future<void> load() async {
    loading = true;
    error = null;
    notifyListeners();
    try {
      if (classes == null) {
        classes = await api.classes();
        section ??= sections.firstOrNull;
      }
      final s = section;
      if (s == null) {
        items = [];
        return;
      }
      final list = await api.assessments(s.id);
      if (section != s) return;
      items = list;
      notifyListeners();
      await _loadDetails(list);
    } on ApiException catch (e) {
      error = e.message;
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  /// The list has no stats, so each card fills in its average as its detail arrives.
  Future<void> _loadDetails(List<Assessment> list) async {
    await Future.wait([
      for (final a in list)
        api.assessment(a.id).then((d) {
          details[a.id] = d;
          notifyListeners();
        }, onError: (Object _) {}),
    ]);
  }

  Future<void> select(Ref s) async {
    if (s == section) return;
    section = s;
    items = null;
    await load();
  }

  /// A created or updated assessment (with its detail).
  void upsert(Assessment a) {
    details[a.id] = a;
    if (a.sectionId == section?.id) {
      final list = [...?items];
      final i = list.indexWhere((x) => x.id == a.id);
      if (i >= 0) {
        list[i] = a;
      } else {
        list.add(a);
      }
      list.sort((x, y) => y.heldOn.compareTo(x.heldOn));
      items = list;
    }
    notifyListeners();
  }
}

class MarksTab extends StatelessWidget {
  const MarksTab({super.key, required this.controller, this.profileButton});

  final MarksController controller;
  final Widget? profileButton;

  /// "New assessment": create it, then go straight to entering marks.
  static Future<void> create(BuildContext context, MarksController controller) async {
    final created = await Navigator.of(context).push<Assessment>(
      MaterialPageRoute(
        fullscreenDialog: true,
        builder: (_) => AssessmentForm(api: controller.api, classes: controller.classes, initialSection: controller.section),
      ),
    );
    if (created == null || !context.mounted) return;
    if (created.sectionId != controller.section?.id) {
      final s = controller.sections.where((s) => s.id == created.sectionId).firstOrNull;
      if (s != null) await controller.select(s);
    }
    controller.upsert(created);
    if (!context.mounted) return;
    await open(context, controller, created);
  }

  static Future<void> open(BuildContext context, MarksController controller, Assessment a) => Navigator.of(context).push(
    MaterialPageRoute<void>(
      builder: (_) => MarksEntryScreen(api: controller.api, assessment: a, onChanged: controller.upsert),
    ),
  );

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: controller,
      builder: (context, _) {
        final items = controller.items;
        final sections = controller.sections;
        return RefreshIndicator(
          onRefresh: controller.load,
          child: CustomScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            slivers: [
              SliverAppBar.large(title: const Text('Marks'), actions: [?profileButton]),
              if (sections.length > 1)
                SliverToBoxAdapter(
                  child: SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    padding: const EdgeInsets.fromLTRB(Kx.s16, 0, Kx.s16, Kx.s8),
                    child: Row(
                      children: [
                        for (final s in sections)
                          Padding(
                            padding: const EdgeInsets.only(right: Kx.s8),
                            child: ChoiceChip(
                              label: Text(s.name),
                              selected: s == controller.section,
                              onSelected: (_) => controller.select(s),
                            ),
                          ),
                      ],
                    ),
                  ),
                )
              else if (controller.section != null)
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(Kx.s16, 0, Kx.s16, Kx.s8),
                    child: Text(
                      controller.section!.name,
                      style: context.text.bodyLarge?.copyWith(color: context.colors.onSurfaceVariant),
                    ),
                  ),
                ),
              if (controller.error != null)
                SliverPadding(
                  padding: const EdgeInsets.all(Kx.s16),
                  sliver: SliverToBoxAdapter(child: ErrorBanner(controller.error!, onRetry: controller.load)),
                ),
              if (items == null && controller.loading)
                const SliverFillRemaining(hasScrollBody: false, child: Center(child: CircularProgressIndicator()))
              else if (controller.classes != null && controller.classes!.isEmpty)
                const SliverFillRemaining(
                  hasScrollBody: false,
                  child: KxEmptyState(icon: Icons.event_busy_outlined, message: 'You have no classes in your timetable yet'),
                )
              else if (items != null && items.isEmpty)
                SliverFillRemaining(
                  hasScrollBody: false,
                  child: KxEmptyState(
                    icon: Icons.grading_outlined,
                    message: 'No tests or assignments for ${controller.section?.name ?? 'this class'} yet.\n'
                        'Add one, enter marks and publish them to families.',
                  ),
                )
              else if (items != null)
                SliverPadding(
                  // Leaves room for the floating action button.
                  padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s8, Kx.s16, 96),
                  sliver: SliverList.separated(
                    itemCount: items.length,
                    separatorBuilder: (_, _) => const SizedBox(height: Kx.s12),
                    itemBuilder: (context, i) => AssessmentCard(
                      assessment: items[i],
                      detail: controller.details[items[i].id],
                      onTap: () => open(context, controller, items[i]),
                    ),
                  ),
                ),
            ],
          ),
        );
      },
    );
  }
}

/// One test or assignment: title, subject, kind, date, Draft/Published and the class average.
class AssessmentCard extends StatelessWidget {
  const AssessmentCard({super.key, required this.assessment, this.detail, required this.onTap});

  final Assessment assessment;

  /// With stats and the roster, once loaded.
  final Assessment? detail;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final a = assessment;
    final stats = detail?.stats;
    final total = detail?.students?.length;
    final (goodBg, good) = goodColors(context);
    final muted = context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant);

    return Card(
      key: Key('assessment-${a.id}'),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(Kx.s16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(child: Text(a.title, style: context.text.titleMedium)),
                  const SizedBox(width: Kx.s8),
                  a.isPublished
                      ? Pill('Published', icon: Icons.check, background: goodBg, foreground: good)
                      : Pill('Draft', icon: Icons.edit_outlined, background: c.surfaceContainerHighest, foreground: c.onSurfaceVariant),
                ],
              ),
              const SizedBox(height: Kx.s4),
              Text('${a.subject.name} · ${a.kind.label} · ${Fmt.shortDay(a.heldOn)}', style: muted),
              const SizedBox(height: Kx.s12),
              Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Expanded(
                    child: stats?.average != null
                        ? Text.rich(
                            TextSpan(
                              children: [
                                TextSpan(text: 'Class average  ', style: muted),
                                TextSpan(
                                  text: formatMarks(stats!.average!),
                                  style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w500),
                                ),
                                TextSpan(text: ' / ${formatMarks(a.maxMarks)}', style: muted),
                              ],
                            ),
                          )
                        : Text(
                            detail == null ? 'Out of ${formatMarks(a.maxMarks)}' : 'No marks yet · out of ${formatMarks(a.maxMarks)}',
                            style: muted,
                          ),
                  ),
                  Text(
                    total == null ? '${a.entered} entered' : '${detail!.entered} of $total entered',
                    style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant),
                  ),
                ],
              ),
              if (stats?.average != null) ...[
                const SizedBox(height: Kx.s8),
                ClipRRect(
                  borderRadius: Kx.radiusSm,
                  child: LinearProgressIndicator(
                    value: (stats!.average! / a.maxMarks).clamp(0, 1),
                    minHeight: 6,
                    backgroundColor: c.surfaceContainerHighest,
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

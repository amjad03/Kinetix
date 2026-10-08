import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/format.dart';
import '../../core/l10n.dart';
import '../../core/work_models.dart';
import '../../widgets/async_body.dart';

String taskStatusText(AppLocalizations l, TaskStatus s) => switch (s) {
  TaskStatus.open => l.taskStatusOpen,
  TaskStatus.inProgress => l.taskStatusInProgress,
  TaskStatus.done => l.taskStatusDone,
  TaskStatus.cancelled => l.taskStatusCancelled,
};

/// Tasks given to me and tasks I asked others to do; the assignee or owner moves a task along.
class TasksScreen extends StatelessWidget {
  const TasksScreen({super.key, required this.api});

  final TeacherApi api;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: AppBar(
          title: Text(l.tasksTitle),
          bottom: TabBar(tabs: [Tab(key: const Key('tabMine'), text: l.tasksMineTab), Tab(key: const Key('tabByMe'), text: l.tasksByMeTab)]),
        ),
        body: TabBarView(
          children: [
            _TaskList(api: api, load: api.myTasks, tag: 'mine'),
            _TaskList(api: api, load: api.tasksAssignedByMe, tag: 'byMe'),
          ],
        ),
      ),
    );
  }
}

class _TaskList extends StatelessWidget {
  const _TaskList({required this.api, required this.load, required this.tag});

  final TeacherApi api;
  final Future<List<TaskInfo>> Function({bool all}) load;
  final String tag;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final f = Fmt.of(context);
    return AsyncBody<List<TaskInfo>>(
      key: Key('tasks-$tag'),
      load: () => load(),
      isEmpty: (tasks) => tasks.isEmpty,
      empty: l.tasksEmpty,
      builder: (context, tasks, reload) => ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(Kx.s16),
        children: [
          for (final t in tasks)
            Card(
              key: Key('task-${t.id}'),
              child: Padding(
                padding: const EdgeInsets.all(Kx.s12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(t.title, style: context.text.titleSmall),
                    if (t.description.isNotEmpty) Text(t.description),
                    Text(tag == 'mine' ? l.taskFrom(t.ownerName) : l.taskTo(t.assigneeName), style: context.text.bodySmall),
                    if (t.dueAt != null) Text(l.taskDue(f.when(t.dueAt!)), style: context.text.bodySmall),
                    const SizedBox(height: Kx.s8),
                    Wrap(
                      spacing: Kx.s8,
                      children: [
                        Chip(label: Text(taskStatusText(l, t.status)), visualDensity: VisualDensity.compact),
                        if (t.overdue) Chip(label: Text(l.taskOverdue), visualDensity: VisualDensity.compact),
                        if (t.priority == 'urgent') Chip(label: Text(l.taskPriorityUrgent), visualDensity: VisualDensity.compact),
                        if (t.priority == 'high') Chip(label: Text(l.taskPriorityHigh), visualDensity: VisualDensity.compact),
                      ],
                    ),
                    if (t.status == TaskStatus.open || t.status == TaskStatus.inProgress)
                      Wrap(
                        alignment: WrapAlignment.end,
                        crossAxisAlignment: WrapCrossAlignment.center,
                        spacing: Kx.s8,
                        children: [
                          TextButton(
                            key: Key('cancel-${t.id}'),
                            onPressed: () async {
                              if (await runOrSnack(context, () => api.setTaskStatus(t.id, TaskStatus.cancelled, version: t.version))) await reload();
                            },
                            child: Text(l.taskCancelAction),
                          ),
                          if (t.status == TaskStatus.open && tag == 'mine')
                            OutlinedButton(
                              key: Key('start-${t.id}'),
                              onPressed: () async {
                                if (await runOrSnack(context, () => api.setTaskStatus(t.id, TaskStatus.inProgress, version: t.version))) await reload();
                              },
                              child: Text(l.taskStart),
                            ),
                          FilledButton(
                            key: Key('done-${t.id}'),
                            onPressed: () async {
                              if (await runOrSnack(context, () => api.setTaskStatus(t.id, TaskStatus.done, version: t.version))) await reload();
                            },
                            child: Text(l.taskMarkDone),
                          ),
                        ],
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

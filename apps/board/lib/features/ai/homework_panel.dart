import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api_client.dart';
import '../../core/models.dart';
import '../board/chrome.dart';
import '../board/side_panel.dart';
import 'ai_controller.dart';
import 'ai_widgets.dart';

const homeworkAccent = Color(0xFFF28B82);

/// The longest instructions the server accepts.
const _maxInstructions = 5000;

DateTime _tomorrow() => DateUtils.dateOnly(DateTime.now()).add(const Duration(days: 1));

/// A friendly line for a failed send.
String _sendError(Object e) {
  if (e is ApiException && e.status == 400) return e.message;
  if (e is ApiException && e.status == 401) return 'Sign in again with the Teacher app to give homework.';
  if (e is ApiException) return 'Could not send the homework (${e.status}). Try again.';
  return 'The board is offline. Connect to the internet to send homework.';
}

/// Confirms that homework went out.
void showHomeworkSent(BuildContext context, AiController ai) {
  final section = ai.board.session?.sectionName;
  showBoardMessage(context, 'Homework sent to ${section ?? 'the class'}. Students and parents are notified.');
}

/// Homework: generate a draft from a topic (or write one), edit it, choose the due date and
/// send it to the class open on the board.
class HomeworkPanel extends StatefulWidget {
  const HomeworkPanel({super.key, required this.ai, this.onBack});

  final AiController ai;
  final VoidCallback? onBack;

  @override
  State<HomeworkPanel> createState() => _HomeworkPanelState();
}

class _HomeworkPanelState extends State<HomeworkPanel> {
  late final _topic = TextEditingController(text: widget.ai.homeworkTopic ?? widget.ai.defaultTopic);

  AiController get ai => widget.ai;

  @override
  void dispose() {
    _topic.dispose();
    super.dispose();
  }

  void _generate({bool fresh = false}) {
    if (!ai.canUseAi) {
      showBoardMessage(context, 'Sign in with the Teacher app to make homework with KINETIX AI.');
      return;
    }
    if (_topic.text.trim().length < 2) {
      showBoardMessage(context, 'Type a topic for the homework first.');
      return;
    }
    FocusScope.of(context).unfocus();
    ai.generateHomework(_topic.text, fresh: fresh);
  }

  @override
  Widget build(BuildContext context) {
    return PanelPage(
      icon: Icons.assignment_outlined,
      title: 'Homework',
      accent: homeworkAccent,
      onBack: widget.onBack,
      trailing: AiLanguageMenu(ai: ai),
      child: ListenableBuilder(
        listenable: Listenable.merge([ai, ai.homework]),
        builder: (context, _) {
          final draft = ai.homeworkDraft;
          if (draft != null) {
            return _HomeworkEditor(
              key: ObjectKey(draft),
              ai: ai,
              draft: draft,
              onRegenerate: ai.homeworkTopic?.isNotEmpty == true && ai.canUseAi ? () => _generate(fresh: true) : null,
            );
          }
          final task = ai.homework;
          return ListView(
            padding: const EdgeInsets.fromLTRB(Kx.s24, Kx.s8, Kx.s24, Kx.s24),
            children: [
              if (!ai.canUseAi) ...[const AiSignInNotice(), const SizedBox(height: Kx.s16)],
              TextField(
                key: const Key('homework-topic'),
                controller: _topic,
                style: const TextStyle(fontSize: 18),
                decoration: const InputDecoration(labelText: 'Topic', hintText: 'e.g. Linear equations, Journal entries'),
                textInputAction: TextInputAction.go,
                onSubmitted: (_) => _generate(),
              ),
              const SizedBox(height: Kx.s12),
              Wrap(
                spacing: Kx.s16,
                runSpacing: Kx.s8,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  NumberPicker(label: 'Questions', value: ai.homeworkCount, options: const [3, 5, 8, 10, 15], onChanged: (v) => setState(() => ai.homeworkCount = v)),
                  DifficultyPicker(value: ai.homeworkDifficulty, onChanged: (v) => setState(() => ai.homeworkDifficulty = v)),
                ],
              ),
              const SizedBox(height: Kx.s16),
              Wrap(
                spacing: Kx.s8,
                runSpacing: Kx.s8,
                children: [
                  FilledButton.icon(
                    key: const Key('homework-generate'),
                    onPressed: task.loading ? null : _generate,
                    icon: const Icon(Icons.auto_awesome),
                    label: const Text('Make homework'),
                  ),
                  OutlinedButton.icon(
                    key: const Key('homework-write'),
                    onPressed: task.loading ? null : ai.writeOwnHomework,
                    icon: const Icon(Icons.edit_outlined),
                    label: const Text('Write my own'),
                  ),
                ],
              ),
              const SizedBox(height: Kx.s16),
              if (task.loading) AiLoading(label: 'Writing ${ai.homeworkCount} questions…'),
              if (task.error != null) AiError(message: task.error!, onRetry: _generate),
              if (!task.loading && task.error == null)
                Padding(
                  padding: const EdgeInsets.only(top: Kx.s8),
                  child: Text(
                    'You can edit everything before it goes to the class. Students and parents see it in their apps.',
                    style: context.text.bodyMedium?.copyWith(color: context.colors.onSurfaceVariant),
                  ),
                ),
            ],
          );
        },
      ),
    );
  }
}

class _HomeworkEditor extends StatefulWidget {
  const _HomeworkEditor({super.key, required this.ai, required this.draft, this.onRegenerate});

  final AiController ai;
  final HomeworkDraft draft;
  final VoidCallback? onRegenerate;

  @override
  State<_HomeworkEditor> createState() => _HomeworkEditorState();
}

class _HomeworkEditorState extends State<_HomeworkEditor> {
  late final _title = TextEditingController(text: widget.draft.title);
  late final _instructions = TextEditingController(text: widget.draft.instructions);
  late final List<TextEditingController> _questions = [for (final q in widget.draft.questions) TextEditingController(text: q.question)];
  DateTime _due = _tomorrow();
  bool _sending = false;

  HomeworkDraft get draft => widget.draft;

  @override
  void dispose() {
    for (final c in [_title, _instructions, ..._questions]) {
      c.dispose();
    }
    super.dispose();
  }

  void _add() => setState(() {
    draft.questions.add(HomeworkQuestion(question: '', marks: 2));
    _questions.add(TextEditingController());
  });

  void _remove(int i) => setState(() {
    draft.questions.removeAt(i);
    _questions.removeAt(i).dispose();
  });

  Future<void> _send() async {
    draft
      ..title = _title.text.trim()
      ..instructions = _instructions.text;
    for (var i = 0; i < _questions.length; i++) {
      draft.questions[i].question = _questions[i].text;
    }
    if (draft.title.isEmpty) {
      showBoardMessage(context, 'Give the homework a title.');
      return;
    }
    final text = homeworkInstructions(draft);
    if (text.length > _maxInstructions) {
      showBoardMessage(context, 'This homework is too long to send. Remove a few questions.');
      return;
    }
    setState(() => _sending = true);
    try {
      await widget.ai.sendHomework(title: draft.title, instructions: text, dueOn: _due);
      if (!mounted) return;
      showHomeworkSent(context, widget.ai);
      widget.ai.discardHomework();
    } catch (e) {
      if (mounted) {
        setState(() => _sending = false);
        showBoardMessage(context, _sendError(e));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final section = widget.ai.board.session?.sectionName;
    return ListView(
      padding: const EdgeInsets.fromLTRB(Kx.s24, Kx.s8, Kx.s24, Kx.s24),
      children: [
        if (widget.ai.homeworkFromPreview) ...[AiNotice.preview(), const SizedBox(height: Kx.s16)],
        TextField(
          key: const Key('homework-title'),
          controller: _title,
          style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w500),
          decoration: const InputDecoration(labelText: 'Title'),
        ),
        const SizedBox(height: Kx.s12),
        TextField(
          key: const Key('homework-instructions'),
          controller: _instructions,
          minLines: 2,
          maxLines: 5,
          style: const TextStyle(fontSize: 17),
          decoration: const InputDecoration(labelText: 'Instructions'),
        ),
        const SizedBox(height: Kx.s16),
        Row(
          children: [
            Expanded(child: Text('Questions', style: context.text.titleMedium)),
            Text('Total ${draft.totalMarks} marks', key: const Key('homework-total'), style: context.text.titleSmall?.copyWith(color: c.onSurfaceVariant)),
          ],
        ),
        const SizedBox(height: Kx.s8),
        for (var i = 0; i < draft.questions.length; i++)
          Padding(
            key: ObjectKey(draft.questions[i]),
            padding: const EdgeInsets.only(bottom: Kx.s12),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SizedBox(
                  width: 28,
                  child: Padding(
                    padding: const EdgeInsets.only(top: 16),
                    child: Text('${i + 1}.', style: context.text.titleMedium),
                  ),
                ),
                Expanded(
                  child: TextField(
                    key: Key('homework-q$i'),
                    controller: _questions[i],
                    minLines: 1,
                    maxLines: 4,
                    style: const TextStyle(fontSize: 17),
                    decoration: const InputDecoration(hintText: 'Question'),
                  ),
                ),
                const SizedBox(width: Kx.s8),
                Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: DropdownButton<int>(
                    key: Key('homework-marks$i'),
                    value: draft.questions[i].marks.clamp(1, 20),
                    underline: const SizedBox.shrink(),
                    borderRadius: BorderRadius.circular(Kx.rMd),
                    items: [for (var m = 1; m <= 20; m++) DropdownMenuItem(value: m, child: Text('$m ${m == 1 ? 'mark' : 'marks'}'))],
                    onChanged: (m) => setState(() => draft.questions[i].marks = m ?? draft.questions[i].marks),
                  ),
                ),
                IconButton(tooltip: 'Remove question', onPressed: () => _remove(i), icon: const Icon(Icons.delete_outline)),
              ],
            ),
          ),
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton.icon(
            key: const Key('homework-add'),
            onPressed: draft.questions.length >= 15 ? null : _add,
            icon: const Icon(Icons.add),
            label: const Text('Add question'),
          ),
        ),
        const Divider(height: Kx.s32),
        Wrap(
          spacing: Kx.s12,
          runSpacing: Kx.s8,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            DueDateChip(value: _due, onChanged: (d) => setState(() => _due = d)),
            Text(
              section == null ? 'No class is timetabled now' : 'Goes to $section',
              style: context.text.bodyMedium?.copyWith(color: section == null ? c.error : c.onSurfaceVariant),
            ),
          ],
        ),
        const SizedBox(height: Kx.s16),
        Wrap(
          spacing: Kx.s8,
          runSpacing: Kx.s8,
          children: [
            FilledButton.icon(
              key: const Key('homework-send'),
              onPressed: _sending || section == null ? null : _send,
              icon: _sending
                  ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.send_outlined),
              label: const Text('Send to class'),
            ),
            if (widget.onRegenerate != null)
              OutlinedButton.icon(
                key: const Key('homework-regenerate'),
                onPressed: _sending ? null : widget.onRegenerate,
                icon: const Icon(Icons.refresh),
                label: const Text('Regenerate'),
              ),
            TextButton(key: const Key('homework-discard'), onPressed: _sending ? null : widget.ai.discardHomework, child: const Text('Discard')),
          ],
        ),
      ],
    );
  }
}

/// Asks for a title and due date, then gives [instructions] to the class as homework.
/// Returns true when it was sent.
Future<bool> showSendHomeworkDialog(BuildContext context, {required AiController ai, required String title, required String instructions}) async {
  final sent = await showDialog<bool>(
    context: context,
    builder: (_) => BoardChromeTheme(
      child: _SendHomeworkDialog(ai: ai, title: title, instructions: instructions),
    ),
  );
  return sent ?? false;
}

class _SendHomeworkDialog extends StatefulWidget {
  const _SendHomeworkDialog({required this.ai, required this.title, required this.instructions});

  final AiController ai;
  final String title;
  final String instructions;

  @override
  State<_SendHomeworkDialog> createState() => _SendHomeworkDialogState();
}

class _SendHomeworkDialogState extends State<_SendHomeworkDialog> {
  late final _title = TextEditingController(text: widget.title);
  DateTime _due = _tomorrow();
  bool _sending = false;
  String? _error;

  @override
  void dispose() {
    _title.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    if (_title.text.trim().isEmpty) {
      setState(() => _error = 'Give the homework a title.');
      return;
    }
    if (widget.instructions.length > _maxInstructions) {
      setState(() => _error = 'This quiz is too long to send as homework. Make one with fewer questions.');
      return;
    }
    setState(() {
      _sending = true;
      _error = null;
    });
    try {
      await widget.ai.sendHomework(title: _title.text.trim(), instructions: widget.instructions, dueOn: _due);
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) {
        setState(() {
          _sending = false;
          _error = _sendError(e);
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final section = widget.ai.board.session?.sectionName;
    return AlertDialog(
      icon: const Icon(Icons.assignment_outlined),
      title: const Text('Send as homework'),
      content: SizedBox(
        width: 560,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            TextField(key: const Key('send-homework-title'), controller: _title, decoration: const InputDecoration(labelText: 'Title')),
            const SizedBox(height: Kx.s12),
            Wrap(
              spacing: Kx.s12,
              runSpacing: Kx.s8,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                DueDateChip(value: _due, onChanged: (d) => setState(() => _due = d)),
                Text(
                  section == null ? 'No class is timetabled now' : 'Goes to $section',
                  style: TextStyle(color: section == null ? c.error : c.onSurfaceVariant),
                ),
              ],
            ),
            const SizedBox(height: Kx.s12),
            Flexible(
              child: Container(
                constraints: const BoxConstraints(maxHeight: 240),
                decoration: BoxDecoration(color: c.surfaceContainerHigh, borderRadius: BorderRadius.circular(Kx.rMd)),
                child: SingleChildScrollView(
                  padding: const EdgeInsets.all(Kx.s12),
                  child: Text(widget.instructions, key: const Key('send-homework-preview'), style: const TextStyle(fontSize: 14, height: 1.4)),
                ),
              ),
            ),
            if (_error != null) ...[
              const SizedBox(height: Kx.s12),
              Text(_error!, key: const Key('send-homework-error'), style: TextStyle(color: c.error)),
            ],
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: _sending ? null : () => Navigator.of(context).pop(false), child: const Text('Cancel')),
        FilledButton(
          key: const Key('send-homework-confirm'),
          onPressed: _sending || section == null ? null : _send,
          child: _sending ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('Send to class'),
        ),
      ],
    );
  }
}

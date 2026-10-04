import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/format.dart';
import '../../core/models.dart';
import '../../widgets/common.dart';

/// "Assign homework": class and subject from the teacher's timetable, title, instructions, due date.
class HomeworkForm extends StatefulWidget {
  const HomeworkForm({super.key, required this.api});

  final TeacherApi api;

  @override
  State<HomeworkForm> createState() => _HomeworkFormState();
}

class _HomeworkFormState extends State<HomeworkForm> {
  static const maxTitle = 200, maxInstructions = 2000;

  final _form = GlobalKey<FormState>();
  final _title = TextEditingController();
  final _instructions = TextEditingController();
  List<TeacherClass>? _classes;
  Ref? _section;
  Ref? _subject;
  DateTime _due = DateUtils.dateOnly(DateTime.now()).add(const Duration(days: 1));
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _instructions.addListener(() => setState(() {}));
    _loadClasses();
  }

  @override
  void dispose() {
    _title.dispose();
    _instructions.dispose();
    super.dispose();
  }

  Future<void> _loadClasses() async {
    setState(() => _error = null);
    try {
      final classes = await widget.api.classes();
      setState(() {
        _classes = classes;
        if (classes.isNotEmpty) {
          _section = classes.first.section;
          _subject = classes.first.subject;
        }
      });
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    }
  }

  List<Ref> get _sections => {for (final c in _classes ?? <TeacherClass>[]) c.section}.toList();
  List<Ref> get _subjects => {
    for (final c in _classes ?? <TeacherClass>[])
      if (c.section == _section) c.subject,
  }.toList();

  Future<void> _pickDate() async {
    final today = DateUtils.dateOnly(DateTime.now());
    final picked = await showDatePicker(
      context: context,
      initialDate: _due,
      firstDate: today,
      lastDate: today.add(const Duration(days: 180)),
      helpText: 'Due date',
    );
    if (picked != null) setState(() => _due = picked);
  }

  Future<void> _save() async {
    if (!_form.currentState!.validate()) return;
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final hw = await widget.api.createHomework(
        sectionId: _section!.id,
        subjectId: _subject!.id,
        title: _title.text.trim(),
        instructions: _instructions.text.trim(),
        dueOn: isoDate(_due),
      );
      if (mounted) Navigator.of(context).pop(hw);
    } on ApiException catch (e) {
      if (mounted) setState(() => (_error = e.message, _saving = false));
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Scaffold(
      appBar: AppBar(
        leading: const CloseButton(),
        title: const Text('Assign homework'),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: Kx.s12),
            child: FilledButton(
              key: const Key('assignHomework'),
              onPressed: _saving || _classes == null || _classes!.isEmpty ? null : _save,
              style: FilledButton.styleFrom(minimumSize: const Size(64, 40)),
              child: _saving
                  ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Text('Assign'),
            ),
          ),
        ],
      ),
      body: _classes == null && _error == null
          ? const Center(child: CircularProgressIndicator())
          : _classes != null && _classes!.isEmpty
          ? const KxEmptyState(icon: Icons.event_busy_outlined, message: 'You have no classes in your timetable yet')
          : Form(
              key: _form,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s8, Kx.s16, Kx.s32),
                children: [
                  if (_error != null) ...[
                    ErrorBanner(_error!, onRetry: _classes == null ? _loadClasses : null),
                    const SizedBox(height: Kx.s16),
                  ],
                  if (_classes != null) ...[
                    DropdownButtonFormField<Ref>(
                      key: const Key('classField'),
                      initialValue: _section,
                      decoration: const InputDecoration(labelText: 'Class', prefixIcon: Icon(Icons.groups_outlined)),
                      items: [for (final s in _sections) DropdownMenuItem(value: s, child: Text(s.name))],
                      onChanged: (s) => setState(() {
                        _section = s;
                        _subject = _subjects.firstOrNull;
                      }),
                    ),
                    const SizedBox(height: Kx.s16),
                    DropdownButtonFormField<Ref>(
                      key: ValueKey('subject-${_section?.id}'),
                      initialValue: _subject,
                      decoration: const InputDecoration(labelText: 'Subject', prefixIcon: Icon(Icons.menu_book_outlined)),
                      items: [for (final s in _subjects) DropdownMenuItem(value: s, child: Text(s.name))],
                      onChanged: (s) => setState(() => _subject = s),
                      validator: (s) => s == null ? 'Choose a subject' : null,
                    ),
                    const SizedBox(height: Kx.s16),
                    TextFormField(
                      key: const Key('titleField'),
                      controller: _title,
                      maxLength: maxTitle,
                      textCapitalization: TextCapitalization.sentences,
                      decoration: const InputDecoration(labelText: 'Title', hintText: 'e.g. Exercise 4.2, questions 1–5'),
                      validator: (v) => (v ?? '').trim().isEmpty ? 'Give the homework a title' : null,
                    ),
                    const SizedBox(height: Kx.s8),
                    TextFormField(
                      key: const Key('instructionsField'),
                      controller: _instructions,
                      minLines: 4,
                      maxLines: 10,
                      maxLength: maxInstructions,
                      textCapitalization: TextCapitalization.sentences,
                      decoration: const InputDecoration(labelText: 'Instructions (optional)', alignLabelWithHint: true),
                    ),
                    const SizedBox(height: Kx.s8),
                    InkWell(
                      borderRadius: Kx.radiusMd,
                      onTap: _pickDate,
                      child: InputDecorator(
                        decoration: const InputDecoration(labelText: 'Due date', prefixIcon: Icon(Icons.event_outlined)),
                        child: Row(
                          children: [
                            Expanded(child: Text(Fmt.longDay(_due), style: context.text.bodyLarge)),
                            Text(
                              Fmt.relativeDay(_due, DateTime.now()),
                              style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),
    );
  }
}

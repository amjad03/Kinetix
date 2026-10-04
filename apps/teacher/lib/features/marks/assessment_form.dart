import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/format.dart';
import '../../core/models.dart';
import '../../widgets/common.dart';

/// "New assessment": class and subject from the teacher's timetable, title, kind, maximum marks, date.
class AssessmentForm extends StatefulWidget {
  const AssessmentForm({super.key, required this.api, this.classes, this.initialSection});

  final TeacherApi api;

  /// The teacher's classes when already loaded.
  final List<TeacherClass>? classes;
  final Ref? initialSection;

  @override
  State<AssessmentForm> createState() => _AssessmentFormState();
}

class _AssessmentFormState extends State<AssessmentForm> {
  static const maxTitle = 160;

  final _form = GlobalKey<FormState>();
  final _title = TextEditingController();
  final _max = TextEditingController(text: '25');
  List<TeacherClass>? _classes;
  Ref? _section;
  Ref? _subject;
  AssessmentKind _kind = AssessmentKind.test;
  DateTime _heldOn = DateUtils.dateOnly(DateTime.now());
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    if (widget.classes != null) {
      _setClasses(widget.classes!);
    } else {
      _loadClasses();
    }
  }

  @override
  void dispose() {
    _title.dispose();
    _max.dispose();
    super.dispose();
  }

  void _setClasses(List<TeacherClass> classes) {
    _classes = classes;
    _section = classes.where((c) => c.section == widget.initialSection).firstOrNull?.section ?? classes.firstOrNull?.section;
    _subject = _subjects.firstOrNull;
  }

  Future<void> _loadClasses() async {
    setState(() => _error = null);
    try {
      final classes = await widget.api.classes();
      setState(() => _setClasses(classes));
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
      initialDate: _heldOn,
      firstDate: today.subtract(const Duration(days: 365)),
      lastDate: today.add(const Duration(days: 180)),
      helpText: 'Held on',
    );
    if (picked != null) setState(() => _heldOn = picked);
  }

  static String? validateMax(String? v) {
    final n = double.tryParse((v ?? '').trim());
    if (n == null) return 'Enter the maximum marks';
    if (n <= 0) return 'Must be more than 0';
    if (n > 1000) return 'At most 1000';
    return null;
  }

  Future<void> _save() async {
    if (!_form.currentState!.validate()) return;
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final a = await widget.api.createAssessment(
        sectionId: _section!.id,
        subjectId: _subject!.id,
        title: _title.text.trim(),
        kind: _kind,
        maxMarks: double.parse(_max.text.trim()),
        heldOn: isoDate(_heldOn),
      );
      if (mounted) Navigator.of(context).pop(a);
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
        title: const Text('New assessment'),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: Kx.s12),
            child: FilledButton(
              key: const Key('createAssessment'),
              onPressed: _saving || _classes == null || _classes!.isEmpty ? null : _save,
              style: FilledButton.styleFrom(minimumSize: const Size(64, 40)),
              child: _saving
                  ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Text('Create'),
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
                      key: const Key('assessmentClassField'),
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
                      key: ValueKey('assessmentSubject-${_section?.id}'),
                      initialValue: _subject,
                      decoration: const InputDecoration(labelText: 'Subject', prefixIcon: Icon(Icons.menu_book_outlined)),
                      items: [for (final s in _subjects) DropdownMenuItem(value: s, child: Text(s.name))],
                      onChanged: (s) => setState(() => _subject = s),
                      validator: (s) => s == null ? 'Choose a subject' : null,
                    ),
                    const SizedBox(height: Kx.s16),
                    TextFormField(
                      key: const Key('assessmentTitleField'),
                      controller: _title,
                      maxLength: maxTitle,
                      textCapitalization: TextCapitalization.sentences,
                      decoration: const InputDecoration(labelText: 'Title', hintText: 'e.g. Unit test 2: Redemption of shares'),
                      validator: (v) => (v ?? '').trim().isEmpty ? 'Give it a title' : null,
                    ),
                    const SizedBox(height: Kx.s8),
                    Text('Kind', style: context.text.labelLarge?.copyWith(color: c.onSurfaceVariant)),
                    const SizedBox(height: Kx.s8),
                    Wrap(
                      spacing: Kx.s8,
                      runSpacing: Kx.s8,
                      children: [
                        for (final k in AssessmentKind.values)
                          ChoiceChip(
                            key: Key('kind-${k.name}'),
                            label: Text(k.label),
                            selected: _kind == k,
                            onSelected: (_) => setState(() => _kind = k),
                          ),
                      ],
                    ),
                    const SizedBox(height: Kx.s24),
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          flex: 2,
                          child: TextFormField(
                            key: const Key('maxMarksField'),
                            controller: _max,
                            keyboardType: const TextInputType.numberWithOptions(decimal: true),
                            inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))],
                            decoration: const InputDecoration(labelText: 'Out of', prefixIcon: Icon(Icons.grading_outlined)),
                            validator: validateMax,
                          ),
                        ),
                        const SizedBox(width: Kx.s12),
                        Expanded(
                          flex: 3,
                          child: InkWell(
                            borderRadius: Kx.radiusMd,
                            onTap: _pickDate,
                            child: InputDecorator(
                              decoration: const InputDecoration(labelText: 'Held on', prefixIcon: Icon(Icons.event_outlined)),
                              child: Text(Fmt.shortDay(_heldOn), style: context.text.bodyLarge, maxLines: 1),
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: Kx.s16),
                    Text(
                      'Marks stay private until you publish them. Then students and their families see their own marks and the class average.',
                      style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant),
                    ),
                  ],
                ],
              ),
            ),
    );
  }
}

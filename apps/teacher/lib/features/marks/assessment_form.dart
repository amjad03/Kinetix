import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/format.dart';
import '../../core/l10n.dart';
import '../../core/models.dart';
import '../../widgets/class_picker.dart';
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
  ApiException? _error;

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
      setState(() => _error = e);
    }
  }

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
      helpText: context.l10n.heldOn,
    );
    if (picked != null) setState(() => _heldOn = picked);
  }

  static String? validateMax(AppLocalizations l, String? v) {
    final n = double.tryParse((v ?? '').trim());
    if (n == null) return l.enterMaxMarks;
    if (n <= 0) return l.maxMustBePositive;
    if (n > 1000) return l.maxAtMost1000;
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
      if (mounted) setState(() => (_error = e, _saving = false));
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final l = context.l10n;
    return Scaffold(
      appBar: AppBar(
        leading: const CloseButton(),
        title: Text(l.newAssessment),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: Kx.s12),
            child: FilledButton(
              key: const Key('createAssessment'),
              onPressed: _saving || _classes == null || _classes!.isEmpty ? null : _save,
              style: FilledButton.styleFrom(minimumSize: const Size(64, 40)),
              child: _saving ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2)) : Text(l.create),
            ),
          ),
        ],
      ),
      body: _classes == null && _error == null
          ? const Center(child: CircularProgressIndicator())
          : _classes != null && _classes!.isEmpty
          ? KxEmptyState(icon: Icons.event_busy_outlined, message: l.noClassesInTimetable)
          : Form(
              key: _form,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s8, Kx.s16, Kx.s32),
                children: [
                  if (_error != null) ...[
                    ErrorBanner.api(_error!, onRetry: _classes == null ? _loadClasses : null),
                    const SizedBox(height: Kx.s16),
                  ],
                  if (_classes != null) ...[
                    ClassSubjectPicker(
                      classes: _classes!,
                      section: _section,
                      subject: _subject,
                      onChanged: (c) => setState(() {
                        _section = c.section;
                        _subject = c.subject;
                      }),
                    ),
                    const SizedBox(height: Kx.s16),
                    TextFormField(
                      key: const Key('assessmentTitleField'),
                      controller: _title,
                      maxLength: maxTitle,
                      textCapitalization: TextCapitalization.sentences,
                      decoration: InputDecoration(labelText: l.titleLabel, hintText: l.assessmentTitleHint),
                      validator: (v) => (v ?? '').trim().isEmpty ? l.assessmentTitleRequired : null,
                    ),
                    const SizedBox(height: Kx.s8),
                    Text(l.kind, style: context.text.labelLarge?.copyWith(color: c.onSurfaceVariant)),
                    const SizedBox(height: Kx.s8),
                    Wrap(
                      spacing: Kx.s8,
                      runSpacing: Kx.s8,
                      children: [
                        for (final k in AssessmentKind.values)
                          ChoiceChip(
                            key: Key('kind-${k.name}'),
                            label: Text(l.assessmentKind(k)),
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
                            decoration: InputDecoration(labelText: l.outOf, prefixIcon: const Icon(Icons.grading_outlined)),
                            validator: (v) => validateMax(l, v),
                          ),
                        ),
                        const SizedBox(width: Kx.s12),
                        Expanded(
                          flex: 3,
                          child: InkWell(
                            borderRadius: Kx.radiusMd,
                            onTap: _pickDate,
                            child: InputDecorator(
                              decoration: InputDecoration(labelText: l.heldOn, prefixIcon: const Icon(Icons.event_outlined)),
                              child: Text(
                                Fmt.of(context).shortDay(_heldOn),
                                style: context.text.bodyLarge,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: Kx.s16),
                    Text(l.marksPrivateNote, style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant)),
                  ],
                ],
              ),
            ),
    );
  }
}

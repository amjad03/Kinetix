import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/format.dart';
import '../../core/l10n.dart';
import '../../core/models.dart';
import '../../widgets/common.dart';

/// What the teacher has typed for one student, compared with what is saved.
class MarkDraft {
  MarkDraft(this.saved) : text = TextEditingController(text: saved.marks == null ? '' : formatMarks(saved.marks!));

  MarkEntry saved;
  final TextEditingController text;
  final focus = FocusNode();
  late bool absent = saved.absent;
  late String remark = saved.remark ?? '';

  Student get student => saved.student;
  double? get marks => absent ? null : double.tryParse(text.text);
  bool get blank => !absent && text.text.trim().isEmpty;

  bool get changed {
    if (absent != saved.absent || remark != (saved.remark ?? '')) return true;
    if (absent) return false;
    final t = text.text.trim();
    if (t.isEmpty) return saved.marks != null;
    return double.tryParse(t) != saved.marks;
  }

  void reset(MarkEntry e) {
    saved = e;
    absent = e.absent;
    remark = e.remark ?? '';
    text.text = e.marks == null ? '' : formatMarks(e.marks!);
  }

  void dispose() {
    text.dispose();
    focus.dispose();
  }
}

/// What is wrong with the marks typed for one student.
enum MarkProblem { notANumber, overMax }

/// State for entering one assessment's marks: the roster, edits, validation, save and publish.
class MarksEntryController extends ChangeNotifier {
  MarksEntryController({required this.api, required Assessment assessment}) : a = assessment;

  final TeacherApi api;
  Assessment a;
  final rows = <MarkDraft>[];
  bool loading = false;
  bool saving = false;
  bool publishing = false;
  ApiException? error;

  Future<void> load() async {
    loading = true;
    error = null;
    notifyListeners();
    try {
      _apply(await api.assessment(a.id));
    } on ApiException catch (e) {
      error = e;
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  void _apply(Assessment detail) {
    a = detail;
    final byId = {for (final r in rows) r.student.id: r};
    final next = <MarkDraft>[];
    for (final e in detail.students ?? const <MarkEntry>[]) {
      final r = byId.remove(e.student.id);
      if (r != null) {
        r.reset(e);
        next.add(r);
      } else {
        next.add(MarkDraft(e)..text.addListener(notifyListeners));
      }
    }
    for (final r in byId.values) {
      r.dispose();
    }
    rows
      ..clear()
      ..addAll(next);
  }

  /// The problem with what was typed for [r], or null.
  MarkProblem? problemFor(MarkDraft r) {
    if (r.absent) return null;
    final t = r.text.text.trim();
    if (t.isEmpty) return null;
    final n = double.tryParse(t);
    if (n == null) return MarkProblem.notANumber;
    if (n > a.maxMarks) return MarkProblem.overMax;
    return null;
  }

  bool get dirty => rows.any((r) => r.changed);
  int get invalid => rows.where((r) => problemFor(r) != null).length;
  int get marked => rows.where((r) => !r.absent && r.marks != null).length;
  int get absentCount => rows.where((r) => r.absent).length;
  int get blankCount => rows.where((r) => r.blank).length;

  void setAbsent(MarkDraft r, bool absent) {
    r.absent = absent;
    if (absent) r.text.clear();
    notifyListeners();
  }

  void setRemark(MarkDraft r, String remark) {
    r.remark = remark.trim();
    notifyListeners();
  }

  /// Saves the rows that changed (call only when [invalid] is 0). Returns the error, or null.
  Future<ApiException?> save() async {
    final changed = rows.where((r) => r.changed).toList();
    if (changed.isEmpty) return null;
    saving = true;
    notifyListeners();
    try {
      _apply(
        await api.saveMarks(a.id, [
          for (final r in changed)
            MarkInput(studentId: r.student.id, marks: r.marks, absent: r.absent, remark: r.remark.isEmpty ? null : r.remark),
        ]),
      );
      return null;
    } on ApiException catch (e) {
      return e;
    } finally {
      saving = false;
      notifyListeners();
    }
  }

  Future<ApiException?> publish() async {
    publishing = true;
    notifyListeners();
    try {
      _apply(await api.publishAssessment(a.id));
      return null;
    } on ApiException catch (e) {
      return e;
    } finally {
      publishing = false;
      notifyListeners();
    }
  }

  @override
  void dispose() {
    for (final r in rows) {
      r.dispose();
    }
    super.dispose();
  }
}

/// "2 of 3 marked · 1 absent"
String marksSummary(AppLocalizations l, MarksEntryController c) =>
    [l.markedOf(c.marked, c.rows.length), if (c.absentCount > 0) l.countAbsent(c.absentCount)].join(' · ');

/// Lets through digits and one decimal point with up to two places ("22.5"); a comma counts as the point.
class _MarksFormatter extends TextInputFormatter {
  static final _ok = RegExp(r'^\d{0,4}(\.\d{0,2})?$');

  @override
  TextEditingValue formatEditUpdate(TextEditingValue oldValue, TextEditingValue newValue) {
    final t = newValue.text.replaceAll(',', '.');
    if (!_ok.hasMatch(t)) return oldValue;
    return newValue.copyWith(text: t);
  }
}

/// Phone-first marks entry: the class in roll order, a numeric field per student with Next to move
/// down, an Absent toggle and an optional remark. Save, then Publish to families.
class MarksEntryScreen extends StatefulWidget {
  const MarksEntryScreen({super.key, required this.api, required this.assessment, this.onChanged});

  final TeacherApi api;
  final Assessment assessment;

  /// Called with the saved or published assessment, so lists can update.
  final ValueChanged<Assessment>? onChanged;

  @override
  State<MarksEntryScreen> createState() => _MarksEntryScreenState();
}

class _MarksEntryScreenState extends State<MarksEntryScreen> {
  late final controller = MarksEntryController(api: widget.api, assessment: widget.assessment)..load();

  @override
  void dispose() {
    controller.dispose();
    super.dispose();
  }

  void _next(int i) {
    final rows = controller.rows;
    for (var j = i + 1; j < rows.length; j++) {
      if (!rows[j].absent) {
        rows[j].focus.requestFocus();
        rows[j].text.selection = TextSelection(baseOffset: 0, extentOffset: rows[j].text.text.length);
        return;
      }
    }
    FocusScope.of(context).unfocus();
  }

  Future<void> _save() async {
    FocusScope.of(context).unfocus();
    final messenger = ScaffoldMessenger.of(context)..hideCurrentSnackBar();
    final l = context.l10n;
    if (controller.invalid > 0) {
      messenger.showSnackBar(SnackBar(content: Text(l.marksNeedFixing(controller.invalid))));
      return;
    }
    final error = await controller.save();
    if (!mounted) return;
    if (error != null) {
      messenger.showSnackBar(SnackBar(content: Text(l.errorText(error))));
      return;
    }
    widget.onChanged?.call(controller.a);
    final avg = controller.a.stats?.average;
    messenger.showSnackBar(
      SnackBar(
        content: Text(
          [
            l.marksSaved,
            if (avg != null) l.savedClassAverage(formatMarks(avg), formatMarks(controller.a.maxMarks)),
            if (controller.a.isPublished) l.familiesSeeUpdate,
          ].join(' · '),
        ),
      ),
    );
  }

  Future<void> _publish() async {
    final a = controller.a;
    final blank = controller.blankCount;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(ctx.l10n.publishTitle),
        content: Text([ctx.l10n.publishBody, if (blank > 0) ctx.l10n.publishBlank(blank), ctx.l10n.publishCanCorrect].join('\n\n')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(ctx.l10n.cancel)),
          FilledButton(key: const Key('confirmPublish'), onPressed: () => Navigator.pop(ctx, true), child: Text(ctx.l10n.publish)),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    final messenger = ScaffoldMessenger.of(context)..hideCurrentSnackBar();
    final l = context.l10n;
    final error = await controller.publish();
    if (!mounted) return;
    if (error != null) {
      messenger.showSnackBar(SnackBar(content: Text(l.errorText(error))));
      return;
    }
    widget.onChanged?.call(controller.a);
    messenger.showSnackBar(SnackBar(content: Text(l.publishedNotified(a.title))));
  }

  Future<void> _editRemark(MarkDraft r) async {
    final result = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _RemarkSheet(name: r.student.fullName, initial: r.remark),
    );
    if (result != null) controller.setRemark(r, result);
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: controller,
      builder: (context, _) {
        final a = controller.a;
        final dirty = controller.dirty;
        final ready = !controller.loading && controller.error == null && controller.rows.isNotEmpty;
        return PopScope(
          canPop: !dirty,
          onPopInvokedWithResult: (didPop, _) async {
            if (didPop) return;
            final navigator = Navigator.of(context);
            if (await confirmDiscard(context)) navigator.pop();
          },
          child: Scaffold(
            appBar: AppBar(
              title: Text(a.title, maxLines: 1, overflow: TextOverflow.ellipsis),
              actions: [
                if (ready)
                  Padding(
                    padding: const EdgeInsets.only(right: Kx.s12),
                    child: FilledButton(
                      key: const Key('saveMarks'),
                      onPressed: dirty && !controller.saving ? _save : null,
                      style: FilledButton.styleFrom(minimumSize: const Size(64, 40)),
                      child: controller.saving
                          ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2))
                          : Text(context.l10n.save),
                    ),
                  ),
              ],
            ),
            body: controller.loading && controller.rows.isEmpty
                ? const Center(child: CircularProgressIndicator())
                : controller.error != null && controller.rows.isEmpty
                ? Padding(
                    padding: const EdgeInsets.all(Kx.s16),
                    child: ErrorBanner.api(controller.error!, onRetry: controller.load),
                  )
                : controller.rows.isEmpty
                ? KxEmptyState(icon: Icons.groups_outlined, message: context.l10n.noStudentsInClass)
                // Every row is built (not lazily) so Next on the keypad can always reach the next field.
                : SingleChildScrollView(
                    keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.manual,
                    padding: const EdgeInsets.only(bottom: Kx.s24),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        _Header(controller: controller),
                        for (var i = 0; i < controller.rows.length; i++)
                          _MarkRow(
                            row: controller.rows[i],
                            maxMarks: a.maxMarks,
                            error: switch (controller.problemFor(controller.rows[i])) {
                              MarkProblem.notANumber => context.l10n.notANumber,
                              MarkProblem.overMax => context.l10n.maxN(formatMarks(a.maxMarks)),
                              null => null,
                            },
                            last: i == controller.rows.length - 1,
                            onNext: () => _next(i),
                            onAbsent: (v) => controller.setAbsent(controller.rows[i], v),
                            onRemark: () => _editRemark(controller.rows[i]),
                          ),
                      ],
                    ),
                  ),
            bottomNavigationBar: ready ? _Bar(controller: controller, onPublish: _publish) : null,
          ),
        );
      },
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.controller});

  final MarksEntryController controller;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final l = context.l10n;
    final a = controller.a;
    final s = a.stats;
    final (goodBg, good) = goodColors(context);
    final out = formatMarks(a.maxMarks);
    return Padding(
      padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s4, Kx.s16, Kx.s8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  '${a.subject.name} · ${l.assessmentKind(a.kind)} · ${Fmt.of(context).shortDay(a.heldOn)}',
                  style: context.text.bodyLarge,
                ),
              ),
              const SizedBox(width: Kx.s8),
              a.isPublished
                  ? Pill(l.published, key: const Key('statePill'), icon: Icons.check, background: goodBg, foreground: good)
                  : Pill(
                      l.draft,
                      key: const Key('statePill'),
                      icon: Icons.edit_outlined,
                      background: c.surfaceContainerHighest,
                      foreground: c.onSurfaceVariant,
                    ),
            ],
          ),
          const SizedBox(height: Kx.s12),
          if (s != null && s.count > 0)
            Card(
              key: const Key('marksStats'),
              color: c.surfaceContainerLow,
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: Kx.s12),
                child: Row(
                  children: [
                    _Stat(l.statAverage, '${formatMarks(s.average!)}/$out'),
                    _Stat(l.statHighest, formatMarks(s.highest!)),
                    _Stat(l.statLowest, formatMarks(s.lowest!)),
                    _Stat(l.statMarked, '${s.count}/${controller.rows.length}'),
                  ],
                ),
              ),
            )
          else
            Text(l.typeMarksHint(out), style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant)),
          const SizedBox(height: Kx.s8),
          Row(
            children: [
              Expanded(
                child: Text(l.columnStudent, style: context.text.labelMedium?.copyWith(color: c.onSurfaceVariant)),
              ),
              Text(
                l.outOfN(out),
                key: const Key('outOfColumn'),
                style: context.text.labelMedium?.copyWith(color: c.onSurfaceVariant),
              ),
              const SizedBox(width: Kx.s12),
            ],
          ),
        ],
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat(this.label, this.value);

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Expanded(
    child: Column(
      children: [
        Text(value, style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w500)),
        const SizedBox(height: 2),
        Text(
          label,
          textAlign: TextAlign.center,
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          style: context.text.bodySmall?.copyWith(color: context.colors.onSurfaceVariant),
        ),
      ],
    ),
  );
}

class _MarkRow extends StatelessWidget {
  const _MarkRow({
    required this.row,
    required this.maxMarks,
    required this.error,
    required this.last,
    required this.onNext,
    required this.onAbsent,
    required this.onRemark,
  });

  final MarkDraft row;
  final double maxMarks;
  final String? error;
  final bool last;
  final VoidCallback onNext;
  final ValueChanged<bool> onAbsent;
  final VoidCallback onRemark;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final l = context.l10n;
    final s = row.student;
    final hasRemark = row.remark.isNotEmpty;
    return Container(
      key: ValueKey('markRow-${s.id}'),
      // Always a colour (never null) so the tree, and the field's focus, survive the first keystroke.
      color: row.changed ? c.primaryContainer.withValues(alpha: 0.25) : Colors.transparent,
      padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s4, Kx.s12, Kx.s4),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(s.fullName, maxLines: 1, overflow: TextOverflow.ellipsis, style: context.text.bodyLarge),
                Text(
                  hasRemark ? '${s.rollNo} · ${row.remark}' : s.rollNo,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant),
                ),
              ],
            ),
          ),
          IconButton(
            key: ValueKey('remark-${s.id}'),
            tooltip: hasRemark ? l.editRemark : l.addRemark,
            onPressed: onRemark,
            icon: Icon(hasRemark ? Icons.comment : Icons.add_comment_outlined, size: 20, color: hasRemark ? c.primary : c.onSurfaceVariant),
          ),
          FilterChip(
            key: ValueKey('absent-${s.id}'),
            label: Text(l.statusAbsent),
            selected: row.absent,
            showCheckmark: false,
            visualDensity: VisualDensity.compact,
            materialTapTargetSize: MaterialTapTargetSize.padded,
            selectedColor: c.errorContainer,
            side: BorderSide(color: row.absent ? c.errorContainer : c.outlineVariant),
            labelStyle: TextStyle(color: row.absent ? c.onErrorContainer : c.onSurfaceVariant),
            onSelected: onAbsent,
          ),
          const SizedBox(width: Kx.s8),
          SizedBox(
            width: 76,
            child: TextField(
              key: ValueKey('marks-${s.id}'),
              controller: row.text,
              focusNode: row.focus,
              enabled: !row.absent,
              textAlign: TextAlign.center,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              textInputAction: last ? TextInputAction.done : TextInputAction.next,
              inputFormatters: [_MarksFormatter()],
              onSubmitted: (_) => onNext(),
              style: context.text.titleMedium,
              scrollPadding: const EdgeInsets.only(bottom: 120),
              decoration: InputDecoration(
                isDense: true,
                hintText: row.absent ? l.absentShort : '–',
                contentPadding: const EdgeInsets.symmetric(horizontal: Kx.s8, vertical: Kx.s12),
                errorText: error,
                errorMaxLines: 1,
                errorStyle: const TextStyle(fontSize: 11, height: 1),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Bar extends StatelessWidget {
  const _Bar({required this.controller, required this.onPublish});

  final MarksEntryController controller;
  final VoidCallback onPublish;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final l = context.l10n;
    final a = controller.a;
    final dirty = controller.dirty;
    final invalid = controller.invalid;
    final String hint;
    if (invalid > 0) {
      hint = l.marksOverMax(invalid, formatMarks(a.maxMarks));
    } else if (dirty) {
      hint = l.notSavedYet;
    } else if (a.isPublished) {
      hint = l.publishedFamiliesSee;
    } else if (a.entered == 0) {
      hint = l.typeMarksThenSave;
    } else {
      hint = l.savedOnlyYou;
    }
    return Material(
      color: c.surfaceContainer,
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s12, Kx.s16, Kx.s12),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(marksSummary(l, controller), key: const Key('marksSummary'), style: context.text.titleSmall),
                    Text(
                      hint,
                      key: const Key('marksHint'),
                      style: context.text.bodySmall?.copyWith(color: invalid > 0 ? c.error : c.onSurfaceVariant),
                    ),
                  ],
                ),
              ),
              if (!a.isPublished) ...[
                const SizedBox(width: Kx.s8),
                FilledButton.icon(
                  key: const Key('publishMarks'),
                  onPressed: dirty || controller.publishing || a.entered == 0 ? null : onPublish,
                  icon: controller.publishing
                      ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2))
                      : const Icon(Icons.send_outlined, size: 18),
                  label: Text(l.publish),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// Remark for one student; pops with the text ('' removes it) or null when cancelled.
class _RemarkSheet extends StatefulWidget {
  const _RemarkSheet({required this.name, required this.initial});

  final String name;
  final String initial;

  @override
  State<_RemarkSheet> createState() => _RemarkSheetState();
}

class _RemarkSheetState extends State<_RemarkSheet> {
  late final _text = TextEditingController(text: widget.initial);

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return Padding(
      padding: EdgeInsets.fromLTRB(Kx.s24, 0, Kx.s24, MediaQuery.viewInsetsOf(context).bottom + Kx.s16),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(l.remarkFor(widget.name), style: context.text.titleMedium),
          const SizedBox(height: Kx.s4),
          Text(l.remarkFamiliesSee, style: context.text.bodyMedium?.copyWith(color: context.colors.onSurfaceVariant)),
          const SizedBox(height: Kx.s16),
          TextField(
            key: const Key('remarkField'),
            controller: _text,
            autofocus: true,
            maxLength: 300,
            minLines: 2,
            maxLines: 4,
            textCapitalization: TextCapitalization.sentences,
            decoration: InputDecoration(hintText: l.remarkHint),
          ),
          const SizedBox(height: Kx.s8),
          // Wraps onto two lines when the labels are long (Kannada at large text sizes).
          Wrap(
            alignment: WrapAlignment.end,
            spacing: Kx.s8,
            children: [
              if (widget.initial.isNotEmpty)
                TextButton(key: const Key('removeRemark'), onPressed: () => Navigator.pop(context, ''), child: Text(l.remove)),
              TextButton(onPressed: () => Navigator.pop(context), child: Text(l.cancel)),
              FilledButton(key: const Key('saveRemark'), onPressed: () => Navigator.pop(context, _text.text), child: Text(l.done)),
            ],
          ),
        ],
      ),
    );
  }
}

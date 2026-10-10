import 'dart:async';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:kinetix_ui/kinetix_ui.dart';
import 'package:share_plus/share_plus.dart';

import '../../core/board_controller.dart';
import 'chrome.dart';
import 'classroom_profile_strings.dart';
import 'panel/panel_host.dart';

/// Opens the Android share sheet with a text (and the board PDF when there is one), where the
/// teacher picks WhatsApp. Tests replace it.
Future<void> Function(String text, {String? pdfName, Uint8List? pdf}) shareClassNotes = (text, {pdfName, pdf}) async {
  await SharePlus.instance.share(
    ShareParams(text: text, files: pdf == null ? null : [XFile.fromData(pdf, name: pdfName ?? 'class.pdf', mimeType: 'application/pdf')], fileNameOverrides: pdf == null ? null : [pdfName ?? 'class.pdf']),
  );
};

String _when(BuildContext context, String iso) => DateFormat('EEE d MMM, h:mm a', Localizations.localeOf(context).toLanguageTag()).format(DateTime.parse(iso).toLocal());

/// Your Classrooms: every class and subject the teacher has taught or is timetabled for, with how
/// many sessions they took and when last, and a button to open that class on the board.
Future<void> showClassroomsDialog(BuildContext context, BoardController board) {
  return showPanelDialog<void>(context: context, builder: (_) => BoardChromeTheme(child: _ClassroomsDialog(board: board)));
}

class _ClassroomsDialog extends StatefulWidget {
  const _ClassroomsDialog({required this.board});

  final BoardController board;

  @override
  State<_ClassroomsDialog> createState() => _ClassroomsDialogState();
}

class _ClassroomsDialogState extends State<_ClassroomsDialog> {
  List<Map<String, dynamic>>? _rows;
  bool _failed = false;

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  Future<void> _load() async {
    try {
      final rows = await widget.board.api!.classrooms();
      if (mounted) setState(() => _rows = rows);
    } catch (_) {
      if (mounted) setState(() => _failed = true);
    }
  }

  Future<void> _open(Map<String, dynamic> c) async {
    final s = classroomStrings(context);
    try {
      final ctx = await widget.board.api!.openClassroom(c['sectionId'] as String, c['subjectId'] as String?);
      await widget.board.refreshSessionContext(ctx);
      if (!mounted) return;
      Navigator.of(context).pop();
      showBoardMessage(context, s.t('classroomsOpened').replaceAll('{c}', '${c['className']}'));
    } catch (_) {
      if (mounted) showBoardMessage(context, s.t('classroomsFailed'));
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = classroomStrings(context);
    final rows = _rows;
    return AlertDialog(
      key: const Key('classrooms-dialog'),
      title: Text(s.t('classroomsTitle')),
      content: SizedBox(
        width: 560,
        child: _failed
            ? Text(s.t('classroomsFailed'), key: const Key('classrooms-failed'))
            : rows == null
            ? const Center(heightFactor: 2, child: CircularProgressIndicator())
            : rows.isEmpty
            ? Text(s.t('classroomsEmpty'), key: const Key('classrooms-empty'))
            : ListView(
                shrinkWrap: true,
                children: [
                  for (final c in rows)
                    ListTile(
                      key: Key('classroom-${c['sectionId']}-${c['subjectId']}'),
                      leading: const Icon(Icons.meeting_room_outlined),
                      title: Text('${c['className']}${c['subject'] == null ? '' : ' · ${c['subject']}'}'),
                      subtitle: Text(
                        [
                          if (c['standard'] != null) s.n('classroomsStandard', c['standard']!),
                          s.n('classroomsSessions', c['sessions']!),
                          c['lastTakenAt'] == null ? s.t('classroomsNever') : s.t('classroomsLast').replaceAll('{d}', _when(context, c['lastTakenAt'] as String)),
                        ].join(' · '),
                      ),
                      trailing: FilledButton.tonal(key: Key('classroom-open-${c['sectionId']}-${c['subjectId']}'), onPressed: () => unawaited(_open(c)), child: Text(s.t('classroomsOpen'))),
                    ),
                ],
              ),
      ),
      actions: [TextButton(onPressed: () => Navigator.of(context).pop(), child: Text(MaterialLocalizations.of(context).closeButtonLabel))],
    );
  }
}

/// Schedule a training: pick one of the offered slots, say what you want to learn and send the
/// request; the institution's answer shows under "Your requests".
class TrainingScheduler extends StatefulWidget {
  const TrainingScheduler({super.key, required this.board});

  final BoardController board;

  @override
  State<TrainingScheduler> createState() => _TrainingSchedulerState();
}

class _TrainingSchedulerState extends State<TrainingScheduler> {
  List<Map<String, dynamic>> _slots = const [];
  List<Map<String, dynamic>> _mine = const [];
  String? _slot;
  String? _note;
  final _topic = TextEditingController();

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  @override
  void dispose() {
    _topic.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final slots = await widget.board.api!.trainingSlots();
      final mine = await widget.board.api!.myTrainings();
      if (mounted) {
        setState(() {
          _slots = slots;
          _mine = mine;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _note = 'trainingFailed');
    }
  }

  Future<void> _send() async {
    final slot = _slot;
    if (slot == null || _topic.text.trim().length < 2) return;
    try {
      await widget.board.api!.requestTraining(slot, _topic.text.trim());
      _topic.clear();
      final mine = await widget.board.api!.myTrainings();
      if (mounted) {
        setState(() {
          _mine = mine;
          _note = 'trainingSent:${_when(context, slot)}';
          _slot = null;
        });
      }
      await _load();
    } catch (_) {
      if (mounted) setState(() => _note = 'trainingFailed');
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = classroomStrings(context);
    final note = _note == null ? null : (_note!.startsWith('trainingSent:') ? s.t('trainingSent').replaceAll('{d}', _note!.substring(13)) : s.t(_note!));
    return Column(
      key: const Key('training-scheduler'),
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(s.t('trainingPick'), style: context.text.titleSmall),
        const SizedBox(height: Kx.s8),
        Wrap(
          spacing: Kx.s8,
          runSpacing: Kx.s8,
          children: [
            for (final slot in _slots)
              ChoiceChip(
                key: Key('slot-${slot['at']}'),
                label: Text(slot['taken'] == true ? '${_when(context, slot['at'] as String)} · ${s.t('trainingFull')}' : _when(context, slot['at'] as String)),
                selected: _slot == slot['at'],
                onSelected: slot['taken'] == true ? null : (v) => setState(() => _slot = v ? slot['at'] as String : null),
              ),
          ],
        ),
        const SizedBox(height: Kx.s12),
        TextField(key: const Key('training-topic'), controller: _topic, onChanged: (_) => setState(() {}), decoration: InputDecoration(labelText: s.t('trainingTopic'), border: const OutlineInputBorder())),
        const SizedBox(height: Kx.s8),
        FilledButton(key: const Key('training-send'), onPressed: _slot != null && _topic.text.trim().length >= 2 ? () => unawaited(_send()) : null, child: Text(s.t('trainingSend'))),
        if (note != null) Padding(padding: const EdgeInsets.only(top: Kx.s8), child: Text(note, key: const Key('training-note'))),
        const SizedBox(height: Kx.s12),
        Text(s.t('trainingMine'), style: context.text.titleSmall),
        if (_mine.isEmpty) Text(s.t('trainingNone')),
        for (final r in _mine)
          ListTile(
            key: Key('training-${r['id']}'),
            dense: true,
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.event_available_outlined),
            title: Text('${r['topic']}'),
            subtitle: Text('${_when(context, r['slotAt'] as String)}${(r['adminNote'] as String? ?? '').isEmpty ? '' : '\n${r['adminNote']}'}'),
            trailing: Chip(label: Text(s.t(switch (r['status']) { 'confirmed' => 'stConfirmed', 'done' => 'stDone', 'cancelled' => 'stCancelled', _ => 'stRequested' }))),
          ),
      ],
    );
  }
}

/// What the End class dialog collected: the notes and whether students get them.
class EndClassNotes {
  const EndClassNotes(this.notes, this.publish);

  final String notes;
  final bool publish;
}

/// After the class ended: how long, what was saved, and a WhatsApp button (Android share sheet).
Future<void> showEndSummary(BuildContext context, BoardController board, Map<String, dynamic> result, {Future<Uint8List> Function()? pdf, String pdfName = 'class.pdf'}) {
  final s = classroomStrings(context);
  final summary = (result['summary'] as Map?)?.cast<String, dynamic>() ?? const {};
  final path = result['sharePath'] as String?;
  final base = board.api?.baseUrl;
  final url = path == null || base == null ? null : '$base$path';
  final buzzes = (summary['buzzes'] as num?)?.toInt() ?? 0;
  return showPanelDialog<void>(
    context: context,
    builder: (ctx) => AlertDialog(
      key: const Key('end-summary'),
      icon: const Icon(Icons.check_circle_outline),
      title: Text(s.t('endSummaryTitle')),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(s.t('endSummaryLine').replaceAll('{m}', '${summary['minutes'] ?? 0}').replaceAll('{s}', [summary['section'], summary['subject']].whereType<String>().join(' · '))),
          if (buzzes > 0) Text(s.n('endSummaryBuzz', buzzes)),
          if (result['notesSaved'] == true) Text(result['published'] == true ? s.t('endNotesPublished') : s.t('endNotesSaved'), key: const Key('end-summary-notes')),
        ],
      ),
      actions: [
        if (url != null)
          OutlinedButton.icon(
            key: const Key('end-share-whatsapp'),
            icon: const Icon(Icons.chat_outlined),
            label: Text(s.t('endShare')),
            onPressed: () async => shareClassNotes(s.t('endShareText').replaceAll('{u}', url), pdfName: pdfName, pdf: pdf == null ? null : await pdf()),
          ),
        FilledButton(onPressed: () => Navigator.of(ctx).pop(), child: Text(s.t('endDone'))),
      ],
    ),
  );
}

import 'package:flutter/material.dart';
import 'package:zynetix_ui/zynetix_ui.dart';

import '../../core/api.dart';
import '../../core/format.dart';
import '../../core/l10n.dart';

/// The teacher's chat do-not-disturb (`/v1/conversations/me/availability`).
class Availability {
  const Availability({this.dndUntil, this.awayNote = ''});

  factory Availability.fromJson(Map<String, dynamic> j) {
    final until = j['dndUntil'] == null ? null : DateTime.parse(j['dndUntil'] as String).toLocal();
    return Availability(dndUntil: (j['active'] as bool? ?? false) ? until : null, awayNote: j['awayNote'] as String? ?? '');
  }

  /// Set while do-not-disturb is on.
  final DateTime? dndUntil;
  final String awayNote;
}

/// Do not disturb: families are told when to expect a reply and the phone gets no chat alerts until then.
/// Emergency notices still come through.
class DndSheet extends StatefulWidget {
  const DndSheet({super.key, required this.api, required this.current});

  final TeacherApi api;
  final Availability current;

  /// Opens the sheet; resolves with the new state when it was changed.
  static Future<Availability?> open(BuildContext context, TeacherApi api) async {
    final current = await api.availability();
    if (!context.mounted) return null;
    return showModalBottomSheet<Availability>(context: context, isScrollControlled: true, showDragHandle: true, builder: (_) => DndSheet(api: api, current: current));
  }

  @override
  State<DndSheet> createState() => _DndSheetState();
}

class _DndSheetState extends State<DndSheet> {
  late final TextEditingController _note = TextEditingController(text: widget.current.awayNote);
  bool _saving = false;

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  Future<void> _set(DateTime? until) async {
    setState(() => _saving = true);
    try {
      final a = await widget.api.setAvailability(until, _note.text.trim());
      if (mounted) Navigator.of(context).pop(a);
    } on ApiException catch (e) {
      if (mounted) {
        setState(() => _saving = false);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(context.l10n.errorText(e))));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final c = context.colors;
    final now = DateTime.now();
    final tomorrow = DateTime(now.year, now.month, now.day + 1, 8);
    final on = widget.current.dndUntil;
    return Padding(
      padding: EdgeInsets.fromLTRB(Kx.s16, 0, Kx.s16, Kx.s16 + MediaQuery.viewInsetsOf(context).bottom),
      child: Column(
        key: const Key('dndSheet'),
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(l.dndTitle, style: context.text.titleLarge),
          const SizedBox(height: Kx.s4),
          Text(on == null ? l.dndHelp : l.dndOnUntil(Fmt.of(context).when(on)), key: const Key('dndState'), style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant)),
          const SizedBox(height: Kx.s12),
          TextField(controller: _note, maxLength: 200, decoration: InputDecoration(labelText: l.dndNote)),
          const SizedBox(height: Kx.s8),
          FilledButton.tonal(key: const Key('dnd2h'), onPressed: _saving ? null : () => _set(now.add(const Duration(hours: 2))), child: Text(l.dndTwoHours)),
          const SizedBox(height: Kx.s8),
          FilledButton.tonal(key: const Key('dndTomorrow'), onPressed: _saving ? null : () => _set(tomorrow), child: Text(l.dndTomorrow)),
          if (on != null) ...[
            const SizedBox(height: Kx.s8),
            OutlinedButton(key: const Key('dndOff'), onPressed: _saving ? null : () => _set(null), child: Text(l.dndOff)),
          ],
        ],
      ),
    );
  }
}

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/buzzer.dart';
import '../../l10n/l10n.dart';

/// The class buzzer on Today: when the teacher opens it on the board, a big Buzz button; the
/// board shows who was first. Refreshes every few seconds while Today is on screen.
class BuzzerCard extends StatefulWidget {
  const BuzzerCard({super.key, required this.api, this.every = const Duration(seconds: 3)});

  final StudentApi api;
  final Duration every;

  @override
  State<BuzzerCard> createState() => _BuzzerCardState();
}

class _BuzzerCardState extends State<BuzzerCard> {
  BuzzerStatus? _status;
  Timer? _timer;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    unawaited(_refresh());
    _timer = Timer.periodic(widget.every, (_) => unawaited(_refresh()));
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _refresh() async {
    if (_busy) return;
    try {
      final s = await widget.api.buzzer();
      if (mounted) setState(() => _status = s);
    } catch (_) {
      // Offline or signed out: keeps what it showed.
    }
  }

  Future<void> _press() async {
    setState(() => _busy = true);
    unawaited(HapticFeedback.heavyImpact());
    try {
      final s = await widget.api.pressBuzzer();
      if (mounted) setState(() => _status = s);
    } catch (_) {
      // Locked a moment ago: the next refresh shows it.
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = _status;
    if (s == null || !s.active) return const SizedBox.shrink();
    final l = context.l10n;
    final c = context.colors;
    final rank = s.myRank;
    final String line = rank == 1
        ? l.buzzerYouFirst
        : rank != null
        ? l.buzzerYourPlace(rank)
        : s.locked
        ? l.buzzerLocked
        : s.firstName != null
        ? l.buzzerFirstIs(s.firstName!)
        : l.buzzerReady;
    return Card(
      key: const Key('buzzer-card'),
      color: rank == 1 ? c.tertiaryContainer : null,
      child: Padding(
        padding: const EdgeInsets.all(Kx.s16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(l.buzzerTitle, style: context.text.labelLarge?.copyWith(color: c.onSurfaceVariant)),
            const SizedBox(height: Kx.s4),
            Text(line, key: const Key('buzzer-line'), style: context.text.titleMedium),
            const SizedBox(height: Kx.s12),
            SizedBox(
              width: double.infinity,
              height: 72,
              child: FilledButton(
                key: const Key('buzzer-press'),
                style: FilledButton.styleFrom(shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Kx.rLg))),
                onPressed: s.canPress && !_busy ? () => unawaited(_press()) : null,
                child: Text(l.buzzerPress, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w700)),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Notes a teacher published when ending a class, newest first (the latest three).
class ClassNotesCard extends StatefulWidget {
  const ClassNotesCard({super.key, required this.api});

  final StudentApi api;

  @override
  State<ClassNotesCard> createState() => _ClassNotesCardState();
}

class _ClassNotesCardState extends State<ClassNotesCard> {
  List<ClassNote> _notes = const [];

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  Future<void> _load() async {
    try {
      final n = await widget.api.classNotes();
      if (mounted) setState(() => _notes = n.take(3).toList());
    } catch (_) {
      // No notes shown.
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_notes.isEmpty) return const SizedBox.shrink();
    final l = context.l10n;
    return Card(
      key: const Key('class-notes-card'),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: Kx.s8),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s8, Kx.s16, 0), child: Text(l.classNotesTitle, style: context.text.labelLarge?.copyWith(color: context.colors.onSurfaceVariant))),
            for (final n in _notes)
              ExpansionTile(
                key: Key('class-note-${n.id}'),
                title: Text(n.title),
                subtitle: Text(n.teacher),
                childrenPadding: const EdgeInsets.fromLTRB(Kx.s16, 0, Kx.s16, Kx.s12),
                expandedCrossAxisAlignment: CrossAxisAlignment.start,
                children: [SelectableText(n.notes)],
              ),
          ],
        ),
      ),
    );
  }
}

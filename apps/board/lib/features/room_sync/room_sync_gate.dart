import 'package:flutter/material.dart';

import '../../core/board_controller.dart';

const _strings = <String, Map<String, String>>{
  'en': {
    'period': 'Your class now: {c}',
    'open': 'Open class',
    'later': 'Not now',
    'exam': 'Examination in progress',
    'starts': 'Starts in {m} min',
    'left': '{m} min left',
    'seated': '{n} candidates seated',
    'invig': 'Invigilators: {n}',
    'quiet': 'Silence please. The board stays clear during the paper.',
  },
  'hi': {
    'period': 'अभी आपकी कक्षा: {c}',
    'open': 'कक्षा खोलें',
    'later': 'अभी नहीं',
    'exam': 'परीक्षा चल रही है',
    'starts': '{m} मिनट में शुरू',
    'left': '{m} मिनट शेष',
    'seated': '{n} परीक्षार्थी बैठे हैं',
    'invig': 'निरीक्षक: {n}',
    'quiet': 'कृपया शांति रखें। परीक्षा के दौरान बोर्ड खाली रहेगा।',
  },
  'kn': {
    'period': 'ಈಗ ನಿಮ್ಮ ತರಗತಿ: {c}',
    'open': 'ತರಗತಿ ತೆರೆಯಿರಿ',
    'later': 'ಈಗ ಬೇಡ',
    'exam': 'ಪರೀಕ್ಷೆ ನಡೆಯುತ್ತಿದೆ',
    'starts': '{m} ನಿಮಿಷದಲ್ಲಿ ಆರಂಭ',
    'left': '{m} ನಿಮಿಷ ಉಳಿದಿದೆ',
    'seated': '{n} ಪರೀಕ್ಷಾರ್ಥಿಗಳು ಕುಳಿತಿದ್ದಾರೆ',
    'invig': 'ಮೇಲ್ವಿಚಾರಕರು: {n}',
    'quiet': 'ದಯವಿಟ್ಟು ಮೌನವಾಗಿರಿ. ಪರೀಕ್ಷೆಯ ಸಮಯದಲ್ಲಿ ಬೋರ್ಡ್ ಖಾಲಿ ಇರುತ್ತದೆ.',
  },
};

String _t(BuildContext c, String k, [Map<String, String> v = const {}]) {
  var out = (_strings[Localizations.maybeLocaleOf(c)?.languageCode] ?? _strings['en']!)[k] ?? _strings['en']![k]!;
  for (final e in v.entries) {
    out = out.replaceAll('{${e.key}}', e.value);
  }
  return out;
}

/// Keeps the board in step with the room: offers the teacher's current timetable period, and covers the board with exam room
/// mode while a paper is being sat in this room (from 15 minutes before it starts).
class RoomSyncGate extends StatefulWidget {
  const RoomSyncGate({super.key, required this.board, required this.child});

  final BoardController board;
  final Widget child;

  @override
  State<RoomSyncGate> createState() => _RoomSyncGateState();
}

class _RoomSyncGateState extends State<RoomSyncGate> {
  @override
  void initState() {
    super.initState();
    widget.board.startRoomWatch();
  }

  @override
  Widget build(BuildContext context) {
    final b = widget.board;
    final exam = b.examRoom;
    final slot = b.suggestedClass;
    if (exam == null && slot == null) return widget.child;
    return Stack(
      children: [
        exam == null ? widget.child : ExcludeSemantics(child: AbsorbPointer(child: widget.child)),
        if (exam != null) Positioned.fill(child: ExamRoomScreen(exam: exam)),
        if (exam == null && slot != null)
          Positioned(
            left: 24,
            right: 24,
            bottom: 24,
            child: Material(
              key: const Key('class-now-banner'),
              elevation: 8,
              borderRadius: BorderRadius.circular(12),
              color: Theme.of(context).colorScheme.primaryContainer,
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Row(
                  children: [
                    Expanded(child: Text(_t(context, 'period', {'c': '${slot['sectionName']} · ${slot['subjectName']}'}), style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600))),
                    TextButton(key: const Key('class-now-later'), onPressed: b.dismissSuggestedClass, child: Text(_t(context, 'later'))),
                    FilledButton(key: const Key('class-now-open'), onPressed: () => b.acceptSuggestedClass(), child: Text(_t(context, 'open'))),
                  ],
                ),
              ),
            ),
          ),
      ],
    );
  }
}

/// Exam room mode: the paper, the clock, who is seated and who invigilates. The board shows nothing else.
class ExamRoomScreen extends StatelessWidget {
  const ExamRoomScreen({super.key, required this.exam});

  final Map<String, dynamic> exam;

  @override
  Widget build(BuildContext context) {
    final paper = exam['paper'] as Map<String, dynamic>;
    final started = exam['started'] == true;
    final inv = [for (final i in (exam['invigilators'] as List? ?? const [])) '${(i as Map)['name']}'].join(', ');
    return Material(
      key: const Key('exam-room'),
      color: const Color(0xFF10151C),
      child: DefaultTextStyle(
        style: const TextStyle(color: Colors.white, fontSize: 28),
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(_t(context, 'exam'), style: const TextStyle(fontSize: 40, fontWeight: FontWeight.w700)),
              const SizedBox(height: 16),
              Text('${paper['subject']} · ${paper['section']}', style: const TextStyle(fontSize: 34)),
              Text('${exam['room']}  ${paper['startsAt']} - ${paper['endsAt']}'),
              const SizedBox(height: 24),
              Text(started ? _t(context, 'left', {'m': '${exam['minutesLeft']}'}) : _t(context, 'starts', {'m': '${exam['startsInMinutes']}'}), key: const Key('exam-clock'), style: const TextStyle(fontSize: 64, fontWeight: FontWeight.w800)),
              const SizedBox(height: 24),
              Text(_t(context, 'seated', {'n': '${exam['seated']}'})),
              if (inv.isNotEmpty) Text(_t(context, 'invig', {'n': inv})),
              const SizedBox(height: 24),
              Text(_t(context, 'quiet'), style: const TextStyle(fontSize: 20, color: Colors.white70)),
            ],
          ),
        ),
      ),
    );
  }
}

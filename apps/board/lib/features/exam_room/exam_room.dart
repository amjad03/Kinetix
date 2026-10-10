import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/board_controller.dart';
import '../../l10n/feature_strings.dart';

FeatureStrings examRoomStrings(BuildContext context) => FeatureStrings(boardLang(context), examRoomStringTable);

const examRoomStringTable = <String, Map<String, String>>{
  'en': {
    'title': 'Exam room',
    'today': 'Today\'s sittings',
    'timetable': 'Exam timetable for this room',
    'instructions': 'Hall instructions',
    'seats': 'Seating plan',
    'seat': 'Seat',
    'roll': 'Register no.',
    'none': 'No exam is scheduled in this room today.',
    'noRoom': 'This board is not placed in a room.',
    'candidates': '{n} candidates',
    'retry': 'Try again',
  },
  'hi': {
    'title': 'परीक्षा कक्ष',
    'today': 'आज की बैठकें',
    'timetable': 'इस कक्ष का परीक्षा समय-सारणी',
    'instructions': 'हॉल के निर्देश',
    'seats': 'बैठक व्यवस्था',
    'seat': 'सीट',
    'roll': 'रजिस्टर संख्या',
    'none': 'आज इस कक्ष में कोई परीक्षा निर्धारित नहीं है।',
    'noRoom': 'यह बोर्ड किसी कक्ष में नहीं लगाया गया है।',
    'candidates': '{n} परीक्षार्थी',
    'retry': 'फिर कोशिश करें',
  },
  'kn': {
    'title': 'ಪರೀಕ್ಷಾ ಕೊಠಡಿ',
    'today': 'ಇಂದಿನ ಪರೀಕ್ಷೆಗಳು',
    'timetable': 'ಈ ಕೊಠಡಿಯ ಪರೀಕ್ಷಾ ವೇಳಾಪಟ್ಟಿ',
    'instructions': 'ಹಾಲ್ ಸೂಚನೆಗಳು',
    'seats': 'ಆಸನ ವ್ಯವಸ್ಥೆ',
    'seat': 'ಆಸನ',
    'roll': 'ನೋಂದಣಿ ಸಂಖ್ಯೆ',
    'none': 'ಇಂದು ಈ ಕೊಠಡಿಯಲ್ಲಿ ಯಾವುದೇ ಪರೀಕ್ಷೆ ನಿಗದಿಯಾಗಿಲ್ಲ.',
    'noRoom': 'ಈ ಬೋರ್ಡ್ ಯಾವುದೇ ಕೊಠಡಿಯಲ್ಲಿ ಇಲ್ಲ.',
    'candidates': '{n} ಪರೀಕ್ಷಾರ್ಥಿಗಳು',
    'retry': 'ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ',
  },
};

/// A sitting of the exam room today, with the seat plan (register numbers only).
class ExamSitting {
  const ExamSitting({required this.subject, required this.session, required this.startsAt, required this.endsAt, required this.seats});

  factory ExamSitting.fromJson(Map<String, dynamic> j) => ExamSitting(
    subject: '${j['subject']}',
    session: '${j['session']}',
    startsAt: '${j['startsAt']}',
    endsAt: '${j['endsAt']}',
    seats: [for (final s in (j['seats'] as List? ?? const [])) (seatNo: ((s as Map)['seatNo'] as num).toInt(), rollNo: '${s['rollNo']}')],
  );

  final String subject, session, startsAt, endsAt;
  final List<({int seatNo, String rollNo})> seats;
}

/// What an exam room's board shows, read-only (`GET /v1/devices/me/exam-room`).
class ExamRoomView {
  const ExamRoomView({required this.room, required this.sittings, required this.timetable, required this.instructions});

  factory ExamRoomView.fromJson(Map<String, dynamic> j) => ExamRoomView(
    room: '${(j['room'] as Map)['name']}',
    sittings: [for (final s in (j['sittings'] as List? ?? const [])) ExamSitting.fromJson((s as Map).cast<String, dynamic>())],
    timetable: [for (final t in (j['timetable'] as List? ?? const [])) (t as Map).cast<String, dynamic>()],
    instructions: [for (final i in (j['instructions'] as List? ?? const [])) '$i'],
  );

  final String room;
  final List<ExamSitting> sittings;
  final List<Map<String, dynamic>> timetable;
  final List<String> instructions;
}

/// The exam room panel: today's sittings with the seating plan, the room's exam timetable and the hall instructions.
class ExamRoomPanel extends StatefulWidget {
  const ExamRoomPanel({super.key, this.board, this.load});

  final BoardController? board;

  /// Tests pass their own loader.
  final Future<ExamRoomView> Function(String lang)? load;

  @override
  State<ExamRoomPanel> createState() => _ExamRoomPanelState();
}

class _ExamRoomPanelState extends State<ExamRoomPanel> {
  ExamRoomView? _view;
  String? _error;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_view == null && _error == null) _fetch();
  }

  Future<void> _fetch() async {
    final lang = boardLang(context);
    try {
      final v = await (widget.load?.call(lang) ?? _fromApi(lang));
      if (mounted) setState(() { _view = v; _error = null; });
    } catch (_) {
      if (mounted) setState(() => _error = examRoomStrings(context)['noRoom']);
    }
  }

  Future<ExamRoomView> _fromApi(String lang) async => ExamRoomView.fromJson(await widget.board!.api!.examRoom(lang: lang));

  @override
  Widget build(BuildContext context) {
    final s = examRoomStrings(context);
    final v = _view;
    return Scaffold(
      appBar: AppBar(title: Text(v == null ? s['title'] : '${s['title']}: ${v.room}')),
      body: _error != null
          ? Center(child: Column(mainAxisSize: MainAxisSize.min, children: [Text(_error!, key: const Key('examRoomError')), TextButton(onPressed: () { setState(() => _error = null); _fetch(); }, child: Text(s['retry']))]))
          : v == null
              ? const Center(child: CircularProgressIndicator())
              : ListView(
                  padding: const EdgeInsets.all(Kx.s16),
                  children: [
                    Text(s['today'], style: Theme.of(context).textTheme.titleLarge),
                    if (v.sittings.isEmpty) Padding(padding: const EdgeInsets.symmetric(vertical: Kx.s12), child: Text(s['none'], key: const Key('examRoomNone'))),
                    for (final sit in v.sittings) ...[
                      const SizedBox(height: Kx.s12),
                      Text('${sit.subject}  ${sit.startsAt}-${sit.endsAt}  (${s.n('candidates', sit.seats.length)})', style: Theme.of(context).textTheme.titleMedium),
                      Text(sit.session),
                      const SizedBox(height: Kx.s8),
                      Wrap(spacing: Kx.s8, runSpacing: Kx.s8, children: [for (final seat in sit.seats) Chip(key: Key('seat-${seat.seatNo}'), label: Text('${s['seat']} ${seat.seatNo}: ${seat.rollNo}'))]),
                    ],
                    const SizedBox(height: Kx.s24),
                    Text(s['timetable'], style: Theme.of(context).textTheme.titleLarge),
                    for (final t in v.timetable) ListTile(dense: true, title: Text('${t['date']}  ${t['startsAt']}-${t['endsAt']}'), subtitle: Text('${t['subject']}')),
                    const SizedBox(height: Kx.s24),
                    Text(s['instructions'], style: Theme.of(context).textTheme.titleLarge),
                    for (final i in v.instructions) ListTile(dense: true, leading: const Icon(Icons.chevron_right), title: Text(i)),
                  ],
                ),
    );
  }
}

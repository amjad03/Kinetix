import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:kinetix_cards/kinetix_cards.dart';

import '../../core/api_client.dart';
import '../../core/board_controller.dart';
import '../../core/models.dart';
import '../../core/realtime.dart';

/// `word`: students type one to three words; the board shows a word cloud.
enum PollKind { mcq, numeric, word }

/// Where an answer came from: the Student App, or an answer card read by the board's camera.
enum AnswerSource { app, card }

class PollAnswer {
  const PollAnswer(this.answer, this.source, {this.name});

  /// MCQ: the option's index as text ("0" = A); numeric: the number.
  final String answer;
  final AnswerSource source;

  /// Who answered, when the board knows (a card of the class, or a student's id in the roster).
  final String? name;
}

/// What one photo of the class gave: cards read, and cards that belong to nobody in the class.
class CardScan {
  const CardScan({required this.read, required this.unknown});
  final int read;
  final List<int> unknown;
}

/// A question the teacher asked the class on the board ("Ask the class").
///
/// Students with the Student App answer there (the server relays each answer to this board);
/// students without phones hold up printed answer cards and the teacher photographs the class
/// ([addCards]). In a class opened by a signed-in teacher everything is saved through the API
/// and, when the question is closed, becomes participation in the class history. Without a
/// class (guest board, free period) the question still works on the board with card numbers
/// for names, and nothing is saved.
class ClassPoll extends ChangeNotifier {
  ClassPoll({
    required this.board,
    required this.kind,
    required this.question,
    this.options = const [],
    this.correct,
    this.coIds = const [],
    String? id,
  }) : id = id ?? board.newId();

  final BoardController board;
  final String id;
  final PollKind kind;
  final String question;

  /// MCQ answer labels ("A", "B"… or True / False).
  final List<String> options;

  /// MCQ: the right option's index as text; numeric: the value. Null = no right answer.
  final String? correct;

  /// Course outcomes this question measures (picked by the teacher); its results count as classroom evidence in OBE.
  final List<String> coIds;

  /// Answers by student id (or "card:N" for a card the board cannot put a name to).
  final Map<String, PollAnswer> answers = {};

  /// Card number → its student, for the class open on the board.
  final Map<int, Student> cards = {};

  bool open = true;

  /// Saved through the API (a class is open and the server took the question).
  bool saved = false;

  /// The last thing that went wrong talking to the server (shown small on the panel).
  String? error;

  StreamSubscription<(String, Map<String, dynamic>)>? _events;

  ApiClient? get _api => board.isSignedIn && board.session?.sectionName != null ? board.api : null;

  int get classSize => board.roster.isNotEmpty ? board.roster.length : cards.length;

  /// How many chose each option (MCQ, in option order) or each value (numeric, smallest first).
  List<(String, int)> get tally {
    final counts = <String, int>{};
    if (kind == PollKind.mcq) {
      for (var i = 0; i < options.length; i++) {
        counts['$i'] = 0;
      }
    }
    for (final a in answers.values) {
      counts[a.answer] = (counts[a.answer] ?? 0) + 1;
    }
    final keys = counts.keys.toList();
    if (kind == PollKind.numeric) keys.sort((a, b) => (double.tryParse(a) ?? 0).compareTo(double.tryParse(b) ?? 0));
    if (kind == PollKind.word) keys.sort((a, b) => counts[b]!.compareTo(counts[a]!));
    return [for (final k in keys) (k, counts[k]!)];
  }

  /// The label for an answer: "B" or "True" for MCQ, the number itself otherwise.
  String label(String answer) => kind == PollKind.mcq ? (options.elementAtOrNull(int.tryParse(answer) ?? -1) ?? answer) : answer;

  bool? isRight(String answer) {
    if (correct == null || kind == PollKind.word) return null;
    if (kind == PollKind.mcq) return answer == correct;
    final a = double.tryParse(answer), b = double.tryParse(correct!);
    return a != null && b != null && (a - b).abs() <= 1e-9 * (b.abs() < 1 ? 1 : b.abs());
  }

  /// Opens the question: fetches the class's cards and tells the server (which tells the class).
  Future<void> start() async {
    _events = board.classEvents.stream.listen(_onEvent);
    final api = _api;
    if (api == null) return;
    try {
      final sheet = await api.answerCards();
      for (final c in (sheet['cards'] as List? ?? const []).cast<Map<String, dynamic>>()) {
        cards[(c['cardNo'] as num).toInt()] = Student(id: c['studentId'] as String, rollNo: c['rollNo'] as String, fullName: c['fullName'] as String);
      }
      await api.openPoll(id, {
        'kind': kind.name,
        'question': question,
        'options': options,
        'correct': correct,
      });
      saved = true;
      if (coIds.isNotEmpty) await api.tagPoll(id, coIds);
    } catch (e) {
      error = '$e';
    }
    notifyListeners();
  }

  void _onEvent((String, Map<String, dynamic>) e) {
    final (name, data) = e;
    if (name != RealtimeEvents.pollAnswered || data['pollId'] != id || !open) return;
    final studentId = data['studentId'] as String;
    final student = board.roster.where((s) => s.id == studentId).firstOrNull ?? cards.values.where((s) => s.id == studentId).firstOrNull;
    answers[studentId] = PollAnswer(
      data['answer'] as String,
      data['source'] == 'card' ? AnswerSource.card : AnswerSource.app,
      name: student?.fullName,
    );
    notifyListeners();
  }

  /// Cards read from a photo of the class. A card read again replaces its earlier answer.
  Future<CardScan> addCards(List<CardSeen> seen) async {
    if (!open || kind != PollKind.mcq) return const CardScan(read: 0, unknown: []);
    final valid = seen.where((s) => s.choice < options.length).toList();
    final unknown = <int>[];
    for (final s in valid) {
      final owner = cards[s.card];
      if (owner == null && saved) {
        unknown.add(s.card);
        continue;
      }
      answers.remove('card:${s.card}');
      answers[owner?.id ?? 'card:${s.card}'] = PollAnswer('${s.choice}', AnswerSource.card, name: owner?.fullName);
    }
    notifyListeners();
    final api = _api;
    if (saved && api != null && valid.isNotEmpty) {
      try {
        final res = await api.pollCards(id, [
          for (final s in valid) {'cardNo': s.card, 'choice': s.choice},
        ]);
        for (final n in (res['unknown'] as List? ?? const [])) {
          if (!unknown.contains(n)) unknown.add((n as num).toInt());
        }
      } catch (e) {
        error = '$e';
        notifyListeners();
      }
    }
    return CardScan(read: valid.length - unknown.length, unknown: unknown..sort());
  }

  /// Ends the question; the server records everyone's answer.
  Future<void> close() async {
    if (!open) return;
    open = false;
    notifyListeners();
    final api = _api;
    if (saved && api != null) {
      try {
        await api.closePoll(id);
      } catch (e) {
        error = '$e';
        notifyListeners();
      }
    }
  }

  @override
  void dispose() {
    unawaited(_events?.cancel());
    super.dispose();
  }
}

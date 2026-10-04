import 'dart:async';

import 'package:flutter/foundation.dart';

import '../../core/board_controller.dart';

/// The step timer of Today's plan: the step being taught, the time spent on it, and whether it
/// is running. Owned by the board screen, not the panel, so it keeps counting while the teacher
/// uses another panel or closes it, and shows where it got to when Today's plan is reopened. It
/// starts over for another class session or another period.
class PlanTimer extends ChangeNotifier {
  PlanTimer(this.board) : _sessionId = board.session?.sessionId {
    board.addListener(_onBoard);
  }

  final BoardController board;
  String? _sessionId;

  /// The period the timer belongs to, and the length of each of its steps in minutes.
  String? _period;
  List<int> _minutes = const [];

  /// The step being taught (null before the timer was first started), and time spent on it.
  int? step;
  Duration elapsed = Duration.zero;
  Timer? _tick;

  bool get running => _tick != null;

  /// Every step has been taught.
  bool get done => step != null && step! >= _minutes.length;

  /// The panel shows the plan for [period] with steps of these lengths. Another period starts
  /// over; the same one (the panel reopened, or the plan reloaded) carries on.
  void show(String period, List<int> minutes) {
    if (period != _period) {
      _reset();
      _period = period;
    }
    _minutes = List.unmodifiable(minutes);
    if (step != null && step! > _minutes.length) step = _minutes.length;
  }

  void toggle() {
    if (running) {
      _stop();
    } else {
      if (step == null || done) {
        step = 0;
        elapsed = Duration.zero;
      }
      if (_minutes.isEmpty) return;
      _tick = Timer.periodic(const Duration(seconds: 1), (_) => _second());
    }
    notifyListeners();
  }

  void _second() {
    elapsed += const Duration(seconds: 1);
    if (elapsed >= Duration(minutes: _minutes[step!])) _advance();
    notifyListeners();
  }

  /// Moves the highlight to the next step; after the last one the timer stops.
  void next() {
    _advance();
    notifyListeners();
  }

  void _advance() {
    elapsed = Duration.zero;
    step = step! + 1;
    if (done) _stop();
  }

  void jump(int i) {
    step = i;
    elapsed = Duration.zero;
    notifyListeners();
  }

  void _stop() {
    _tick?.cancel();
    _tick = null;
  }

  void _reset() {
    _stop();
    step = null;
    elapsed = Duration.zero;
  }

  /// Another class (or none) means another plan.
  void _onBoard() {
    final id = board.session?.sessionId;
    if (id == _sessionId) return;
    _sessionId = id;
    _period = null;
    _reset();
    notifyListeners();
  }

  @override
  void dispose() {
    board.removeListener(_onBoard);
    _stop();
    super.dispose();
  }
}

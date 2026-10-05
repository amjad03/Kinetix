import 'dart:async';
import 'dart:math' as math;

import 'package:clock/clock.dart';
import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';

import '../../core/models.dart';
import 'noise_source.dart';

/// The class toolkit (ported from the KINETIX prototype): cards that float over the board and
/// the two overlays that cover it.
enum ToolkitItem { timer, stopwatch, picker, dice, spinner, noise, curtain, spotlight }

/// A sample class for the name picker on a demo board with no class open (a demo class that is
/// signed in uses its own roster).
const demoClassNames = [
  'Aarav Sharma',
  'Diya Patel',
  'Ishaan Reddy',
  'Ananya Iyer',
  'Kabir Singh',
  'Meera Nair',
  'Rohan Gowda',
  'Saanvi Joshi',
  'Vihaan Kulkarni',
  'Zoya Khan',
];

/// The toolkit's state: which tools are open, and each tool's own state. Everything the class
/// should see is in [projectorState], for the students' screen.
class ToolkitController extends ChangeNotifier {
  ToolkitController({required this.roster, this.demo = false, NoiseSource? noiseSource, math.Random? random, DateTime Function()? now})
    : _noiseSource = noiseSource, // ignore: prefer_initializing_formals
      _rnd = random ?? math.Random(),
      _now = now ?? clock.now;

  /// The students who can be picked now: the period's class, absentees left out.
  final List<Student> Function() roster;

  /// A demo board picks from [demoClassNames] when no class is open.
  final bool demo;

  final math.Random _rnd;
  final DateTime Function() _now;
  NoiseSource? _noiseSource;
  Timer? _tick;
  bool _disposed = false;

  final Set<ToolkitItem> _open = {};

  /// The open tools, in the order they were opened.
  Set<ToolkitItem> get open => Set.unmodifiable(_open);
  bool isOpen(ToolkitItem t) => _open.contains(t);

  /// Called when the countdown reaches zero (the board shows a message; the card turns red).
  VoidCallback? onTimeUp;

  void show(ToolkitItem t) {
    if (_open.contains(t)) return;
    _open.add(t);
    if (t == ToolkitItem.noise) unawaited(startNoise());
    if (t == ToolkitItem.curtain) curtain = 0.25;
    _changed();
  }

  void toggle(ToolkitItem t) => _open.contains(t) ? close(t) : show(t);

  void close(ToolkitItem t) {
    if (!_open.remove(t)) return;
    if (t == ToolkitItem.noise) unawaited(stopNoise());
    _changed();
  }

  void _changed() {
    if (!_disposed) notifyListeners();
  }

  void _ensureTick() {
    if ((timerRunning || stopwatchRunning) && _tick == null) {
      _tick = Timer.periodic(const Duration(milliseconds: 200), (_) {
        if (timerRunning && timerLeft <= Duration.zero) _timeUp();
        if (!timerRunning && !stopwatchRunning) {
          _tick?.cancel();
          _tick = null;
        }
        _changed();
      });
    }
  }

  // --- Timer --------------------------------------------------------------------------------

  Duration timerTotal = const Duration(minutes: 5);
  DateTime? _timerEnd;
  Duration _timerPaused = const Duration(minutes: 5);
  bool timerDone = false;

  bool get timerRunning => _timerEnd != null;
  Duration get timerLeft {
    final left = _timerEnd == null ? _timerPaused : _timerEnd!.difference(_now());
    return left.isNegative ? Duration.zero : left;
  }

  void setTimer(Duration d) {
    timerTotal = d;
    _timerPaused = d;
    _timerEnd = null;
    timerDone = false;
    _changed();
  }

  void addTime(Duration d) {
    if (_timerEnd != null) {
      _timerEnd = _timerEnd!.add(d);
    } else {
      _timerPaused += d;
    }
    if (_timerPaused > timerTotal && _timerEnd == null) timerTotal = _timerPaused;
    timerDone = false;
    _changed();
  }

  void startPauseTimer() {
    if (_timerEnd != null) {
      _timerPaused = timerLeft;
      _timerEnd = null;
    } else {
      if (_timerPaused <= Duration.zero) _timerPaused = timerTotal;
      _timerEnd = _now().add(_timerPaused);
      timerDone = false;
    }
    _ensureTick();
    _changed();
  }

  void resetTimer() => setTimer(timerTotal);

  void _timeUp() {
    _timerEnd = null;
    _timerPaused = Duration.zero;
    timerDone = true;
    SystemSound.play(SystemSoundType.alert);
    onTimeUp?.call();
  }

  // --- Stopwatch ----------------------------------------------------------------------------

  DateTime? _swStart;
  Duration _swAcc = Duration.zero;
  final List<Duration> _laps = [];

  /// Laps, newest first.
  List<Duration> get laps => List.unmodifiable(_laps);
  bool get stopwatchRunning => _swStart != null;
  Duration get stopwatch => _swAcc + (_swStart == null ? Duration.zero : _now().difference(_swStart!));

  void startPauseStopwatch() {
    if (_swStart != null) {
      _swAcc = stopwatch;
      _swStart = null;
    } else {
      _swStart = _now();
    }
    _ensureTick();
    _changed();
  }

  void lap() {
    _laps.insert(0, stopwatch);
    _changed();
  }

  void resetStopwatch() {
    _swStart = null;
    _swAcc = Duration.zero;
    _laps.clear();
    _changed();
  }

  // --- Name picker --------------------------------------------------------------------------

  /// Who has been picked since the list last started over.
  final Set<String> _picked = {};
  int get pickedCount => _picked.length;

  /// The name on show (flicking through while [rolling]), and the student it belongs to (null
  /// for a demo name).
  String? current;
  Student? currentStudent;
  bool rolling = false;

  /// Picks each student once before anyone is picked again.
  bool noRepeat = true;

  /// The class to pick from: the roster, or the demo class on a demo board.
  List<(String, Student?)> get classList {
    final students = roster();
    if (students.isNotEmpty) return [for (final s in students) (s.fullName, s)];
    if (demo) return [for (final n in demoClassNames) (n, null)];
    return const [];
  }

  /// Flicks through names for a moment, then lands on one.
  Future<void> pick({Duration step = const Duration(milliseconds: 45)}) async {
    final all = classList;
    if (all.isEmpty || rolling) return;
    String keyOf((String, Student?) e) => e.$2?.id ?? e.$1;
    var pool = noRepeat ? all.where((e) => !_picked.contains(keyOf(e))).toList() : List.of(all);
    if (pool.isEmpty) {
      _picked.clear();
      pool = List.of(all);
    }
    rolling = true;
    currentStudent = null;
    for (var i = 0; i < 14 && !_disposed; i++) {
      current = all[_rnd.nextInt(all.length)].$1;
      _changed();
      await Future<void>.delayed(step + step * (i / 4));
    }
    if (_disposed) return;
    final chosen = pool[_rnd.nextInt(pool.length)];
    current = chosen.$1;
    currentStudent = chosen.$2;
    _picked.add(keyOf(chosen));
    rolling = false;
    HapticFeedback.mediumImpact();
    _changed();
  }

  void setNoRepeat(bool v) {
    noRepeat = v;
    _changed();
  }

  /// Starts the "everyone once" round again.
  void resetPicks() {
    _picked.clear();
    current = null;
    currentStudent = null;
    _changed();
  }

  // --- Dice ---------------------------------------------------------------------------------

  int diceCount = 2;
  List<int> dice = [3, 5];
  bool rollingDice = false;

  Future<void> roll({Duration step = const Duration(milliseconds: 60)}) async {
    if (rollingDice) return;
    rollingDice = true;
    for (var i = 0; i < 10 && !_disposed; i++) {
      dice = [for (var k = 0; k < diceCount; k++) 1 + _rnd.nextInt(6)];
      _changed();
      await Future<void>.delayed(step);
    }
    rollingDice = false;
    _changed();
  }

  void setDiceCount(int n) {
    diceCount = n.clamp(1, 4);
    dice = [for (var k = 0; k < diceCount; k++) 1 + _rnd.nextInt(6)];
    _changed();
  }

  // --- Spinner ------------------------------------------------------------------------------

  /// The spinner's slices; null until the teacher edits them (the card shows "Group A"… in the
  /// board's language).
  List<String>? spinnerOptions;
  double spinnerAngle = 0;
  String? spinnerResult;
  bool spinning = false;

  void setSpinnerOptions(List<String> options) {
    final clean = [
      for (final o in options)
        if (o.trim().isNotEmpty) o.trim(),
    ];
    spinnerOptions = clean.isEmpty ? null : clean;
    spinnerResult = null;
    _changed();
  }

  /// Spins for about 2.4 seconds, easing out, and reads the slice under the pointer.
  Future<void> spin(List<String> options, {Duration step = const Duration(milliseconds: 40)}) async {
    if (spinning || options.isEmpty) return;
    spinning = true;
    spinnerResult = null;
    final start = spinnerAngle;
    final target = start + 6 * math.pi + _rnd.nextDouble() * 2 * math.pi;
    const steps = 60;
    for (var i = 1; i <= steps && !_disposed; i++) {
      final t = i / steps;
      spinnerAngle = start + (target - start) * (1 - math.pow(1 - t, 3));
      _changed();
      await Future<void>.delayed(step);
    }
    if (_disposed) return;
    spinnerResult = options[sliceAt(spinnerAngle, options.length)];
    spinning = false;
    _changed();
  }

  /// The slice under the pointer at the top when the wheel has turned by [angle]: slice i
  /// starts at angle + i·slice, measured clockwise from the top.
  static int sliceAt(double angle, int n) {
    final slice = 2 * math.pi / n;
    final a = ((-angle) % (2 * math.pi) + 2 * math.pi) % (2 * math.pi);
    return (a ~/ slice) % n;
  }

  // --- Noise meter --------------------------------------------------------------------------

  StreamSubscription<double>? _noiseSub;

  /// 0 (silent) to 1 (very loud), smoothed.
  double noise = 0;
  double noiseLimit = 0.7;

  /// Why the meter cannot listen (no microphone, no permission), or null.
  NoiseProblem? noiseProblem;

  bool get tooLoud => noise > noiseLimit;

  void setNoiseLimit(double v) {
    noiseLimit = v.clamp(0.3, 0.95);
    _changed();
  }

  Future<void> startNoise() async {
    noiseProblem = null;
    try {
      final source = _noiseSource ??= MicNoiseSource();
      final levels = await source.start();
      if (_disposed || !_open.contains(ToolkitItem.noise)) {
        await source.stop();
        return;
      }
      _noiseSub = levels.listen((v) {
        noise = noise * 0.6 + v.clamp(0.0, 1.0) * 0.4;
        _changed();
      });
    } on NoiseUnavailable catch (e) {
      noiseProblem = e.problem;
      _changed();
    } catch (_) {
      noiseProblem = NoiseProblem.unavailable;
      _changed();
    }
  }

  Future<void> stopNoise() async {
    await _noiseSub?.cancel();
    _noiseSub = null;
    noise = 0;
    try {
      await _noiseSource?.stop();
    } catch (_) {
      // A board whose microphone went away must not fail on the way out.
    }
  }

  // --- Curtain and spotlight ----------------------------------------------------------------

  /// How far down the board is revealed (0 = all covered).
  double curtain = 0.25;

  /// The spotlight's centre as a fraction of the board, and its radius as a fraction of the
  /// board's shorter side.
  Offset spotlight = const Offset(0.5, 0.45);
  double spotlightRadius = 0.16;

  void setCurtain(double v) {
    curtain = v.clamp(0.0, 1.0);
    _changed();
  }

  void moveSpotlight(Offset fraction) {
    spotlight = Offset(fraction.dx.clamp(0.0, 1.0), fraction.dy.clamp(0.0, 1.0));
    _changed();
  }

  void setSpotlightRadius(double r) {
    spotlightRadius = r.clamp(0.06, 0.5);
    _changed();
  }

  // --- Students' screen ---------------------------------------------------------------------

  /// What the students' screen (projector) should show, as JSON.
  Map<String, dynamic> get projectorState => {
    if (isOpen(ToolkitItem.timer)) 'timer': {'left': timerLeft.inMilliseconds, 'done': timerDone},
    if (isOpen(ToolkitItem.stopwatch)) 'stopwatch': stopwatch.inMilliseconds,
    if (isOpen(ToolkitItem.picker) && current != null) 'pick': {'name': current, 'rolling': rolling},
    if (isOpen(ToolkitItem.dice)) 'dice': dice,
    if (isOpen(ToolkitItem.spinner) && spinnerResult != null) 'spin': spinnerResult,
    if (isOpen(ToolkitItem.curtain)) 'curtain': curtain,
    if (isOpen(ToolkitItem.spotlight)) 'spotlight': [spotlight.dx, spotlight.dy, spotlightRadius],
  };

  @override
  void dispose() {
    _disposed = true;
    _tick?.cancel();
    unawaited(stopNoise());
    unawaited(_noiseSource?.dispose().catchError((Object _) {}));
    super.dispose();
  }
}

/// 4:05, or 1:02:03 past an hour.
String clockText(Duration d) {
  final s = d.abs().inSeconds;
  final m = s ~/ 60, sec = s % 60, h = m ~/ 60;
  final body = h > 0 ? '$h:${(m % 60).toString().padLeft(2, '0')}:${sec.toString().padLeft(2, '0')}' : '${m.toString().padLeft(2, '0')}:${sec.toString().padLeft(2, '0')}';
  return d.isNegative ? '-$body' : body;
}

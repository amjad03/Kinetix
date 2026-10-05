/// The classroom toolkit as the phone remote (and anything else outside the board screen)
/// drives it: the timer, the random picker and slides or PDF pages.
///
/// The toolkit (timer, picker, PPT/PDF import) is being ported separately; the board screen
/// connects this interface to what it has today through [CallbackToolkit], and the port
/// replaces that with the real toolkit. Slides answer false / null until slides exist.
abstract interface class BoardToolkit {
  /// Shows the timer set to [duration] and starts it.
  void startTimer(Duration duration);
  void stopTimer();
  bool get timerRunning;

  /// Picks a student at random (the picker shows who).
  void pickStudent();

  /// Moves the open slides or PDF on; false when nothing is open.
  bool nextSlide();
  bool previousSlide();

  /// The open slides or PDF: current slide (0-based) and how many, or null.
  ({int index, int count})? get slide;
}

/// [BoardToolkit] from callbacks: the stub the board screen uses until the toolkit port lands.
class CallbackToolkit implements BoardToolkit {
  CallbackToolkit({
    required this.onStartTimer,
    required this.onStopTimer,
    required this.isTimerRunning,
    required this.onPickStudent,
    this.onNextSlide,
    this.onPreviousSlide,
    this.currentSlide,
  });

  final void Function(Duration) onStartTimer;
  final void Function() onStopTimer;
  final bool Function() isTimerRunning;
  final void Function() onPickStudent;
  final bool Function()? onNextSlide;
  final bool Function()? onPreviousSlide;
  final ({int index, int count})? Function()? currentSlide;

  @override
  void startTimer(Duration duration) => onStartTimer(duration);
  @override
  void stopTimer() => onStopTimer();
  @override
  bool get timerRunning => isTimerRunning();
  @override
  void pickStudent() => onPickStudent();
  @override
  bool nextSlide() => onNextSlide?.call() ?? false;
  @override
  bool previousSlide() => onPreviousSlide?.call() ?? false;
  @override
  ({int index, int count})? get slide => currentSlide?.call();
}

import 'dart:convert';
import 'dart:ui';

import 'package:flutter/foundation.dart';

/// What a touch contact is, by its size.
enum ContactClass { pen, finger, palm }

/// What a stylus barrel button does while held down as the pen touches the board.
enum ButtonAction { none, erase, highlight, select, undo }

/// Touch offset calibration: the user touches known targets and the average miss is removed
/// from every later touch. Saved per device with [InputConfig].
class TouchCalibration {
  const TouchCalibration([this.shift = Offset.zero]);

  /// Added to each touch position to land where the user aimed.
  final Offset shift;

  bool get isCalibrated => shift != Offset.zero;

  Offset apply(Offset touched) => touched + shift;

  /// From pairs of (target the user aimed at, point the screen reported).
  factory TouchCalibration.fromSamples(List<(Offset target, Offset touched)> samples) {
    if (samples.isEmpty) return const TouchCalibration();
    var sum = Offset.zero;
    for (final s in samples) {
      sum += s.$1 - s.$2;
    }
    return TouchCalibration(sum / samples.length.toDouble());
  }
}

/// Active stylus settings: pressure, eraser end and what the barrel buttons do.
class StylusConfig {
  const StylusConfig({this.pressure = true, this.eraserEnd = true, this.primaryButton = ButtonAction.erase, this.secondaryButton = ButtonAction.undo});

  final bool pressure;

  /// The pen's other end erases (or whatever the Two Side pen sets for it); off, it writes.
  final bool eraserEnd;
  final ButtonAction primaryButton;
  final ButtonAction secondaryButton;

  StylusConfig copyWith({bool? pressure, bool? eraserEnd, ButtonAction? primaryButton, ButtonAction? secondaryButton}) => StylusConfig(
    pressure: pressure ?? this.pressure,
    eraserEnd: eraserEnd ?? this.eraserEnd,
    primaryButton: primaryButton ?? this.primaryButton,
    secondaryButton: secondaryButton ?? this.secondaryButton,
  );

  /// The action for the buttons held in [buttons] (the pointer's button bitmask: 0x02 is the
  /// first barrel button, 0x04 the second).
  ButtonAction actionFor(int buttons) {
    if (buttons & 0x04 != 0 && secondaryButton != ButtonAction.none) return secondaryButton;
    if (buttons & 0x02 != 0) return primaryButton;
    return ButtonAction.none;
  }
}

/// Two pens, each with its own colour, for two writers. A touch pen is told apart by its tip
/// size (thin tips are the first pen, thick the second); without sizes, by order of arrival.
class DualPens {
  const DualPens({this.enabled = false, this.first = const Color(0xFF1A73E8), this.second = const Color(0xFFD93025), this.tipSplit = 0});

  final bool enabled;
  final Color first, second;

  /// Contact radius (logical pixels) that separates the pens; 0 = by pointer order.
  final double tipSplit;

  DualPens copyWith({bool? enabled, Color? first, Color? second, double? tipSplit}) =>
      DualPens(enabled: enabled ?? this.enabled, first: first ?? this.first, second: second ?? this.second, tipSplit: tipSplit ?? this.tipSplit);

  /// The colour for a pen landing now: [radius] its tip size, [slot] 0 or 1 (the pen already
  /// down is 0, so the next is 1).
  Color colourFor({required double radius, required int slot}) {
    if (tipSplit > 0 && radius > 0) return radius <= tipSplit ? first : second;
    return slot == 0 ? first : second;
  }
}

/// Everything the board's input depends on, kept per device: size thresholds, the stylus, the
/// dual pens and the touch calibration.
class InputConfig extends ChangeNotifier {
  InputConfig({TouchCalibration calibration = const TouchCalibration(), StylusConfig stylus = const StylusConfig(), DualPens dual = const DualPens()})
    : _calibration = calibration,
      _stylus = stylus,
      _dual = dual;

  TouchCalibration _calibration;
  StylusConfig _stylus;
  DualPens _dual;

  /// Contact radius (logical pixels). At or below [penMax] a touch is a pen; at or above
  /// [palmMin] a palm; between, a finger. 0 = unset. With [autoLearn] the screen's own finger
  /// size decides the palm limit unless [palmMin] is set.
  double penMax = 0, palmMin = 0;
  bool autoLearn = true;

  TouchCalibration get calibration => _calibration;
  StylusConfig get stylus => _stylus;
  DualPens get dual => _dual;

  set calibration(TouchCalibration v) {
    _calibration = v;
    notifyListeners();
  }

  set stylus(StylusConfig v) {
    _stylus = v;
    notifyListeners();
  }

  set dual(DualPens v) {
    _dual = v;
    notifyListeners();
  }

  void setThresholds({double? penMax, double? palmMin, bool? autoLearn}) {
    if (penMax != null) this.penMax = penMax;
    if (palmMin != null) this.palmMin = palmMin;
    if (autoLearn != null) this.autoLearn = autoLearn;
    notifyListeners();
  }

  /// Where a touch really is.
  Offset position(Offset touched) => _calibration.apply(touched);

  /// Classifies a touch contact of [radius]. [learnedPalm] says whether the auto-learning
  /// detector thinks it is a palm. Unreported sizes (0) are fingers.
  ContactClass classify(double radius, {required bool Function(double) learnedPalm}) {
    if (radius <= 0) return ContactClass.finger;
    if (penMax > 0 && radius <= penMax) return ContactClass.pen;
    if (palmMin > 0 && radius >= palmMin) return ContactClass.palm;
    if (!autoLearn && palmMin > 0) return ContactClass.finger;
    return learnedPalm(radius) ? ContactClass.palm : ContactClass.finger;
  }

  /// Sets the limits from sample contact radii the user made with a pen tip, a finger and a
  /// palm (any may be empty), and turns auto-learn off.
  void learn({List<double> pen = const [], List<double> finger = const [], List<double> palm = const []}) {
    double mean(List<double> v) => v.reduce((a, b) => a + b) / v.length;
    final p = pen.isEmpty ? null : mean(pen), f = finger.isEmpty ? null : mean(finger), l = palm.isEmpty ? null : mean(palm);
    if (p != null && f != null) penMax = (p + f) / 2;
    if (f != null && l != null) palmMin = (f + l) / 2;
    if (p != null && f == null && l != null) {
      penMax = p * 1.3;
      palmMin = (p + l) / 2;
    }
    autoLearn = false;
    notifyListeners();
  }

  Map<String, dynamic> toJson() => {
    'penMax': penMax,
    'palmMin': palmMin,
    'autoLearn': autoLearn,
    'shift': [_calibration.shift.dx, _calibration.shift.dy],
    'pressure': _stylus.pressure,
    'eraserEnd': _stylus.eraserEnd,
    'primary': _stylus.primaryButton.name,
    'secondary': _stylus.secondaryButton.name,
    'dual': _dual.enabled,
    'first': _dual.first.toARGB32(),
    'second': _dual.second.toARGB32(),
    'tipSplit': _dual.tipSplit,
  };

  String encode() => jsonEncode(toJson());

  /// Reads what [encode] wrote; defaults for anything missing or unreadable.
  static InputConfig decode(String? raw) {
    final c = InputConfig();
    if (raw == null) return c;
    try {
      final m = (jsonDecode(raw) as Map).cast<String, dynamic>();
      ButtonAction act(Object? n, ButtonAction d) => ButtonAction.values.asNameMap()[n] ?? d;
      final shift = (m['shift'] as List?)?.map((x) => (x as num).toDouble()).toList();
      c
        ..penMax = (m['penMax'] as num?)?.toDouble() ?? 0
        ..palmMin = (m['palmMin'] as num?)?.toDouble() ?? 0
        ..autoLearn = m['autoLearn'] as bool? ?? true
        .._calibration = shift != null && shift.length == 2 ? TouchCalibration(Offset(shift[0], shift[1])) : const TouchCalibration()
        .._stylus = StylusConfig(
          pressure: m['pressure'] as bool? ?? true,
          eraserEnd: m['eraserEnd'] as bool? ?? true,
          primaryButton: act(m['primary'], ButtonAction.erase),
          secondaryButton: act(m['secondary'], ButtonAction.undo),
        )
        .._dual = DualPens(
          enabled: m['dual'] as bool? ?? false,
          first: Color((m['first'] as num?)?.toInt() ?? 0xFF1A73E8),
          second: Color((m['second'] as num?)?.toInt() ?? 0xFFD93025),
          tipSplit: (m['tipSplit'] as num?)?.toDouble() ?? 0,
        );
    } catch (_) {}
    return c;
  }
}

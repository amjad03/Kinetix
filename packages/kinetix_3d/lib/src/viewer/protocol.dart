import 'dart:convert';
import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui';

import 'annotations.dart';

/// What the labels show: nothing, the part tapped, or every main part.
enum LabelMode { none, picked, all }

/// The kinds of cut: in half, a wedge taken out like a slice of cake, a slab (only a slice
/// left), a plane swept through by depth, and peeling the outer layers off one by one.
enum CutMode { off, half, wedge, slab, depth, peel }

/// The model's axes: x left to right, y bottom to top, z back to front.
enum CutAxis { x, y, z }

/// The commands the app sends the viewer page (tool/models/src/viewer.js runs them with
/// `kx.cmd({...})`). Each is a JSON object with a `cmd` name; this is the one place they
/// are spelt, so the app and the tests agree with the page.
abstract final class ViewerCommands {
  static Map<String, dynamic> lang(String lang) => {'cmd': 'lang', 'lang': lang};
  static Map<String, dynamic> labels(LabelMode mode) => {'cmd': 'labels', 'mode': mode.name};

  /// Lights up and names [part]; null lets go.
  static Map<String, dynamic> pick(String? part) => {'cmd': 'pick', 'part': part};

  /// Flies the camera to look from [dir] (towards the middle of the model).
  static Map<String, dynamic> view(List<double> dir) => {'cmd': 'view', 'dir': dir};
  static Map<String, dynamic> reset() => {'cmd': 'reset'};

  /// Takes the model apart: 0 together, 1 fully apart (solids unfold into nets).
  static Map<String, dynamic> explode(double amount) => {'cmd': 'explode', 'amount': amount.clamp(0.0, 1.0)};

  /// A cut along a plane; no [normal] closes the cut.
  static Map<String, dynamic> slice({String? id, List<double>? normal, double offset = 0, List<double>? normal2}) => {
    'cmd': 'slice',
    'id': ?id,
    'normal': ?normal,
    if (normal != null) 'offset': offset,
    'normal2': ?normal2,
  };

  /// A kind of cut ([CutMode]) across [axis]. Each mode uses its own settings:
  /// - half: [at] where the plane is (-0.5..0.5 of the model's size), [flip] keeps the other half;
  /// - wedge: a slice of [angle] degrees (30..180) taken out round [axis], turned [turn] degrees;
  /// - slab: a slice [thickness] thick (0..1 of the size) left at [at];
  /// - depth: a plane [depth] of the way in (0..1) from the front of [axis] ([flip]: from the
  ///   back); [play] sweeps it through, answered by a `cut` event with `done` at the end;
  /// - peel: the [peel] outermost layers taken off, answered by a `cut` event with `layers`.
  static Map<String, dynamic> cut(
    CutMode mode, {
    CutAxis axis = CutAxis.z,
    bool flip = false,
    double at = 0,
    double angle = 90,
    double turn = 0,
    double thickness = 0.2,
    double depth = 0.5,
    int peel = 0,
    bool play = false,
  }) => {
    'cmd': 'cut',
    'mode': mode.name,
    if (mode != CutMode.off && mode != CutMode.peel) 'axis': axis.name,
    if ((mode == CutMode.half || mode == CutMode.depth) && flip) 'flip': true,
    if (mode == CutMode.half || mode == CutMode.slab) 'at': _r(at, -0.5, 0.5),
    if (mode == CutMode.wedge) ...{'angle': _r(angle, 30, 180), 'turn': _r(turn % 360, 0, 360)},
    if (mode == CutMode.slab) 'thickness': _r(thickness, 0.01, 1),
    if (mode == CutMode.depth) 'depth': _r(depth, 0, 1),
    if (mode == CutMode.depth && play) 'play': true,
    if (mode == CutMode.peel) 'peel': math.max(0, peel),
  };

  /// Puts saved notes back on the model (no event in answer).
  static Map<String, dynamic> setNotes(Model3dAnnotations notes) => {'cmd': 'annotate', 'op': 'set', 'data': notes.toJson()};

  /// Pins a note on the part under [at] (0..1 across the view); answered by an
  /// `annotations` event naming the new pin, or `noteMissed`.
  static Map<String, dynamic> pinNote(Offset at, {String text = '', Color color = const Color(0xFFF2B33D)}) => {
    'cmd': 'annotate',
    'op': 'pin',
    'x': _r(at.dx, 0, 1),
    'y': _r(at.dy, 0, 1),
    'text': text,
    'color': colorHex(color),
  };

  /// New points of a drawn stroke (0..1 across the view): on the model's surface, or over the
  /// view when not [surface]. [up] ends the stroke (answered by `annotations`).
  static Map<String, dynamic> stroke(List<Offset> points, {required bool surface, Color color = const Color(0xFFE53935), double width = 2, bool up = false}) => {
    'cmd': 'annotate',
    'op': 'stroke',
    'surface': surface,
    'pts': [for (final p in points) [_r(p.dx, 0, 1), _r(p.dy, 0, 1)]],
    'color': colorHex(color),
    'width': width,
    if (up) 'up': true,
  };

  static Map<String, dynamic> updateNote(String id, {String? text, Color? color}) => {
    'cmd': 'annotate',
    'op': 'update',
    'id': id,
    'text': ?text,
    if (color != null) 'color': colorHex(color),
  };
  static Map<String, dynamic> deleteNote(String id) => {'cmd': 'annotate', 'op': 'delete', 'id': id};
  static Map<String, dynamic> clearNotes() => {'cmd': 'annotate', 'op': 'clear'};
  static Map<String, dynamic> showNotes(bool on) => {'cmd': 'annotate', 'op': 'show', 'on': on};

  /// Hides [parts]; [shown] are parts hidden at the start that the teacher turned on.
  static Map<String, dynamic> hide(Iterable<String> parts, Iterable<String> shown) => {'cmd': 'hide', 'parts': parts.toList(), 'shown': shown.toList()};
  static Map<String, dynamic> variant(String id) => {'cmd': 'variant', 'id': id};

  /// Starts animation [id] at [step]; null stops.
  static Map<String, dynamic> animate(String? id, {int step = 0}) => {'cmd': 'animate', 'id': id, 'step': step};
  static Map<String, dynamic> step(int step) => {'cmd': 'step', 'step': step};
  static Map<String, dynamic> autoRotate(bool on) => {'cmd': 'autoRotate', 'on': on};

  /// Asks for a PNG of the view, labels drawn in (answered by a `snapshot` event).
  static Map<String, dynamic> snapshot({int maxWidth = 1600}) => {'cmd': 'snapshot', 'maxWidth': maxWidth};

  /// Pictures of the view for the students' screen (answered by `frame` events).
  static Map<String, dynamic> mirror(bool on, {int maxWidth = 960}) => {'cmd': 'mirror', 'on': on, 'maxWidth': maxWidth};

  /// New laser trail points, [points] from 0 to 1 across the view (the last is the tip);
  /// [up] when the finger lifts, [off] when the laser is put away. [fade] is how long the
  /// trail lasts, so the projector's pictures fade it as the board does.
  static Map<String, dynamic> laser({List<Offset> points = const [], bool up = false, bool off = false, Duration? fade}) => {
    'cmd': 'laser',
    if (points.isNotEmpty) 'pts': [for (final p in points) [_r(p.dx), _r(p.dy)]],
    if (up) 'up': true,
    if (off) 'off': true,
    if (fade != null) 'fade': fade.inMilliseconds,
  };

  /// Turns the camera round the model: [dx] about the vertical, [dy] up or down (radians);
  /// [scale] above 1 comes closer.
  static Map<String, dynamic> orbit({double dx = 0, double dy = 0, double scale = 1}) => {'cmd': 'orbit', 'dx': dx, 'dy': dy, if (scale != 1) 'scale': scale};

  /// Asks which part is at a point of the view (0..1); answered by a `partAt` event.
  static Map<String, dynamic> partAt(Offset at) => {'cmd': 'partAt', 'x': at.dx, 'y': at.dy};
  static Map<String, dynamic> state() => {'cmd': 'state'};

  /// Every command name the page understands (kept in step with viewer.js by a test).
  static const names = {
    'lang', 'labels', 'pick', 'view', 'reset', 'explode', 'slice', 'cut', 'annotate', 'hide', 'variant', 'animate', 'step', 'autoRotate', 'snapshot',
    'mirror', 'laser', 'orbit', 'partAt', 'frames', 'locate', 'debug', 'state',
  };

  static double _r(double v, [double lo = 0, double hi = 1]) => (v.clamp(lo, hi) * 10000).roundToDouble() / 10000;
}

/// Something the viewer page said, decoded.
class ViewerEvent {
  ViewerEvent(this.data);

  /// A message as the page sends it: a JSON string (Android), a map (WebView2 may decode
  /// it already), or a JSON string inside a JSON string (WebView2 string messages).
  static ViewerEvent? decode(Object? message) {
    Object? m = message;
    for (var i = 0; i < 2 && m is String; i++) {
      try {
        m = jsonDecode(m);
      } catch (_) {
        return null;
      }
    }
    if (m is! Map || m['event'] is! String) return null;
    return ViewerEvent(m.cast<String, dynamic>());
  }

  final Map<String, dynamic> data;

  /// ready | loaded | pick | laser | snapshot | frame | animation | autoRotate | state | partAt |
  /// cut | annotations | noteMissed | notePicked | error | restored
  String get type => data['event'] as String;

  /// For pick, laser, partAt: the part, or null for none.
  String? get part => data['part'] as String?;
  String? get message => data['message'] as String?;

  /// For snapshot (PNG) and frame (JPEG): the picture's bytes.
  Uint8List? get image => dataUrlBytes((data['png'] ?? data['jpg']) as String?);

  static Uint8List? dataUrlBytes(String? url) {
    if (url == null) return null;
    final comma = url.indexOf(',');
    if (comma < 0) return null;
    try {
      return base64Decode(url.substring(comma + 1));
    } catch (_) {
      return null;
    }
  }
}

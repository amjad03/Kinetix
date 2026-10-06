import 'package:flutter/foundation.dart';
import 'package:flutter/painting.dart';

/// `#rrggbb` for [c] (the viewer page's colours).
String colorHex(Color c) => '#${(c.toARGB32() & 0xFFFFFF).toRadixString(16).padLeft(6, '0')}';

/// [hex] (`#rrggbb` or `rrggbb`) as an opaque colour; [fallback] when it is not one.
Color colorFromHex(Object? hex, [Color fallback = const Color(0xFFF2B33D)]) {
  final s = hex is String ? hex.replaceFirst('#', '') : '';
  final v = s.length == 6 ? int.tryParse(s, radix: 16) : null;
  return v == null ? fallback : Color(0xFF000000 | v);
}

List<double> _vec(Object? v) => [for (final x in (v is List ? v : const [])) if (x is num) x.toDouble()];

/// A note pinned to a point of a part: [at] is the point in the part's own frame (it follows
/// the part as the model turns, comes apart or moves).
@immutable
class Model3dPin {
  const Model3dPin({required this.id, required this.part, required this.at, this.text = '', this.color = const Color(0xFFF2B33D)});

  factory Model3dPin.fromJson(Map<String, dynamic> j) =>
      Model3dPin(id: '${j['id']}', part: '${j['part']}', at: _vec(j['at']), text: j['text'] as String? ?? '', color: colorFromHex(j['color']));

  final String id;
  final String part;
  final List<double> at;
  final String text;
  final Color color;

  Model3dPin copyWith({String? text, Color? color}) => Model3dPin(id: id, part: part, at: at, text: text ?? this.text, color: color ?? this.color);

  Map<String, dynamic> toJson() => {'id': id, 'part': part, 'at': at, 'text': text, 'color': colorHex(color)};

  @override
  bool operator ==(Object other) =>
      other is Model3dPin && other.id == id && other.part == part && listEquals(other.at, at) && other.text == text && other.color == color;

  @override
  int get hashCode => Object.hash(id, part, Object.hashAll(at), text, color);
}

/// A line drawn by hand: on a part's surface ([part] set, [points] are 3D points in that
/// part's frame), or over the view ([part] null, [points] are x, y from 0 to 1 across it).
@immutable
class Model3dStroke {
  const Model3dStroke({required this.id, this.part, required this.points, this.color = const Color(0xFFE53935), this.width = 2});

  factory Model3dStroke.fromJson(Map<String, dynamic> j, {required bool surface}) => Model3dStroke(
    id: '${j['id']}',
    part: surface ? '${j['part']}' : null,
    points: [for (final p in (j['pts'] as List? ?? const [])) _vec(p)],
    color: colorFromHex(j['color'], const Color(0xFFE53935)),
    width: (j['width'] as num?)?.toDouble() ?? 2,
  );

  final String id;
  final String? part;
  final List<List<double>> points;
  final Color color;
  final double width;

  /// Drawn on the model (rather than over the view).
  bool get onSurface => part != null;

  Map<String, dynamic> toJson() => {
    'id': id,
    'part': ?part,
    'color': colorHex(color),
    'width': width,
    'pts': points,
  };

  @override
  bool operator ==(Object other) =>
      other is Model3dStroke &&
      other.id == id &&
      other.part == part &&
      other.color == color &&
      other.width == width &&
      other.points.length == points.length &&
      Iterable.generate(points.length).every((i) => listEquals(other.points[i], points[i]));

  @override
  int get hashCode => Object.hash(id, part, color, width, points.length);
}

/// What the teacher wrote on a 3D model: pinned notes, strokes drawn on its surface, and ink
/// over the view. The board saves it with the whiteboard ([toJson]) and gives it back to the
/// viewer ([Model3dViewer.annotations]) when the lesson opens the model again.
@immutable
class Model3dAnnotations {
  const Model3dAnnotations({this.pins = const [], this.strokes = const [], this.ink = const []});

  static const empty = Model3dAnnotations();

  /// Reads what [toJson] (or the viewer page) wrote; anything unreadable is left out.
  factory Model3dAnnotations.fromJson(Object? json) {
    if (json is! Map) return empty;
    List<Map<String, dynamic>> list(String k) => [
      for (final e in (json[k] is List ? json[k] as List : const []))
        if (e is Map && e['id'] != null) e.cast<String, dynamic>(),
    ];
    return Model3dAnnotations(
      pins: [for (final p in list('pins')) if (p['part'] != null) Model3dPin.fromJson(p)],
      strokes: [for (final s in list('strokes')) if (s['part'] != null) Model3dStroke.fromJson(s, surface: true)],
      ink: [for (final s in list('ink')) Model3dStroke.fromJson(s, surface: false)],
    );
  }

  final List<Model3dPin> pins;

  /// Drawn on the model's surface.
  final List<Model3dStroke> strokes;

  /// Drawn over the view.
  final List<Model3dStroke> ink;

  bool get isEmpty => pins.isEmpty && strokes.isEmpty && ink.isEmpty;
  bool get isNotEmpty => !isEmpty;

  Model3dPin? pin(String id) => pins.where((p) => p.id == id).firstOrNull;

  Map<String, dynamic> toJson() => {
    'v': 1,
    'pins': [for (final p in pins) p.toJson()],
    'strokes': [for (final s in strokes) s.toJson()],
    'ink': [for (final s in ink) s.toJson()],
  };

  @override
  bool operator ==(Object other) =>
      other is Model3dAnnotations && listEquals(other.pins, pins) && listEquals(other.strokes, strokes) && listEquals(other.ink, ink);

  @override
  int get hashCode => Object.hash(Object.hashAll(pins), Object.hashAll(strokes), Object.hashAll(ink));
}

/// Keeps each model's notes per lesson while the app runs, for viewers under a
/// [Model3dScope] that are given no [Model3dViewer.annotations] of their own. The board sets
/// [lesson] when a lesson opens and saves [toJson] with the lesson's whiteboard.
class Model3dAnnotationStore extends ChangeNotifier {
  Model3dAnnotationStore({String lesson = ''}) : _lesson = lesson;

  factory Model3dAnnotationStore.fromJson(Object? json, {String lesson = ''}) {
    final store = Model3dAnnotationStore(lesson: lesson);
    if (json is Map) {
      for (final MapEntry(:key, :value) in json.entries) {
        final a = Model3dAnnotations.fromJson(value);
        if (a.isNotEmpty) store._byKey['$key'] = a;
      }
    }
    return store;
  }

  final _byKey = <String, Model3dAnnotations>{};
  String _lesson;

  /// The lesson whose notes [of] and [put] read and write by default.
  String get lesson => _lesson;
  set lesson(String id) {
    if (id == _lesson) return;
    _lesson = id;
    notifyListeners();
  }

  static String _key(String lesson, String modelId) => '$lesson/$modelId';

  Model3dAnnotations of(String modelId, {String? lesson}) => _byKey[_key(lesson ?? _lesson, modelId)] ?? Model3dAnnotations.empty;

  void put(String modelId, Model3dAnnotations notes, {String? lesson}) {
    final k = _key(lesson ?? _lesson, modelId);
    if (_byKey[k] == notes || (notes.isEmpty && !_byKey.containsKey(k))) return;
    if (notes.isEmpty) {
      _byKey.remove(k);
    } else {
      _byKey[k] = notes;
    }
    notifyListeners();
  }

  /// Every model's notes in [lesson] (model id to notes).
  Map<String, Model3dAnnotations> inLesson(String lesson) => {
    for (final e in _byKey.entries)
      if (e.key.startsWith('$lesson/')) e.key.substring(lesson.length + 1): e.value,
  };

  /// `{"lesson/model": notes}` for every lesson and model with notes.
  Map<String, dynamic> toJson() => {for (final e in _byKey.entries) e.key: e.value.toJson()};
}

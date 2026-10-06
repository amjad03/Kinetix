import 'dart:convert';

import 'package:flutter/painting.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_3d/kinetix_3d.dart';

/// Notes and drawing on a 3D model: what the board saves with the whiteboard.
void main() {
  final notes = Model3dAnnotations(
    pins: [
      Model3dPin(id: 'p1', part: 'outer_core', at: const [0.01, -0.02, 0.03], text: 'Liquid iron\n4,500 °C', color: const Color(0xFF3D8BF2)),
      const Model3dPin(id: 'p2', part: 'crust', at: [0, 0.1, 0]),
    ],
    strokes: [
      Model3dStroke(id: 's1', part: 'upper_mantle', points: const [[0.0, 0.09, 0.01], [0.01, 0.09, 0.0]], color: const Color(0xFF2EAD5B), width: 3),
    ],
    ink: [
      Model3dStroke(id: 'i1', points: const [[0.1, 0.1], [0.2, 0.25]]),
    ],
  );

  test('survive a trip through JSON text', () {
    final back = Model3dAnnotations.fromJson(jsonDecode(jsonEncode(notes.toJson())));
    expect(back, notes);
    expect(back.pins.first.text, 'Liquid iron\n4,500 °C');
    expect(back.pins.first.color, const Color(0xFF3D8BF2));
    expect(back.pins[1].color, const Color(0xFFF2B33D)); // the default
    expect(back.strokes.single.onSurface, isTrue);
    expect(back.ink.single.onSurface, isFalse);
    expect(back.ink.single.part, isNull);
    expect(back.toJson(), notes.toJson());
  });

  test('read what the viewer page sends', () {
    // As viewer.js writes it: whole numbers without a point, colours as #rrggbb.
    final page = jsonDecode('''{"v":1,
      "pins":[{"id":"pmuw0","part":"inner_core","at":[0,0.005,0.01],"text":"Solid","color":"#f7d23a"}],
      "strokes":[{"id":"smuw1","part":"crust","color":"#e53935","width":2,"pts":[[0,0,0.1],[0.001,0,0.1]]}],
      "ink":[{"id":"imuw2","color":"#ffffff","width":2,"pts":[[0.5,0.5]]}]}''');
    final a = Model3dAnnotations.fromJson(page);
    expect(a.pins.single.at, [0.0, 0.005, 0.01]);
    expect(a.pins.single.color, const Color(0xFFF7D23A));
    expect(a.strokes.single.width, 2.0);
    expect(a.ink.single.points.single, [0.5, 0.5]);
    expect(a.pin('pmuw0')!.text, 'Solid');
  });

  test('leave out what cannot be read', () {
    expect(Model3dAnnotations.fromJson(null), Model3dAnnotations.empty);
    expect(Model3dAnnotations.fromJson('nonsense').isEmpty, isTrue);
    final a = Model3dAnnotations.fromJson({
      'pins': [{'no': 'id'}, {'id': 'p', 'at': [0, 0, 0]}, 7],
      'strokes': [{'id': 's', 'pts': []}],
      'ink': 'x',
    });
    expect(a.isEmpty, isTrue); // a pin or stroke without its part has nowhere to go
    expect(colorFromHex('#zzzzzz', const Color(0xFF000000)), const Color(0xFF000000));
    expect(colorHex(const Color(0x80FF8000)), '#ff8000');
  });

  test('a pin can be changed', () {
    final p = notes.pins.first.copyWith(text: 'Outer core');
    expect(p.text, 'Outer core');
    expect(p.color, notes.pins.first.color);
    expect(p == notes.pins.first, isFalse);
  });

  test('the store keeps each model\'s notes per lesson, and saves them all', () {
    final store = Model3dAnnotationStore(lesson: 'geo-7');
    var changes = 0;
    store.addListener(() => changes++);
    store.put('earth_layers', notes);
    expect(store.of('earth_layers'), notes);
    expect(store.of('earth_layers', lesson: 'bio-8'), Model3dAnnotations.empty);
    store.lesson = 'bio-8';
    expect(store.of('earth_layers'), Model3dAnnotations.empty);
    store.put('animal_cell', Model3dAnnotations(pins: [notes.pins.last]));
    expect(store.inLesson('geo-7').keys, ['earth_layers']);
    final saved = jsonDecode(jsonEncode(store.toJson()));
    final again = Model3dAnnotationStore.fromJson(saved, lesson: 'geo-7');
    expect(again.of('earth_layers'), notes);
    expect(again.of('animal_cell', lesson: 'bio-8').pins.single.id, 'p2');
    // Writing nothing over nothing is not a change; clearing removes the entry.
    final before = changes;
    store.put('heart', Model3dAnnotations.empty);
    expect(changes, before);
    store.put('animal_cell', Model3dAnnotations.empty);
    expect(store.inLesson('bio-8'), isEmpty);
  });
}

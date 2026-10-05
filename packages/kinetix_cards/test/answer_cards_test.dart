import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pdf/pdf.dart';
import 'package:kinetix_cards/kinetix_cards.dart';


/// A synthetic class photo: [cards] (number, answer, centre, size, tilt in
/// degrees) on a wall with uneven light, optionally blurred.
Future<GreyImage> classPhoto(int w, int h, List<(int, int, Offset, double, double)> cards, {double blur = 0, int seed = 1}) async {
  final rec = ui.PictureRecorder();
  final c = Canvas(rec);
  // A wall and students: light falling from one side, dark shapes about.
  c.drawRect(Rect.fromLTWH(0, 0, w.toDouble(), h.toDouble()),
      Paint()..shader = ui.Gradient.linear(Offset.zero, Offset(w.toDouble(), h * 0.6), [const Color(0xFFE6E0D2), const Color(0xFF8E8A80)]));
  final rnd = math.Random(seed);
  for (var i = 0; i < 25; i++) {
    final p = Offset(rnd.nextDouble() * w, rnd.nextDouble() * h);
    c.drawOval(Rect.fromCenter(center: p, width: 40 + rnd.nextDouble() * 160, height: 60 + rnd.nextDouble() * 200),
        Paint()..color = Color.fromARGB(255, 30 + rnd.nextInt(90), 30 + rnd.nextInt(60), 30 + rnd.nextInt(60)));
  }
  for (final (number, answer, centre, size, tilt) in cards) {
    c.save();
    c.translate(centre.dx, centre.dy);
    // Holding answer k on top means turning the card k quarter turns
    // anticlockwise from "A on top" (B is on the right edge).
    c.rotate(-answer * math.pi / 2 + tilt * math.pi / 180);
    if (blur > 0) {
      c.saveLayer(null, Paint()..imageFilter = ui.ImageFilter.blur(sigmaX: blur, sigmaY: blur));
    }
    paintAnswerCard(c, Rect.fromCenter(center: Offset.zero, width: size, height: size), number);
    if (blur > 0) c.restore();
    c.restore();
  }
  final img = await rec.endRecording().toImage(w, h);
  final data = await img.toByteData(format: ui.ImageByteFormat.rawRgba);
  return GreyImage.fromRgba(data!.buffer.asUint8List(), w, h);
}

Future<ui.Image> _toImage(GreyImage g) async {
  final rgba = Uint8List(g.width * g.height * 4);
  for (var i = 0; i < g.pixels.length; i++) {
    rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = g.pixels[i];
    rgba[i * 4 + 3] = 255;
  }
  final buf = await ui.ImmutableBuffer.fromUint8List(rgba);
  final desc = ui.ImageDescriptor.raw(buf, width: g.width, height: g.height, pixelFormat: ui.PixelFormat.rgba8888);
  final codec = await desc.instantiateCodec();
  return (await codec.getNextFrame()).image;
}

void main() {
  test('every card differs from every other card, in every turn, by at least 8 cells', () {
    expect(cardCodes.toSet(), hasLength(cardCodes.length));
    expect(maxCards, 100);
    expect(codebookDistance(), greaterThanOrEqualTo(8));
  });

  test('the answer is the edge on top: a quarter turn clockwise puts D there', () {
    final c = cardCodes[4];
    expect(decodeCardBits(c)!.choice, 0);
    expect(decodeCardBits(turnBits(c))!.choice, 3);
    expect(decodeCardBits(turnBits(turnBits(c)))!.choice, 2);
    expect(decodeCardBits(turnBits(turnBits(turnBits(c))))!.choice, 1);
    // Three misread cells are still card 5; four are not trusted.
    expect(decodeCardBits(c ^ 0x7)!.card, 5);
    final four = decodeCardBits(c ^ 0xF);
    expect(four == null || four.card != 5 || four.errors <= 3, isTrue);
  });

  testWidgets('a photo of a class: every card and every answer, at any size, tilted and in uneven light', (t) async {
    final rnd = math.Random(7);
    final cards = <(int, int, Offset, double, double)>[];
    for (var i = 0; i < 24; i++) {
      final col = i % 6, row = i ~/ 6;
      cards.add((
        i * 4 + 1, // card numbers 1, 5, 9 …
        rnd.nextInt(4),
        Offset(150.0 + col * 260, 140.0 + row * 230),
        70.0 + rnd.nextDouble() * 110, // far and near rows
        rnd.nextDouble() * 30 - 15, // held a little crooked
      ));
    }
    final photo = (await t.runAsync(() => classPhoto(1700, 1000, cards)))!;
    final seen = scanCards(photo);
    final byCard = {for (final s in seen) s.card: s.choice};
    for (final (number, answer, _, _, _) in cards) {
      expect(byCard[number], answer, reason: 'card $number should read ${answerLetters[answer]}');
    }
    expect(seen.length, cards.length, reason: 'nothing read that is not there');
  });

  testWidgets('a slightly blurred photo still reads, and a photo with no cards reads nothing', (t) async {
    final cards = [for (var i = 0; i < 8; i++) (i + 1, i % 4, Offset(140.0 + i * 180, 300), 120.0, (i - 4) * 3.0)];
    final photo = (await t.runAsync(() => classPhoto(1600, 600, cards, blur: 1.6)))!;
    final seen = {for (final s in scanCards(photo)) s.card: s.choice};
    for (final (number, answer, _, _, _) in cards) {
      expect(seen[number], answer, reason: 'card $number');
    }
    final empty = (await t.runAsync(() => classPhoto(1200, 800, const [], seed: 3)))!;
    expect(scanCards(empty), isEmpty);
  });

  testWidgets('seen from the side of the room: perspective, small far cards and dim light', (t) async {
    final cards = <(int, int, Offset, double, double)>[
      for (var i = 0; i < 30; i++) (100 - i, (i * 3) % 4, Offset(110.0 + (i % 10) * 175, 120.0 + (i ~/ 10) * 260), 52.0 + (i ~/ 10) * 40, ((i * 7) % 21 - 10).toDouble()),
    ];
    final flat = (await t.runAsync(() => classPhoto(1900, 800, cards, seed: 11)))!;
    // Re-project the photo as if taken from the left, and dim it.
    final warped = (await t.runAsync(() async {
      final rec = ui.PictureRecorder();
      final c = Canvas(rec);
      final src = await _toImage(flat);
      final m = Matrix4.identity()
        ..setEntry(3, 0, 0.00012)
        ..scaleByDouble(0.9, 0.95, 1, 1);
      c.transform(m.storage);
      c.drawImage(src, const Offset(40, 20), Paint()..colorFilter = const ColorFilter.mode(Color(0xFF9A9A9A), BlendMode.modulate));
      final img = await rec.endRecording().toImage(1900, 900);
      final data = await img.toByteData(format: ui.ImageByteFormat.rawRgba);
      return GreyImage.fromRgba(data!.buffer.asUint8List(), 1900, 900);
    }))!;
    final seen = {for (final s in scanCards(warped)) s.card: s.choice};
    var right = 0;
    for (final (number, answer, _, _, _) in cards) {
      if (seen[number] == answer) right++;
      expect(seen[number] == null || seen[number] == answer, isTrue, reason: 'card $number: a card read must be read right');
    }
    expect(right, greaterThanOrEqualTo(27), reason: 'nearly every card, even far and slanted');
  });

  testWidgets('a full-size photo is read in reasonable time', (t) async {
    final cards = [for (var i = 0; i < 40; i++) (i + 1, i % 4, Offset(160.0 + (i % 10) * 290, 200.0 + (i ~/ 10) * 450), 150.0, 0.0)];
    final photo = (await t.runAsync(() => classPhoto(3000, 2000, cards)))!;
    final sw = Stopwatch()..start();
    final seen = scanCards(photo);
    sw.stop();
    expect(seen, hasLength(40));
    expect(sw.elapsedMilliseconds, lessThan(8000), reason: 'debug build on a laptop; the release app is several times faster');
  });

  test('printable cards: one A4 page per student', () async {
    final bytes = await answerCardsPdf(classLabel: 'Class 9 A', cards: const [PrintableCard(number: 1, name: 'Aarav'), PrintableCard(number: 7, name: 'Diya', rollNo: '7'), PrintableCard(number: 12)]);
    expect(String.fromCharCodes(bytes.take(5)), '%PDF-');
    final pages = RegExp(r'/Type\s*/Page[^s]').allMatches(String.fromCharCodes(bytes)).length;
    expect(pages, 3);
    expect(PdfPageFormat.a4.width, greaterThan(500));
  });

  testWidgets('reads in an isolate, and a photo saved on its side reads after turning it upright', (t) async {
    final cards = [for (var i = 0; i < 6; i++) (i + 10, i % 4, Offset(150.0 + i * 200, 250), 130.0, 0.0)];
    final photo = (await t.runAsync(() => classPhoto(1400, 500, cards)))!;
    // The camera saved it a quarter turn anticlockwise; one quarter turn clockwise puts it back.
    final sideways = turnGrey(photo, 3);
    final seen = (await t.runAsync(() => readCardsInPhoto(sideways, quarterTurns: 1)))!;
    expect({for (final s in seen) s.card: s.choice}, {for (final c in cards) c.$1: c.$2});
  });
}

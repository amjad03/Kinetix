import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:kinetix_animations/kinetix_animations.dart';
import 'package:kinetix_ink/kinetix_ink.dart';

import '../board/kit/chem/chem_kit.dart' show pfdPanel, unitOpPanel;
import '../board/kit/civil/civil_samples.dart' show civilData, civilPanel;
import '../board/kit/cs/cs_diagram_samples.dart' show CsDiagramSample, csDiagramPanel, sampleDiagram;
import '../board/kit/ece/ece_samples.dart' show ecePanel;
import '../board/kit/eee/eee_samples.dart' show RlcSample, SldSample, WaveSample, eeePanel, sampleRlc, sampleSld, sampleThreePhase, sampleWave;
import '../board/kit/mech/mech_samples.dart' show mechData, mechPanel;
import '../insert/picture_library.dart';
import '../search/catalogue_facets.dart' show modelItems;
import 'ink_asset_index.dart';

/// The board's shelves as the AI pen's suggestion row sees them: the picture library, live
/// diagram templates (kinetix_ink's logic, circuit, beam, process, UML... panels), the
/// animations and the 3D models; and how a chosen one takes the place of the ink.

/// A live diagram the suggestion row can put on the board, in a colour.
typedef DiagramBuilder = BoardElement Function(Color color);

KitElement _gate(GateType g, Color color) {
  final c = LogicCircuit()..title = '${gateName(g)} gate';
  final two = gateGrows(g);
  final a = c.add(PartKind.input, const Offset(24, 30))..label = 'A';
  final b = two ? (c.add(PartKind.input, const Offset(24, 110))..label = 'B') : null;
  final gate = c.add(PartKind.gate, const Offset(220, 50), gate: g, inputs: two ? 2 : null);
  final y = c.add(PartKind.led, const Offset(440, 60))..label = 'Y';
  c.connect(a.id, gate.id, 0);
  if (b != null) c.connect(b.id, gate.id, 1);
  c.connect(gate.id, y.id, 0);
  return ecePanel(KitKind.logicCircuit, c.toJson(), color);
}

/// The diagram templates, with the words that find them.
final List<(String, List<String>, DiagramBuilder)> diagramTemplates = [
  for (final g in const [GateType.and, GateType.or, GateType.not, GateType.nand, GateType.nor, GateType.xor, GateType.xnor])
    ('${gateName(g)} gate', ['${g.name} gate', 'logic gate', 'logic circuit', 'digital'], (c) => _gate(g, c)),
  for (final p in const [LogicPreset.halfAdder, LogicPreset.fullAdder, LogicPreset.mux2, LogicPreset.srFlipFlop, LogicPreset.dFlipFlop])
    (logicPresetName(p), ['logic circuit', 'digital'], (c) => ecePanel(KitKind.logicCircuit, logicPreset(p).toJson(), c)),
  ('Series RLC circuit', ['rlc circuit', 'resistor', 'capacitor', 'inductor', 'circuit'], (c) => eeePanel(KitKind.rlc, sampleRlc(RlcSample.series).toJson(), c)),
  ('RC circuit', ['rc circuit', 'resistor', 'capacitor'], (c) => eeePanel(KitKind.rlc, sampleRlc(RlcSample.rc).toJson(), c)),
  ('Three-phase star connection', ['three phase', 'star connection'], (c) => eeePanel(KitKind.threePhase, sampleThreePhase(ThreePhaseConnection.star).toJson(), c)),
  ('Single line diagram', ['single line diagram', 'transformer', 'generator', 'power system'], (c) => eeePanel(KitKind.singleLine, sampleSld(SldSample.radial).toJson(), c)),
  ('Sine wave', ['sine wave', 'waveform', 'signal', 'ac'], (c) => eeePanel(KitKind.waveform, sampleWave(WaveSample.sine).toJson(), c)),
  ('Square wave', ['square wave', 'pulse', 'waveform'], (c) => eeePanel(KitKind.waveform, sampleWave(WaveSample.square).toJson(), c)),
  ('Simply supported beam', ['beam', 'shear force', 'bending moment', 'sfd', 'bmd'], (c) => civilPanel(KitKind.beam, civilData(KitKind.beam), c)),
  ('Truss', ['truss', 'bridge', 'frame'], (c) => civilPanel(KitKind.truss, civilData(KitKind.truss), c)),
  ('Free body diagram', ['free body diagram', 'fbd', 'incline', 'block', 'forces'], (c) => mechPanel(KitKind.fbd, mechData(KitKind.fbd), c)),
  ('Otto cycle', ['engine', 'otto cycle', 'thermodynamic cycle', 'pv diagram'], (c) => mechPanel(KitKind.thermoCycle, mechData(KitKind.thermoCycle), c)),
  ('Distillation process flow', ['distillation column', 'process flow diagram', 'pfd', 'pump', 'valve'], (c) => pfdPanel(PfdSample.distillation, c)),
  ('Heat exchanger', ['heat exchanger', 'shell and tube', 'condenser'], (c) => unitOpPanel(UnitOp.heatExchanger, c)),
  ('Class diagram', ['class diagram', 'uml'], (c) => csDiagramPanel(sampleDiagram(CsDiagramSample.libraryClasses), c)),
  ('Sequence diagram', ['sequence diagram', 'uml'], (c) => csDiagramPanel(sampleDiagram(CsDiagramSample.atmSequence), c)),
  ('ER diagram', ['er diagram', 'database', 'entity relationship'], (c) => csDiagramPanel(sampleDiagram(CsDiagramSample.studentEr), c)),
  ('DFA', ['dfa', 'automaton', 'state machine', 'state diagram'], (c) => csDiagramPanel(sampleDiagram(CsDiagramSample.dfaEnds01), c)),
];

InkAssetIndex? _cached;

/// The index over everything the board has, built once (the picture library loads from assets).
Future<InkAssetIndex> boardInkAssets() async {
  final cached = _cached;
  if (cached != null) return cached;
  final lib = await PictureLibrary.load();
  return _cached = InkAssetIndex([
    for (final p in lib.pictures)
      InkAsset(kind: InkAssetKind.picture, id: p.id, title: p.title, keywords: p.tags, thumb: p.thumb, payload: p),
    for (final (title, words, build) in diagramTemplates)
      InkAsset(kind: InkAssetKind.diagram, id: title.toLowerCase(), title: title, keywords: words, payload: build),
    for (final m in modelItems)
      InkAsset(kind: InkAssetKind.model3d, id: m.id, title: m.titleIn('en'), keywords: m.keywords),
    for (final a in animationCatalogue)
      InkAsset(kind: InkAssetKind.animation, id: a.id, title: a.title.en, keywords: [...a.keywords, a.topic], payload: a),
  ]);
}

/// [size] fitted inside [box] (keeping its proportions), centred on it, and at least [min]
/// across so a small sketch still makes a usable picture.
Rect fitInto(Rect box, Size size, {double min = 160}) {
  final target = Size(math.max(box.width, min), math.max(box.height, min * size.height / math.max(1, size.width)));
  final s = math.min(target.width / size.width, target.height / size.height);
  final w = size.width * s, h = size.height * s;
  return Rect.fromCenter(center: box.center, width: w, height: h);
}

/// What [a] puts on the board in the place of ink inside [box], drawn in [color] where it has one;
/// null when it cannot be made (a picture that would not load). Models and animations go on as
/// a picture linked to them (a frame of the animation, a card for a model), which opens them.
Future<BoardElement?> inkAssetElement(InkAsset a, Rect box, Color color, {Future<Uint8List> Function(LibraryPicture p)? pictureBytes}) async {
  switch (a.kind) {
    case InkAssetKind.picture:
      final p = a.payload! as LibraryPicture;
      final bytes = await (pictureBytes ?? (p) async => (await PictureLibrary.load()).bytes(p))(p);
      return ImageElement(id: newElementId(), rect: fitInto(box, p.size), bytes: bytes);
    case InkAssetKind.diagram:
      final el = (a.payload! as DiagramBuilder)(color);
      if (el is KitElement) return el.copyWith(rect: fitInto(box, KitElement.naturalSizeOf(el.kind), min: 320));
      return el;
    case InkAssetKind.animation:
      final anim = a.payload as KxAnimation?;
      final png = anim == null ? await _card(a.title, Icons.animation) : await renderAnimationPng(anim, const AnimFrame(0.5), size: const Size(800, 480));
      return ImageElement(id: newElementId(), rect: fitInto(box, const Size(800, 480), min: 320), bytes: png, link: EmbedLink(kind: inkAnimationLink, id: a.id));
    case InkAssetKind.model3d:
      final png = await _card(a.title, Icons.view_in_ar_outlined);
      return ImageElement(id: newElementId(), rect: fitInto(box, const Size(640, 400), min: 320), bytes: png, link: EmbedLink(kind: EmbedLink.model3d, id: a.id));
  }
}

/// The [EmbedLink.kind] of an animation put on the board from the suggestion row.
const inkAnimationLink = 'animation';

/// A card for a model or an animation: its icon and title, to tap open.
Future<Uint8List> _card(String title, IconData icon, {Size size = const Size(640, 400)}) async {
  final rec = ui.PictureRecorder();
  final c = Canvas(rec);
  final r = RRect.fromRectAndRadius(Offset.zero & size, const Radius.circular(36));
  c.drawRRect(r, Paint()..color = const Color(0xFFF1F5F9));
  c.drawRRect(r.deflate(3), Paint()
    ..color = const Color(0xFF64748B)
    ..style = PaintingStyle.stroke
    ..strokeWidth = 6);
  final glyph = TextPainter(
    text: TextSpan(text: String.fromCharCode(icon.codePoint), style: TextStyle(fontFamily: icon.fontFamily, package: icon.fontPackage, fontSize: 150, color: const Color(0xFF334155))),
    textDirection: TextDirection.ltr,
  )..layout();
  glyph.paint(c, Offset((size.width - glyph.width) / 2, 50));
  final label = TextPainter(
    text: TextSpan(text: title, style: const TextStyle(fontSize: 44, fontWeight: FontWeight.w600, color: Color(0xFF0F172A))),
    textDirection: TextDirection.ltr,
    textAlign: TextAlign.center,
    maxLines: 2,
    ellipsis: '…',
  )..layout(maxWidth: size.width - 60);
  label.paint(c, Offset((size.width - label.width) / 2, 230));
  glyph.dispose();
  label.dispose();
  final img = await rec.endRecording().toImage(size.width.round(), size.height.round());
  try {
    final data = await img.toByteData(format: ui.ImageByteFormat.png);
    return data!.buffer.asUint8List();
  } finally {
    img.dispose();
  }
}

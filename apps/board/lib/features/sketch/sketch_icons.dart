import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';

/// A clean icon for something the teacher sketched: a Unicode emoji (drawn with the platform's
/// colour emoji font) or, where there is no good emoji, a Material icon. Nothing is downloaded.
class SketchIcon {
  const SketchIcon(this.label, {this.emoji, this.icon}) : assert(emoji != null || icon != null);

  /// The recogniser's label, normalised ([normaliseSketchLabel]): "cat", "teddy bear".
  final String label;
  final String? emoji;
  final IconData? icon;

  @override
  bool operator ==(Object other) => other is SketchIcon && other.label == label && other.emoji == emoji && other.icon == icon;
  @override
  int get hashCode => Object.hash(label, emoji, icon);
}

/// A recogniser label as the maps below key it: lower case, words split by single spaces, no
/// leading "the" ("The_Eiffel-Tower" → "eiffel tower").
String normaliseSketchLabel(String label) {
  var l = label.trim().toLowerCase().replaceAll(RegExp(r'[_\-]+'), ' ').replaceAll(RegExp(r'\s+'), ' ');
  if (l.startsWith('the ')) l = l.substring(4);
  return l;
}

/// The icon for a recogniser label, emoji first; null when the board has none for it.
SketchIcon? sketchIconFor(String label) {
  final l = normaliseSketchLabel(label);
  final emoji = sketchEmoji[l];
  if (emoji != null) return SketchIcon(l, emoji: emoji);
  final icon = sketchMaterialIcons[l];
  if (icon != null) return SketchIcon(l, icon: icon);
  return null;
}

/// The icons for [labels] (most likely first), one per icon, at most [max].
List<SketchIcon> sketchIconsFor(Iterable<String> labels, {int max = 8}) {
  final out = <SketchIcon>[];
  final seen = <String>{};
  for (final label in labels) {
    final icon = sketchIconFor(label);
    if (icon == null || !seen.add(icon.emoji ?? '${icon.icon!.codePoint}')) continue;
    out.add(icon);
    if (out.length == max) break;
  }
  return out;
}

/// Emoji for the AutoDraw / Quick, Draw! classes (and a few classroom extras), by normalised
/// label. Only emoji from Unicode 13 or earlier, so older Android panels draw them all.
const sketchEmoji = <String, String>{
  'aircraft carrier': '🚢',
  'airplane': '✈️',
  'alarm clock': '⏰',
  'ambulance': '🚑',
  'angel': '👼',
  'ant': '🐜',
  'apple': '🍎',
  'arm': '💪',
  'atom': '⚛️',
  'axe': '🪓',
  'backpack': '🎒',
  'ball': '⚽',
  'balloon': '🎈',
  'banana': '🍌',
  'bandage': '🩹',
  'baseball': '⚾',
  'basket': '🧺',
  'basketball': '🏀',
  'bat': '🦇',
  'bathtub': '🛁',
  'battery': '🔋',
  'beach': '🏖️',
  'bear': '🐻',
  'beard': '🧔',
  'bed': '🛏️',
  'bee': '🐝',
  'bell': '🔔',
  'bicycle': '🚲',
  'bird': '🐦',
  'birthday cake': '🎂',
  'blackberry': '🫐',
  'blueberry': '🫐',
  'boat': '⛵',
  'bone': '🦴',
  'book': '📖',
  'boomerang': '🪃',
  'bread': '🍞',
  'brain': '🧠',
  'bridge': '🌉',
  'broccoli': '🥦',
  'broom': '🧹',
  'bucket': '🪣',
  'bus': '🚌',
  'bush': '🌿',
  'butterfly': '🦋',
  'cactus': '🌵',
  'cake': '🍰',
  'calendar': '📅',
  'camel': '🐫',
  'camera': '📷',
  'campfire': '🔥',
  'candle': '🕯️',
  'canoe': '🛶',
  'car': '🚗',
  'carrot': '🥕',
  'castle': '🏰',
  'cat': '🐱',
  'cell phone': '📱',
  'cello': '🎻',
  'chair': '🪑',
  'cherry': '🍒',
  'chicken': '🐔',
  'church': '⛪',
  'clock': '🕒',
  'cloud': '☁️',
  'coffee cup': '☕',
  'compass': '🧭',
  'computer': '💻',
  'cookie': '🍪',
  'corn': '🌽',
  'couch': '🛋️',
  'cow': '🐄',
  'crab': '🦀',
  'crayon': '🖍️',
  'cricket': '🏏',
  'crocodile': '🐊',
  'crown': '👑',
  'cruise ship': '🛳️',
  'cup': '🍵',
  'cupcake': '🧁',
  'deer': '🦌',
  'diamond': '💎',
  'dna': '🧬',
  'dog': '🐶',
  'dolphin': '🐬',
  'donut': '🍩',
  'door': '🚪',
  'dragon': '🐉',
  'drums': '🥁',
  'duck': '🦆',
  'ear': '👂',
  'earth': '🌍',
  'egg': '🥚',
  'eiffel tower': '🗼',
  'elephant': '🐘',
  'envelope': '✉️',
  'eye': '👁️',
  'eyeglasses': '👓',
  'face': '🙂',
  'feather': '🪶',
  'finger': '👆',
  'firetruck': '🚒',
  'fish': '🐟',
  'flamingo': '🦩',
  'flashlight': '🔦',
  'flip flops': '🩴',
  'flower': '🌸',
  'flying saucer': '🛸',
  'foot': '🦶',
  'fork': '🍴',
  'frog': '🐸',
  'frying pan': '🍳',
  'garden': '🌷',
  'gift': '🎁',
  'giraffe': '🦒',
  'glasses': '👓',
  'globe': '🌍',
  'goatee': '🧔',
  'golf club': '⛳',
  'grapes': '🍇',
  'guitar': '🎸',
  'hamburger': '🍔',
  'hammer': '🔨',
  'hand': '✋',
  'hat': '🎩',
  'headphones': '🎧',
  'heart': '❤️',
  'hedgehog': '🦔',
  'helicopter': '🚁',
  'helmet': '⛑️',
  'hen': '🐔',
  'hockey puck': '🏒',
  'hockey stick': '🏒',
  'horse': '🐴',
  'hospital': '🏥',
  'hot air balloon': '🎈',
  'hot dog': '🌭',
  'hot tub': '♨️',
  'hourglass': '⌛',
  'house': '🏠',
  'house plant': '🪴',
  'hurricane': '🌀',
  'ice cream': '🍦',
  'jacket': '🧥',
  'kangaroo': '🦘',
  'key': '🔑',
  'keyboard': '⌨️',
  'kite': '🪁',
  'knife': '🔪',
  'ladder': '🪜',
  'lantern': '🏮',
  'laptop': '💻',
  'leaf': '🍃',
  'leg': '🦵',
  'lemon': '🍋',
  'light bulb': '💡',
  'lightning': '⚡',
  'lion': '🦁',
  'lipstick': '💄',
  'lobster': '🦞',
  'lollipop': '🍭',
  'magnet': '🧲',
  'mailbox': '📫',
  'mango': '🥭',
  'map': '🗺️',
  'marker': '🖊️',
  'megaphone': '📣',
  'mermaid': '🧜',
  'microphone': '🎤',
  'microscope': '🔬',
  'mona lisa': '🖼️',
  'monkey': '🐒',
  'moon': '🌙',
  'mosque': '🕌',
  'mosquito': '🦟',
  'motorbike': '🏍️',
  'mountain': '⛰️',
  'mouse': '🐭',
  'mouth': '👄',
  'mug': '☕',
  'mushroom': '🍄',
  'necklace': '📿',
  'nose': '👃',
  'ocean': '🌊',
  'octagon': '🛑',
  'octopus': '🐙',
  'onion': '🧅',
  'orange': '🍊',
  'owl': '🦉',
  'paintbrush': '🖌️',
  'palm tree': '🌴',
  'panda': '🐼',
  'pants': '👖',
  'paper clip': '📎',
  'parachute': '🪂',
  'parrot': '🦜',
  'peacock': '🦚',
  'peanut': '🥜',
  'pear': '🍐',
  'pen': '🖊️',
  'pencil': '✏️',
  'penguin': '🐧',
  'piano': '🎹',
  'pickup truck': '🛻',
  'picture frame': '🖼️',
  'pig': '🐷',
  'pineapple': '🍍',
  'pizza': '🍕',
  'planet': '🪐',
  'plant': '🌱',
  'police car': '🚓',
  'pool': '🏊',
  'potato': '🥔',
  'purse': '👛',
  'rabbit': '🐰',
  'raccoon': '🦝',
  'radio': '📻',
  'rain': '🌧️',
  'rainbow': '🌈',
  'rhinoceros': '🦏',
  'robot': '🤖',
  'rocket': '🚀',
  'roller coaster': '🎢',
  'rollerskates': '🛼',
  'rose': '🌹',
  'sailboat': '⛵',
  'sandwich': '🥪',
  'saturn': '🪐',
  'saw': '🪚',
  'saxophone': '🎷',
  'school bus': '🚌',
  'scissors': '✂️',
  'scorpion': '🦂',
  'screwdriver': '🪛',
  'sea turtle': '🐢',
  'seed': '🌱',
  'shark': '🦈',
  'sheep': '🐑',
  'shell': '🐚',
  'ship': '🚢',
  'shoe': '👟',
  'shorts': '🩳',
  'skateboard': '🛹',
  'skull': '💀',
  'skyscraper': '🏙️',
  'smiley face': '😊',
  'snail': '🐌',
  'snake': '🐍',
  'snorkel': '🤿',
  'snowflake': '❄️',
  'snowman': '⛄',
  'soccer ball': '⚽',
  'sock': '🧦',
  'speedboat': '🚤',
  'spider': '🕷️',
  'spoon': '🥄',
  'squirrel': '🐿️',
  'star': '⭐',
  'steak': '🥩',
  'stethoscope': '🩺',
  'stop sign': '🛑',
  'strawberry': '🍓',
  'suitcase': '🧳',
  'sun': '☀️',
  'sunflower': '🌻',
  'swan': '🦢',
  'sword': '🗡️',
  'syringe': '💉',
  't shirt': '👕',
  'teapot': '🫖',
  'teddy bear': '🧸',
  'telephone': '☎️',
  'television': '📺',
  'temple': '🛕',
  'tennis racquet': '🎾',
  'tent': '⛺',
  'test tube': '🧪',
  'thermometer': '🌡️',
  'tiger': '🐯',
  'toe': '🦶',
  'toilet': '🚽',
  'tomato': '🍅',
  'tooth': '🦷',
  'toothbrush': '🪥',
  'tornado': '🌪️',
  'tractor': '🚜',
  'traffic light': '🚦',
  'train': '🚆',
  'tree': '🌳',
  'trombone': '🎺',
  'trophy': '🏆',
  'truck': '🚚',
  'trumpet': '🎺',
  'umbrella': '☂️',
  'underwear': '🩲',
  'unicorn': '🦄',
  'van': '🚐',
  'vase': '🏺',
  'violin': '🎻',
  'volcano': '🌋',
  'water': '💧',
  'watermelon': '🍉',
  'whale': '🐋',
  'wine bottle': '🍾',
  'wine glass': '🍷',
  'worm': '🪱',
  'wristwatch': '⌚',
  'yoga': '🧘',
  'zebra': '🦓',
};

/// Material icons for classes with no fitting emoji (shapes, appliances, furniture).
const sketchMaterialIcons = <String, IconData>{
  'arrow': Icons.arrow_forward,
  'barn': Icons.cottage_outlined,
  'baseball bat': Icons.sports_baseball_outlined,
  'bench': Icons.chair_alt_outlined,
  'bulldozer': Icons.construction,
  'calculator': Icons.calculate_outlined,
  'ceiling fan': Icons.mode_fan_off_outlined,
  'circle': Icons.circle_outlined,
  'drill': Icons.hardware_outlined,
  'dumbbell': Icons.fitness_center,
  'fan': Icons.mode_fan_off_outlined,
  'fence': Icons.fence,
  'fireplace': Icons.fireplace_outlined,
  'floor lamp': Icons.light_outlined,
  'grass': Icons.grass,
  'hexagon': Icons.hexagon_outlined,
  'microwave': Icons.microwave_outlined,
  'oven': Icons.kitchen_outlined,
  'paint can': Icons.format_paint_outlined,
  'power outlet': Icons.power_outlined,
  'remote control': Icons.settings_remote_outlined,
  'spreadsheet': Icons.grid_on,
  'square': Icons.crop_square,
  'stairs': Icons.stairs_outlined,
  'stereo': Icons.speaker_outlined,
  'stove': Icons.outdoor_grill_outlined,
  'table': Icons.table_restaurant_outlined,
  'triangle': Icons.change_history,
  'washing machine': Icons.local_laundry_service_outlined,
};

/// Draws [icon] as a PNG the size of [size] (board units), the icon centred and as large as fits,
/// the rest transparent: a picture that takes the sketch's place exactly. A Material icon is drawn
/// in [color] (the ink's); an emoji keeps its own colours.
Future<Uint8List> renderSketchIcon(SketchIcon icon, Size size, {Color color = const Color(0xFF1F2937)}) async {
  // About two pixels per board unit, so it stays sharp when enlarged, and at most 512 across.
  final px = (2.0 * math.max(size.width, size.height)).clamp(48.0, 512.0) / math.max(1.0, math.max(size.width, size.height));
  final w = math.max(1, (size.width * px).round()), h = math.max(1, (size.height * px).round());
  final side = math.min(w, h).toDouble();
  final recorder = ui.PictureRecorder();
  final canvas = Canvas(recorder);
  final TextSpan span;
  final i = icon.icon;
  if (icon.emoji != null) {
    span = TextSpan(text: icon.emoji, style: TextStyle(fontSize: side * 0.82, height: 1));
  } else {
    span = TextSpan(
      text: String.fromCharCode(i!.codePoint),
      style: TextStyle(fontFamily: i.fontFamily, package: i.fontPackage, fontSize: side, height: 1, color: color),
    );
  }
  final tp = TextPainter(text: span, textDirection: TextDirection.ltr)..layout();
  tp.paint(canvas, Offset((w - tp.width) / 2, (h - tp.height) / 2));
  tp.dispose();
  final picture = recorder.endRecording();
  final image = await picture.toImage(w, h);
  picture.dispose();
  final data = await image.toByteData(format: ui.ImageByteFormat.png);
  image.dispose();
  return data!.buffer.asUint8List();
}

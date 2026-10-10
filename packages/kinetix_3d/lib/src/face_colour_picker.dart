import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

/// Words in the face colour picker; the app passes them in the teacher's language.
class FaceColourStrings {
  const FaceColourStrings({
    this.title = 'Face colour',
    this.hue = 'Hue',
    this.saturation = 'Saturation',
    this.brightness = 'Brightness',
    this.hex = 'Hex colour',
    this.palette = 'Colours',
    this.recent = 'Recent colours',
    this.apply = 'Apply',
    this.reset = 'Reset face',
    this.cancel = 'Cancel',
  });

  final String title, hue, saturation, brightness, hex, palette, recent, apply, reset, cancel;
}

/// What the teacher chose: a [color], or (with [color] null) to take the colour off the face.
class FaceColourChoice {
  const FaceColourChoice(this.color);
  final Color? color;
}

/// Colours offered in the picker beside the free sliders.
const faceColourPalette = [
  Color(0xFFE53935),
  Color(0xFFFB8C00),
  Color(0xFFFDD835),
  Color(0xFF43A047),
  Color(0xFF00ACC1),
  Color(0xFF1E88E5),
  Color(0xFF8E24AA),
  Color(0xFFEC407A),
  Color(0xFF6D4C41),
  Color(0xFF757575),
  Color(0xFFFFFFFF),
  Color(0xFF212121),
];

/// Colours used lately, newest first (kept while the app runs).
final ValueNotifier<List<Color>> recentFaceColours = ValueNotifier(const []);

void rememberFaceColour(Color c) {
  final list = [c, ...recentFaceColours.value.where((x) => x.toARGB32() != c.toARGB32())];
  recentFaceColours.value = list.take(10).toList();
}

/// A colour picker for one face of a solid: any colour (hue, saturation and brightness sliders
/// or a hex code), the palette, and the colours used recently. Returns null when cancelled.
Future<FaceColourChoice?> showFaceColourPicker(BuildContext context, {Color? current, FaceColourStrings strings = const FaceColourStrings()}) =>
    showDialog<FaceColourChoice>(context: context, builder: (_) => FaceColourPicker(initial: current, strings: strings));

class FaceColourPicker extends StatefulWidget {
  const FaceColourPicker({super.key, this.initial, this.strings = const FaceColourStrings()});

  final Color? initial;
  final FaceColourStrings strings;

  @override
  State<FaceColourPicker> createState() => _FaceColourPickerState();
}

class _FaceColourPickerState extends State<FaceColourPicker> {
  late HSVColor _hsv = HSVColor.fromColor(widget.initial ?? const Color(0xFF1E88E5));
  late final TextEditingController _hex = TextEditingController(text: _hexOf(_hsv.toColor()));

  static String _hexOf(Color c) => (c.toARGB32() & 0xFFFFFF).toRadixString(16).padLeft(6, '0').toUpperCase();

  @override
  void dispose() {
    _hex.dispose();
    super.dispose();
  }

  void _set(HSVColor h) => setState(() {
    _hsv = h;
    _hex.text = _hexOf(h.toColor());
  });

  @override
  Widget build(BuildContext context) {
    final s = widget.strings;
    final color = _hsv.toColor();
    Widget swatch(Color c, Key key) => InkResponse(
      key: key,
      onTap: () => _set(HSVColor.fromColor(c)),
      child: Container(
        width: 40,
        height: 40,
        decoration: BoxDecoration(color: c, shape: BoxShape.circle, border: Border.all(width: c.toARGB32() == color.toARGB32() ? 4 : 1, color: context.colors.onSurface)),
      ),
    );
    Widget slider(Key key, String label, double v, double max, ValueChanged<double> f) => Row(
      children: [
        SizedBox(width: 92, child: Text(label, style: context.text.labelMedium)),
        Expanded(child: Slider(key: key, value: v.clamp(0, max), min: 0, max: max, onChanged: f)),
      ],
    );
    return AlertDialog(
      key: const Key('face-colour-picker'),
      title: Text(s.title),
      content: SizedBox(
        width: 420,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                key: const Key('face-colour-preview'),
                height: 44,
                decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(8), border: Border.all(color: context.colors.outline)),
              ),
              slider(const Key('face-colour-hue'), s.hue, _hsv.hue, 360, (v) => _set(_hsv.withHue(v))),
              slider(const Key('face-colour-sat'), s.saturation, _hsv.saturation, 1, (v) => _set(_hsv.withSaturation(v))),
              slider(const Key('face-colour-val'), s.brightness, _hsv.value, 1, (v) => _set(_hsv.withValue(v))),
              TextField(
                key: const Key('face-colour-hex'),
                controller: _hex,
                maxLength: 6,
                decoration: InputDecoration(labelText: s.hex, prefixText: '#', isDense: true, counterText: ''),
                onChanged: (v) {
                  final n = v.length == 6 ? int.tryParse(v, radix: 16) : null;
                  if (n != null) setState(() => _hsv = HSVColor.fromColor(Color(0xFF000000 | n)));
                },
              ),
              const SizedBox(height: 8),
              Text(s.palette, style: context.text.labelMedium),
              const SizedBox(height: 4),
              Wrap(spacing: 6, runSpacing: 6, children: [for (final (i, c) in faceColourPalette.indexed) swatch(c, Key('face-palette-$i'))]),
              ValueListenableBuilder<List<Color>>(
                valueListenable: recentFaceColours,
                builder: (context, recent, _) => recent.isEmpty
                    ? const SizedBox.shrink()
                    : Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const SizedBox(height: 8),
                          Text(s.recent, style: context.text.labelMedium),
                          const SizedBox(height: 4),
                          Wrap(spacing: 6, runSpacing: 6, children: [for (final (i, c) in recent.indexed) swatch(c, Key('face-recent-$i'))]),
                        ],
                      ),
              ),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(key: const Key('face-colour-reset'), onPressed: () => Navigator.pop(context, const FaceColourChoice(null)), child: Text(s.reset)),
        TextButton(onPressed: () => Navigator.pop(context), child: Text(s.cancel)),
        FilledButton(
          key: const Key('face-colour-apply'),
          onPressed: () {
            rememberFaceColour(color);
            Navigator.pop(context, FaceColourChoice(color));
          },
          child: Text(s.apply),
        ),
      ],
    );
  }
}

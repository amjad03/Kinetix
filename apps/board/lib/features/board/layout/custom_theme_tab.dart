import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';
import 'package:path_provider/path_provider.dart';

import '../../../core/board_controller.dart';
import '../../insert/device_files.dart';
import '../chrome.dart';
import '../sb_strings.dart';

/// Largest custom background or logo the teacher can upload (spec §22: max 10 MB).
const maxCustomPictureBytes = 10 * 1024 * 1024;

/// JPG, JPEG or PNG by their first bytes (the name can lie).
bool isJpegOrPng(Uint8List b) =>
    (b.length > 3 && b[0] == 0xFF && b[1] == 0xD8 && b[2] == 0xFF) || (b.length > 8 && b[0] == 0x89 && b[1] == 0x50 && b[2] == 0x4E && b[3] == 0x47);

/// Where the teacher's logo is kept on the board. Tests replace it.
Future<Directory> Function() logoDirectory = getApplicationSupportDirectory;

/// Theme → Custom: the teacher's own picture under the ink (JPG/PNG up to 10 MB, previewed
/// before it is applied) and the branding that shared and exported PDFs carry (brand name,
/// watermark, logo).
class CustomThemeTab extends StatefulWidget {
  const CustomThemeTab({super.key, required this.onApply, this.board});

  /// Puts the chosen picture under the ink of the page(s).
  final ValueChanged<Uint8List> onApply;

  /// Branding is kept per teacher; without a board (previews) only the picture is offered.
  final BoardController? board;

  @override
  State<CustomThemeTab> createState() => _CustomThemeTabState();
}

class _CustomThemeTabState extends State<CustomThemeTab> {
  Uint8List? _preview;
  late final _brand = TextEditingController(text: widget.board?.sbPref('brand') ?? '');
  late final _mark = TextEditingController(text: widget.board?.sbPref('watermark') ?? '');

  @override
  void dispose() {
    _brand.dispose();
    _mark.dispose();
    super.dispose();
  }

  Future<Uint8List?> _pick() async {
    final s = SbStrings.of(context);
    PickedFile? f;
    try {
      f = await DeviceFiles.instance.pickPicture();
    } catch (_) {
      f = null;
    }
    if (f == null || !mounted) return null;
    if (f.bytes.length > maxCustomPictureBytes) {
      showBoardMessage(context, s('tooLarge'));
      return null;
    }
    if (!isJpegOrPng(f.bytes)) {
      showBoardMessage(context, 'JPG / PNG');
      return null;
    }
    return f.bytes;
  }

  Future<void> _pickBackground() async {
    final b = await _pick();
    if (b != null && mounted) setState(() => _preview = b);
  }

  Future<void> _pickLogo() async {
    final board = widget.board;
    final b = await _pick();
    if (b == null || board == null) return;
    final dir = await logoDirectory();
    final file = File('${dir.path}/brand-logo-${board.session?.teacherId ?? 'board'}');
    await file.writeAsBytes(b, flush: true);
    board.setSbPref('logoPath', file.path);
    if (mounted) setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final s = SbStrings.of(context);
    final board = widget.board;
    final preview = _preview;
    final logo = board?.sbPref('logoPath');
    return Column(
      key: const Key('theme-custom'),
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        if (preview == null)
          FilledButton.tonalIcon(
            key: const Key('bg-picture'),
            onPressed: _pickBackground,
            icon: const Icon(Icons.add_photo_alternate_outlined),
            label: const Text('JPG / PNG · 10 MB'),
          )
        else ...[
          Text(s('preview'), style: context.text.labelLarge),
          const SizedBox(height: Kx.s8),
          AspectRatio(
            aspectRatio: 16 / 9,
            child: ClipRRect(borderRadius: BorderRadius.circular(Kx.rMd), child: Image.memory(preview, key: const Key('custom-preview'), fit: BoxFit.contain)),
          ),
          const SizedBox(height: Kx.s8),
          Row(
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              TextButton(key: const Key('custom-cancel'), onPressed: () => setState(() => _preview = null), child: Text(s('cancel'))),
              const SizedBox(width: Kx.s8),
              FilledButton(
                key: const Key('custom-apply'),
                onPressed: () {
                  widget.onApply(preview);
                  setState(() => _preview = null);
                },
                child: Text(s('apply')),
              ),
            ],
          ),
        ],
        if (board != null) ...[
          const Divider(height: Kx.s24),
          Text(s('branding'), style: context.text.titleSmall),
          Text(s('brandingHint'), style: context.text.bodySmall),
          const SizedBox(height: Kx.s8),
          TextField(
            key: const Key('brand-name'),
            controller: _brand,
            decoration: InputDecoration(labelText: s('brandName'), hintText: board.session?.institutionName),
            onChanged: (v) => board.setSbPref('brand', v.trim().isEmpty ? null : v.trim()),
          ),
          const SizedBox(height: Kx.s8),
          TextField(
            key: const Key('brand-watermark'),
            controller: _mark,
            decoration: InputDecoration(labelText: s('watermark')),
            onChanged: (v) => board.setSbPref('watermark', v.trim().isEmpty ? null : v.trim()),
          ),
          const SizedBox(height: Kx.s8),
          Row(
            children: [
              if (logo != null && File(logo).existsSync())
                Padding(padding: const EdgeInsets.only(right: Kx.s8), child: Image.file(File(logo), key: const Key('brand-logo'), height: 40)),
              OutlinedButton.icon(key: const Key('brand-logo-pick'), onPressed: _pickLogo, icon: const Icon(Icons.image_outlined), label: Text(s('chooseLogo'))),
              if (logo != null)
                TextButton(key: const Key('brand-logo-remove'), onPressed: () => setState(() => board.setSbPref('logoPath', null)), child: Text(s('removeLogo'))),
            ],
          ),
        ],
      ],
    );
  }
}

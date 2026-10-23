import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../../core/cast/cast_controller.dart';
import '../../l10n/feature_strings.dart';
import '../../l10n/l10n.dart';
import '../board/chrome.dart' show showBoardMessage;
import '../doc_camera/doc_camera.dart' show composeDocCameraShot, paintMarks;
import '../insert/insert_actions.dart' show placePicture;

/// The cast panel's words.
FeatureStrings castStrings(String lang) => FeatureStrings(lang, castStringTable);

const castStringTable = <String, Map<String, String>>{
  'en': {
    'tab': 'Cast',
    'title': 'Screens on the board',
    'wants': '{name} wants to show their screen',
    'allow': 'Allow',
    'decline': 'Decline',
    'connecting': 'Connecting…',
    'stop': 'Stop',
    'fill': 'Fill the panel',
    'sideBySide': 'Side by side',
    'annotate': 'Draw on it',
    'clear': 'Clear marks',
    'toBoard': 'Add to board',
    'added': 'The screen is on the board',
    'failed': 'Could not take the picture',
    'empty': 'Nothing is being shared.',
    'how': 'A teacher or student opens the Zynetix Teacher or Student App and chooses “Share screen to the board”, or any phone or laptop scans the code below. You approve each screen here, and you can stop any of them.',
    'limit': 'Up to 9 screens at once.',
    'you': 'Teacher',
  },
  'hi': {
    'tab': 'कास्ट',
    'title': 'बोर्ड पर स्क्रीन',
    'wants': '{name} अपनी स्क्रीन दिखाना चाहते हैं',
    'allow': 'अनुमति दें',
    'decline': 'अस्वीकार करें',
    'connecting': 'जुड़ रहे हैं…',
    'stop': 'रोकें',
    'fill': 'पैनल भर दें',
    'sideBySide': 'साथ-साथ',
    'annotate': 'इस पर लिखें',
    'clear': 'निशान मिटाएँ',
    'toBoard': 'बोर्ड पर जोड़ें',
    'added': 'स्क्रीन बोर्ड पर है',
    'failed': 'चित्र नहीं लिया जा सका',
    'empty': 'कुछ भी साझा नहीं हो रहा।',
    'how': 'शिक्षक या छात्र Zynetix शिक्षक या छात्र ऐप खोलकर “स्क्रीन बोर्ड पर दिखाएँ” चुनते हैं, या कोई भी फ़ोन या लैपटॉप नीचे दिया कोड स्कैन करता है। हर स्क्रीन की अनुमति आप यहाँ देते हैं और किसी को भी रोक सकते हैं।',
    'limit': 'एक साथ 9 स्क्रीन तक।',
    'you': 'शिक्षक',
  },
  'kn': {
    'tab': 'ಕಾಸ್ಟ್',
    'title': 'ಬೋರ್ಡ್‌ನಲ್ಲಿ ಪರದೆಗಳು',
    'wants': '{name} ತಮ್ಮ ಪರದೆಯನ್ನು ತೋರಿಸಲು ಬಯಸುತ್ತಾರೆ',
    'allow': 'ಅನುಮತಿಸಿ',
    'decline': 'ನಿರಾಕರಿಸಿ',
    'connecting': 'ಸಂಪರ್ಕಿಸುತ್ತಿದೆ…',
    'stop': 'ನಿಲ್ಲಿಸಿ',
    'fill': 'ಪ್ಯಾನೆಲ್ ತುಂಬಿಸಿ',
    'sideBySide': 'ಅಕ್ಕಪಕ್ಕ',
    'annotate': 'ಇದರ ಮೇಲೆ ಬರೆಯಿರಿ',
    'clear': 'ಗುರುತುಗಳನ್ನು ಅಳಿಸಿ',
    'toBoard': 'ಬೋರ್ಡ್‌ಗೆ ಸೇರಿಸಿ',
    'added': 'ಪರದೆ ಬೋರ್ಡ್‌ನಲ್ಲಿದೆ',
    'failed': 'ಚಿತ್ರ ತೆಗೆಯಲಾಗಲಿಲ್ಲ',
    'empty': 'ಏನನ್ನೂ ಹಂಚಿಕೊಳ್ಳುತ್ತಿಲ್ಲ.',
    'how': 'ಶಿಕ್ಷಕರು ಅಥವಾ ವಿದ್ಯಾರ್ಥಿ Zynetix ಶಿಕ್ಷಕ ಅಥವಾ ವಿದ್ಯಾರ್ಥಿ ಆ್ಯಪ್ ತೆರೆದು “ಪರದೆಯನ್ನು ಬೋರ್ಡ್‌ಗೆ ಹಂಚಿಕೊಳ್ಳಿ” ಆರಿಸುತ್ತಾರೆ, ಅಥವಾ ಯಾವುದೇ ಫೋನ್ ಅಥವಾ ಲ್ಯಾಪ್‌ಟಾಪ್ ಕೆಳಗಿನ ಕೋಡ್ ಸ್ಕ್ಯಾನ್ ಮಾಡುತ್ತದೆ. ಪ್ರತಿ ಪರದೆಗೆ ನೀವು ಇಲ್ಲಿ ಅನುಮತಿ ನೀಡುತ್ತೀರಿ ಮತ್ತು ಯಾವುದನ್ನೂ ನಿಲ್ಲಿಸಬಹುದು.',
    'limit': 'ಒಮ್ಮೆಗೆ 9 ಪರದೆಗಳವರೆಗೆ.',
    'you': 'ಶಿಕ್ಷಕ',
  },
};

/// The split panel's Cast tab: who is asking to cast, the join code (QR) for any phone or laptop,
/// and the screens on the board in a grid of 1, 2, 4, 6 or 9, one presenting or filling the panel,
/// each with marks drawn over it, Pause, "Add to board" and Remove.
class CastPanel extends StatelessWidget {
  const CastPanel({super.key, required this.cast, required this.wb});

  final CastController cast;
  final WhiteboardController wb;

  @override
  Widget build(BuildContext context) {
    final s = castStrings(boardLang(context));
    return ListenableBuilder(
      listenable: cast,
      builder: (context, _) {
        final shown = cast.shown;
        return Column(
          key: const Key('cast-panel'),
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            for (final t in cast.pending) _Request(tile: t, cast: cast, s: s),
            if (shown.isNotEmpty) _Toolbar(cast: cast),
            Expanded(
              child: shown.isEmpty
                  ? Center(
                      child: SingleChildScrollView(
                        padding: const EdgeInsets.all(Kx.s24),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(Icons.cast_connected, size: 56, color: context.colors.onSurfaceVariant),
                            const SizedBox(height: Kx.s12),
                            Text(s['empty'], key: const Key('cast-empty'), style: context.text.titleMedium),
                            const SizedBox(height: Kx.s8),
                            Text(s['how'], textAlign: TextAlign.center),
                            const SizedBox(height: Kx.s8),
                            Text(s['limit'], style: context.text.bodySmall),
                            if (cast.fetchJoinCode != null) ...[const SizedBox(height: Kx.s16), CastJoinCard(cast: cast)],
                          ],
                        ),
                      ),
                    )
                  : _Grid(cast: cast, wb: wb, tiles: shown, s: s),
            ),
          ],
        );
      },
    );
  }
}

class _Request extends StatelessWidget {
  const _Request({required this.tile, required this.cast, required this.s});

  final CastTile tile;
  final CastController cast;
  final FeatureStrings s;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Card(
      key: Key('cast-request-${tile.id}'),
      color: c.primaryContainer,
      margin: const EdgeInsets.all(Kx.s8),
      child: Padding(
        padding: const EdgeInsets.all(Kx.s12),
        child: Row(
          children: [
            Icon(Icons.screen_share_outlined, color: c.onPrimaryContainer),
            const SizedBox(width: Kx.s12),
            Expanded(child: Text(s['wants'].replaceAll('{name}', tile.name), style: context.text.titleSmall?.copyWith(color: c.onPrimaryContainer))),
            TextButton(key: Key('cast-decline-${tile.id}'), onPressed: () => unawaited(cast.decline(tile.id)), child: Text(s['decline'])),
            const SizedBox(width: Kx.s8),
            FilledButton(key: Key('cast-allow-${tile.id}'), onPressed: () => unawaited(cast.approve(tile.id)), child: Text(s['allow'])),
          ],
        ),
      ),
    );
  }
}

class _Grid extends StatelessWidget {
  const _Grid({required this.cast, required this.wb, required this.tiles, required this.s});

  final CastController cast;
  final WhiteboardController wb;
  final List<CastTile> tiles;
  final FeatureStrings s;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, box) {
        final n = tiles.length;
        const gap = Kx.s8;
        Widget view(CastTile t) => _CastTileView(key: ValueKey(t.id), tile: t, cast: cast, wb: wb, s: s, single: n == 1);
        final more = cast.hidden;
        final moreChip = more > 0
            ? Positioned(right: gap * 2, bottom: gap * 2, child: Chip(key: const Key('cast-more'), label: Text(context.l10n.castMore(more))))
            : null;
        // A presenter in the automatic layout: large on the left, the others in a column beside it.
        if (cast.layout == CastLayout.auto && n > 1 && tiles.first.id == cast.presenterId && box.maxWidth >= 640) {
          final side = (box.maxWidth - gap * 3) * 0.28;
          final rest = tiles.skip(1).toList();
          final h = (box.maxHeight - gap * (rest.length + 1)) / rest.length;
          return Stack(
            children: [
              Padding(
                padding: const EdgeInsets.all(gap),
                child: Row(
                  key: const Key('cast-spotlight'),
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Expanded(child: view(tiles.first)),
                    const SizedBox(width: gap),
                    SizedBox(
                      width: side,
                      child: Column(children: [for (final (i, t) in rest.indexed) ...[if (i > 0) const SizedBox(height: gap), SizedBox(height: math.max(60, h), child: view(t))]]),
                    ),
                  ],
                ),
              ),
              ?moreChip,
            ],
          );
        }
        // One fills the panel; otherwise the layout's grid (two side by side when there is room, else stacked).
        final g = castGrid(cast.layout, n, wide: box.maxWidth >= 640);
        final cols = n == 1 ? 1 : g.cols;
        final rows = n == 1 ? 1 : math.max(1, math.min(g.rows, (n / cols).ceil()));
        final w = (box.maxWidth - gap * (cols + 1)) / cols;
        final h = (box.maxHeight - gap * (rows + 1)) / rows;
        return Stack(
          children: [
            Padding(
              padding: const EdgeInsets.all(gap),
              child: Wrap(
                key: Key('cast-grid-$cols-$rows'),
                spacing: gap,
                runSpacing: gap,
                children: [for (final t in tiles) SizedBox(width: math.max(80, w), height: math.max(60, h), child: view(t))],
              ),
            ),
            ?moreChip,
          ],
        );
      },
    );
  }
}

class _CastTileView extends StatefulWidget {
  const _CastTileView({super.key, required this.tile, required this.cast, required this.wb, required this.s, required this.single});

  final CastTile tile;
  final CastController cast;
  final WhiteboardController wb;
  final FeatureStrings s;
  final bool single;

  @override
  State<_CastTileView> createState() => _CastTileViewState();
}

class _CastTileViewState extends State<_CastTileView> {
  Color _pen = const Color(0xFFE53935);
  Size _size = Size.zero;
  bool _busy = false;

  Future<void> _toBoard() async {
    if (_busy) return;
    _busy = true;
    final s = widget.s;
    try {
      final shot = await widget.tile.receiver?.snapshot();
      if (shot == null) throw StateError('no picture');
      final view = _size.isEmpty ? const Size(1280, 720) : _size;
      final png = await composeDocCameraShot(shot, view: view, quarterTurns: 0, zoom: 1, strokes: widget.tile.strokes);
      placePicture(widget.wb, png, Size(view.width * 2, view.height * 2), maxWidth: 720);
      if (mounted) showBoardMessage(context, s['added']);
    } catch (e) {
      debugPrint('Cast snapshot: $e');
      if (mounted) showBoardMessage(context, s['failed']);
    } finally {
      _busy = false;
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = widget.tile, s = widget.s, cast = widget.cast;
    final c = context.colors;
    final live = t.state == CastTileState.live;
    return ClipRRect(
      borderRadius: BorderRadius.circular(Kx.s12),
      child: ColoredBox(
        color: Colors.black,
        child: Stack(
          fit: StackFit.expand,
          children: [
            LayoutBuilder(
              builder: (context, box) {
                _size = box.biggest;
                if (t.muted) {
                  return Center(
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(Icons.pause_circle_outline, color: Colors.white70),
                        const SizedBox(width: Kx.s8),
                        Text(context.l10n.castPaused, key: Key('cast-paused-${t.id}'), style: const TextStyle(color: Colors.white70)),
                      ],
                    ),
                  );
                }
                final video = t.receiver?.view();
                return video ?? const SizedBox.expand();
              },
            ),
            IgnorePointer(
              ignoring: !t.annotate,
              child: GestureDetector(
                key: Key('cast-ink-${t.id}'),
                behavior: HitTestBehavior.opaque,
                onPanStart: (d) => cast.addStroke(t.id, _pen, d.localPosition),
                onPanUpdate: (d) => cast.extendStroke(t.id, d.localPosition),
                child: CustomPaint(painter: _Marks(t.strokes), size: Size.infinite),
              ),
            ),
            // The source's orientation, following the phone as it turns.
            if (t.receiver case final r?)
              Positioned(
                right: Kx.s8,
                top: Kx.s8,
                child: ValueListenableBuilder<Size?>(
                  valueListenable: r.frameSize,
                  builder: (context, size, _) => size == null
                      ? const SizedBox.shrink()
                      : Icon(
                          size.height > size.width ? Icons.stay_current_portrait : Icons.stay_current_landscape,
                          key: Key('cast-orientation-${t.id}-${size.height > size.width ? 'portrait' : 'landscape'}'),
                          color: Colors.white70,
                        ),
                ),
              ),
            Positioned(
              left: Kx.s8,
              top: Kx.s8,
              child: Chip(
                avatar: Icon(t.teacher ? Icons.school_outlined : (t.guest ? Icons.devices_other_outlined : Icons.person_outline), size: 16),
                label: Text([t.name, if (cast.presenterId == t.id) context.l10n.castPresenter, if (!live) s['connecting']].join(' · ')),
                visualDensity: VisualDensity.compact,
              ),
            ),
            Positioned(
              left: Kx.s8,
              right: Kx.s8,
              bottom: Kx.s8,
              child: Wrap(
                alignment: WrapAlignment.end,
                spacing: Kx.s4,
                runSpacing: Kx.s4,
                children: [
                  if (t.annotate)
                    for (final col in const [Color(0xFFE53935), Color(0xFF1E88E5), Color(0xFFFDD835), Color(0xFFFFFFFF)])
                      InkWell(
                        onTap: () => setState(() => _pen = col),
                        customBorder: const CircleBorder(),
                        child: Container(width: 30, height: 30, decoration: BoxDecoration(color: col, shape: BoxShape.circle, border: Border.all(color: _pen == col ? c.primary : Colors.white54, width: 3))),
                      ),
                  if (t.strokes.isNotEmpty) IconButton.filledTonal(key: Key('cast-clear-${t.id}'), tooltip: s['clear'], onPressed: () => cast.clearMarks(t.id), icon: const Icon(Icons.layers_clear_outlined)),
                  IconButton.filledTonal(key: Key('cast-annotate-${t.id}'), tooltip: s['annotate'], isSelected: t.annotate, onPressed: live ? () => cast.toggleAnnotate(t.id) : null, icon: const Icon(Icons.edit_outlined), selectedIcon: const Icon(Icons.edit)),
                  IconButton.filledTonal(key: Key('cast-board-${t.id}'), tooltip: s['toBoard'], onPressed: live && !t.muted ? _toBoard : null, icon: const Icon(Icons.add_photo_alternate_outlined)),
                  IconButton.filledTonal(
                    key: Key('cast-present-${t.id}'),
                    tooltip: context.l10n.castPresent,
                    isSelected: cast.presenterId == t.id,
                    onPressed: () => cast.promote(t.id),
                    icon: const Icon(Icons.star_outline),
                    selectedIcon: const Icon(Icons.star),
                  ),
                  IconButton.filledTonal(
                    key: Key('cast-mute-${t.id}'),
                    tooltip: t.muted ? context.l10n.castUnmute : context.l10n.castMute,
                    isSelected: t.muted,
                    onPressed: () => cast.toggleMute(t.id),
                    icon: const Icon(Icons.pause_outlined),
                    selectedIcon: const Icon(Icons.play_arrow),
                  ),
                  IconButton.filledTonal(
                    key: Key('cast-fill-${t.id}'),
                    tooltip: widget.single && cast.focusedId == t.id ? s['sideBySide'] : s['fill'],
                    onPressed: () => cast.focus(t.id),
                    icon: Icon(cast.focusedId == t.id ? Icons.grid_view_outlined : Icons.fit_screen_outlined),
                  ),
                  IconButton.filled(key: Key('cast-stop-${t.id}'), tooltip: context.l10n.castRemove, style: IconButton.styleFrom(backgroundColor: c.error, foregroundColor: c.onError), onPressed: () => unawaited(cast.stop(t.id)), icon: const Icon(Icons.stop_screen_share_outlined)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Marks extends CustomPainter {
  _Marks(this.strokes);
  final List<(Color, List<Offset>)> strokes;

  @override
  void paint(Canvas canvas, Size size) => paintMarks(canvas, strokes);

  @override
  bool shouldRepaint(_Marks old) => true;
}

/// Above the screens: the layout (Auto, 1, 2, 4, 6, 9) and the join code.
class _Toolbar extends StatelessWidget {
  const _Toolbar({required this.cast});
  final CastController cast;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return Padding(
      padding: const EdgeInsets.fromLTRB(Kx.s8, Kx.s8, Kx.s8, 0),
      child: Wrap(
        spacing: Kx.s8,
        runSpacing: Kx.s4,
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          Text(l.castLayout, style: context.text.labelLarge),
          for (final layout in CastLayout.values)
            ChoiceChip(
              key: Key('cast-layout-${layout.name}'),
              label: Text(layout == CastLayout.auto ? l.castLayoutAuto : '${layout.capacity}'),
              selected: cast.layout == layout,
              onSelected: (_) => cast.setLayout(layout),
            ),
          if (cast.fetchJoinCode != null)
            TextButton.icon(
              key: const Key('cast-join-button'),
              onPressed: () => showDialog<void>(
                context: context,
                builder: (_) => AlertDialog(
                  content: SizedBox(width: 420, child: CastJoinCard(cast: cast)),
                  actions: [TextButton(onPressed: () => Navigator.of(context).pop(), child: Text(MaterialLocalizations.of(context).closeButtonLabel))],
                ),
              ),
              icon: const Icon(Icons.qr_code_2),
              label: Text(l.castJoinButton),
            ),
        ],
      ),
    );
  }
}

/// The join code and its QR: any phone or laptop opens the browser /cast page, no app or account.
class CastJoinCard extends StatefulWidget {
  const CastJoinCard({super.key, required this.cast});
  final CastController cast;

  @override
  State<CastJoinCard> createState() => _CastJoinCardState();
}

class _CastJoinCardState extends State<CastJoinCard> {
  CastJoinInfo? _info;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  Future<void> _load({bool fresh = false}) async {
    setState(() => _loading = true);
    CastJoinInfo? info;
    try {
      info = await widget.cast.fetchJoinCode?.call(fresh: fresh);
    } catch (e) {
      debugPrint('Cast join code: $e');
    }
    if (!mounted) return;
    setState(() {
      _info = info;
      _loading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final info = _info;
    if (_loading) return const Padding(padding: EdgeInsets.all(Kx.s16), child: Center(child: CircularProgressIndicator()));
    if (info == null) return Text(l.castJoinUnavailable, key: const Key('cast-join-unavailable'), textAlign: TextAlign.center);
    final page = Uri.tryParse(info.url)?.replace(query: '').toString().replaceAll(RegExp(r'\?$'), '') ?? info.url;
    return Card(
      key: const Key('cast-join'),
      child: Padding(
        padding: const EdgeInsets.all(Kx.s16),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(color: Colors.white, padding: const EdgeInsets.all(6), child: QrImageView(data: info.url, size: 140)),
            const SizedBox(width: Kx.s16),
            Flexible(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(l.castJoinTitle, style: context.text.titleSmall),
                  const SizedBox(height: Kx.s8),
                  SelectableText(info.code, key: const Key('cast-join-code'), style: context.text.headlineMedium?.copyWith(letterSpacing: 6, fontWeight: FontWeight.w700)),
                  const SizedBox(height: Kx.s8),
                  Text(l.castJoinHow(page), style: context.text.bodySmall),
                  const SizedBox(height: Kx.s8),
                  TextButton.icon(key: const Key('cast-join-new'), onPressed: () => unawaited(_load(fresh: true)), icon: const Icon(Icons.refresh), label: Text(l.castNewCode)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

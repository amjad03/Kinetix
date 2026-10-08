import 'dart:async';
import 'dart:io';
import 'dart:math' as math;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';
import 'package:path_provider/path_provider.dart';

import '../board/chrome.dart';
import 'document_import.dart';

/// Opens a .pptx in the panel's presenter app (animations, transitions and media as authored).
/// Returns false when there is none. Tests replace it.
Future<bool> Function(String name, Uint8List bytes) openInPresenter = _openInPresenter;

Future<bool> _openInPresenter(String name, Uint8List bytes) async {
  if (kIsWeb) return false;
  final dir = Directory('${(await getTemporaryDirectory()).path}/presentations');
  await dir.create(recursive: true);
  final safe = name.replaceAll(RegExp(r'[^\w.\- ]'), '_');
  final file = File('${dir.path}/$safe');
  await file.writeAsBytes(bytes, flush: true);
  if (Platform.isAndroid) {
    return await const MethodChannel('kinetix/presenter').invokeMethod<bool>('open', {'path': file.path, 'adjacent': true}) ?? false;
  }
  if (Platform.isWindows) {
    final r = await Process.run('cmd', ['/c', 'start', '', file.path]);
    return r.exitCode == 0;
  }
  return false;
}

/// The board screen that shows presentations beside the writing (set while it is open); when
/// unset, an imported deck becomes board pages as before.
ValueChanged<Presentation>? presentationHost;

/// An open presentation beside the teacher's writing (spec §28).
class Presentation extends ChangeNotifier {
  Presentation({required this.name, required this.bytes, required this.pages, required this.left});

  final String name;
  final Uint8List bytes;

  /// Each slide rendered for the board (also what Add Page puts on a board page).
  final List<ImportedPage> pages;

  /// Which side of the board the slides are on.
  bool left;
  int index = 0;

  /// The slides' share of the board's width (the divider drags it, 25–75 %).
  double fraction = 0.5;

  /// Edge-to-Edge: the slides fill the board.
  bool edgeToEdge = false;

  void go(int i) {
    index = i.clamp(0, pages.length - 1);
    notifyListeners();
  }

  void setFraction(double f) {
    fraction = f.clamp(0.25, 0.75);
    notifyListeners();
  }

  void toggleEdge() {
    edgeToEdge = !edgeToEdge;
    notifyListeners();
  }
}

/// The intelligent split (spec §28): writing on the right and an empty left → slides on the left;
/// writing on the left and an empty right → on the right; otherwise the default (left).
bool presentationGoesLeft(List<BoardElement> elements, {double width = 1920}) {
  final ink = [for (final e in elements) if (!(e is ImageElement && e.backdrop)) e.bounds];
  final half = width / 2;
  final onLeft = ink.any((b) => b.left < half);
  final onRight = ink.any((b) => b.right > half);
  if (onLeft && !onRight) return false;
  return true;
}

/// The slides pane: the slide, previous/next, Add Page, Add All Pages, Edge-to-Edge, Present
/// (in the presenter app) and Close. Its inner edge is the draggable divider.
class PresentationPane extends StatelessWidget {
  const PresentationPane({super.key, required this.p, required this.wb, required this.width, required this.onClose, required this.labels});

  final Presentation p;
  final WhiteboardController wb;

  /// The board area's width (the divider's drag is a share of it).
  final double width;
  final VoidCallback onClose;
  final PresentationLabels labels;

  List<BoardElement> _pageFor(ImportedPage page) => backdropPages([page]).single;

  void _addPage(BuildContext context) {
    wb.addPages([_pageFor(p.pages[p.index])]);
    showBoardMessage(context, labels.added(1));
  }

  void _addAll(BuildContext context) {
    wb.addPages([for (final page in p.pages) _pageFor(page)]);
    showBoardMessage(context, labels.added(p.pages.length));
  }

  Future<void> _present(BuildContext context) async {
    var ok = false;
    try {
      ok = await openInPresenter(p.name, p.bytes);
    } catch (e) {
      debugPrint('Presenter: $e');
    }
    if (!ok && context.mounted) showBoardMessage(context, labels.noPresenter);
  }

  @override
  Widget build(BuildContext context) {
    final page = p.pages[p.index];
    Widget btn(String key, IconData icon, String tip, VoidCallback? onTap) =>
        IconButton(key: Key(key), tooltip: tip, onPressed: onTap, icon: Icon(icon), iconSize: 28, style: IconButton.styleFrom(minimumSize: const Size(52, 52)));
    final bar = Wrap(
      alignment: WrapAlignment.center,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        btn('ppt-prev', Icons.chevron_left, labels.previous, p.index > 0 ? () => p.go(p.index - 1) : null),
        Text('${p.index + 1}/${p.pages.length}', key: const Key('ppt-index'), style: context.text.titleMedium),
        btn('ppt-next', Icons.chevron_right, labels.next, p.index < p.pages.length - 1 ? () => p.go(p.index + 1) : null),
        btn('ppt-add-page', Icons.note_add_outlined, labels.addPage, () => _addPage(context)),
        btn('ppt-add-all', Icons.library_add_outlined, labels.addAll, () => _addAll(context)),
        btn('ppt-edge', p.edgeToEdge ? Icons.fullscreen_exit : Icons.fullscreen, labels.edgeToEdge, p.toggleEdge),
        btn('ppt-present', Icons.slideshow_outlined, labels.present, () => unawaited(_present(context))),
        btn('ppt-close', Icons.close, labels.close, onClose),
      ],
    );
    final slide = ColoredBox(
      color: Colors.black,
      child: Column(
        children: [
          Expanded(
            child: GestureDetector(
              // Swipe to change slides, as on a phone.
              onHorizontalDragEnd: (d) {
                final v = d.primaryVelocity ?? 0;
                if (v < -200) p.go(p.index + 1);
                if (v > 200) p.go(p.index - 1);
              },
              child: Center(child: Image.memory(page.png, key: ValueKey('ppt-slide-${p.index}'), fit: BoxFit.contain, gaplessPlayback: true)),
            ),
          ),
          ColoredBox(color: context.colors.surface, child: SizedBox(width: double.infinity, child: bar)),
        ],
      ),
    );
    if (p.edgeToEdge) return slide;
    final divider = GestureDetector(
      key: const Key('ppt-divider'),
      behavior: HitTestBehavior.opaque,
      onHorizontalDragUpdate: (d) => p.setFraction(p.fraction + (p.left ? d.delta.dx : -d.delta.dx) / math.max(1, width)),
      child: Container(
        width: 20,
        color: context.colors.surfaceContainerHighest,
        child: Center(child: Container(width: 4, height: 64, decoration: BoxDecoration(color: context.colors.outline, borderRadius: BorderRadius.circular(2)))),
      ),
    );
    return Row(children: p.left ? [Expanded(child: slide), divider] : [divider, Expanded(child: slide)]);
  }
}

/// The pane's words in the board's language.
class PresentationLabels {
  const PresentationLabels({
    required this.previous,
    required this.next,
    required this.addPage,
    required this.addAll,
    required this.edgeToEdge,
    required this.present,
    required this.close,
    required this.noPresenter,
    required this.added,
  });

  final String previous, next, addPage, addAll, edgeToEdge, present, close, noPresenter;
  final String Function(int) added;
}

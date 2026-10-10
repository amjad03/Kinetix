import 'dart:async';
import 'dart:io';

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
  Presentation({required this.name, required this.bytes, required this.pages, required this.left, this.isPdf = false});

  /// A PDF opens in the same split pane; it has no presenter app, only pages to add.
  final bool isPdf;

  /// Pages ticked to add to the whiteboard (0-based).
  final Set<int> selected = {};

  void toggleSelected(int i) {
    if (!selected.remove(i)) selected.add(i);
    notifyListeners();
  }

  void clearSelected() {
    selected.clear();
    notifyListeners();
  }

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

/// The deck drawer's body (a PDF or PPT in the right-hand drawer): the open page large, then a
/// thumbnail for every page with a tick and its own "Add page", and Add selected / Add all.
class PresentationPane extends StatelessWidget {
  const PresentationPane({super.key, required this.p, required this.wb, required this.onClose, required this.labels});

  final Presentation p;
  final WhiteboardController wb;
  final VoidCallback onClose;
  final PresentationLabels labels;

  List<BoardElement> _pageFor(ImportedPage page) => backdropPages([page]).single;

  void _addIndexes(BuildContext context, List<int> picks) {
    if (picks.isEmpty) return;
    wb.addPages([for (final i in picks) _pageFor(p.pages[i])]);
    showBoardMessage(context, labels.added(picks.length));
  }

  void _addSelected(BuildContext context) {
    _addIndexes(context, p.selected.toList()..sort());
    p.clearSelected();
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
    final c = context.colors;
    final page = p.pages[p.index];
    Widget btn(String key, IconData icon, String tip, VoidCallback? onTap) =>
        IconButton(key: Key(key), tooltip: tip, onPressed: onTap, icon: Icon(icon), iconSize: 26, style: IconButton.styleFrom(minimumSize: const Size(48, 48)));
    final bar = Wrap(
      alignment: WrapAlignment.center,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        btn('ppt-prev', Icons.chevron_left, labels.previous, p.index > 0 ? () => p.go(p.index - 1) : null),
        Text('${p.index + 1}/${p.pages.length}', key: const Key('ppt-index'), style: context.text.titleMedium),
        btn('ppt-next', Icons.chevron_right, labels.next, p.index < p.pages.length - 1 ? () => p.go(p.index + 1) : null),
        btn('ppt-add-page', Icons.note_add_outlined, labels.addPage, () => _addIndexes(context, [p.index])),
        btn('ppt-add-all', Icons.library_add_outlined, labels.addAll, () => _addIndexes(context, [for (var i = 0; i < p.pages.length; i++) i])),
        TextButton.icon(
          key: const Key('ppt-add-selected'),
          onPressed: p.selected.isEmpty ? null : () => _addSelected(context),
          icon: const Icon(Icons.playlist_add_check),
          label: Text(labels.addSelected(p.selected.length)),
        ),
        if (!p.isPdf) btn('ppt-present', Icons.slideshow_outlined, labels.present, () => unawaited(_present(context))),
        btn('ppt-close', Icons.close, labels.close, onClose),
      ],
    );
    final big = ColoredBox(
      color: c.surfaceContainerHighest,
      child: GestureDetector(
        // Swipe to change page, as on a phone.
        onHorizontalDragEnd: (d) {
          final v = d.primaryVelocity ?? 0;
          if (v < -200) p.go(p.index + 1);
          if (v > 200) p.go(p.index - 1);
        },
        child: Center(child: Image.memory(page.png, key: ValueKey('ppt-slide-${p.index}'), fit: BoxFit.contain, gaplessPlayback: true)),
      ),
    );
    final thumbs = GridView.builder(
      key: const Key('ppt-thumbs'),
      padding: const EdgeInsets.all(8),
      gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(maxCrossAxisExtent: 150, mainAxisSpacing: 8, crossAxisSpacing: 8, childAspectRatio: 0.9),
      itemCount: p.pages.length,
      itemBuilder: (_, i) {
        final on = p.selected.contains(i);
        return DecoratedBox(
          decoration: BoxDecoration(
            color: c.surfaceContainerLow,
            border: Border.all(color: i == p.index ? c.primary : c.outlineVariant, width: i == p.index ? 2 : 1),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Column(
            children: [
              Expanded(
                child: InkWell(
                  key: Key('ppt-thumb-$i'),
                  onTap: () => p.go(i),
                  child: Padding(padding: const EdgeInsets.all(4), child: Image.memory(p.pages[i].png, fit: BoxFit.contain, gaplessPlayback: true)),
                ),
              ),
              Row(
                children: [
                  Checkbox(key: Key('ppt-chip-$i'), value: on, visualDensity: VisualDensity.compact, onChanged: (_) => p.toggleSelected(i)),
                  Text('${i + 1}', style: context.text.labelMedium),
                  const Spacer(),
                  IconButton(
                    key: Key('ppt-add-$i'),
                    tooltip: labels.addPage,
                    visualDensity: VisualDensity.compact,
                    onPressed: () => _addIndexes(context, [i]),
                    icon: const Icon(Icons.add_circle_outline, size: 22),
                  ),
                ],
              ),
            ],
          ),
        );
      },
    );
    return ColoredBox(
      key: const Key('presentation'),
      color: c.surface,
      child: Column(
        children: [
          Expanded(flex: 5, child: big),
          bar,
          const Divider(height: 1),
          Expanded(flex: 4, child: thumbs),
        ],
      ),
    );
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
    required this.addSelected,
  });

  final String previous, next, addPage, addAll, edgeToEdge, present, close, noPresenter;
  final String Function(int) added;

  /// The "add the ticked pages" button, given how many are ticked.
  final String Function(int) addSelected;
}

import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../class_tools/tool_ui.dart';
import '../classroom_hooks.dart';
import '../ui/ce_style.dart';
import 'exam_timer.dart';
import 'page_cache.dart';
import 'paper_library.dart';
import 'paper_model.dart';

/// Opens [paper] full screen on the board ([showKey]: with its answer key beside it).
/// [host] puts a page on the board (null: no Put on board, e.g. from Settings).
Future<void> openPaperViewer(BuildContext context, {required PaperLibrary lib, required Paper paper, ClassroomHost? host, bool showKey = false}) =>
    Navigator.of(context, rootNavigator: true).push(
      PageRouteBuilder<void>(
        pageBuilder: (_, _, _) => PaperViewerScreen(lib: lib, paper: paper, host: host, showKey: showKey),
        transitionsBuilder: (_, a, _, child) => FadeTransition(opacity: a, child: child),
      ),
    );

/// The full-screen paper viewer for the smartboard: big page arrows, pinch zoom, a page strip,
/// the answer key side by side or on top, the exam timer and Put page on board.
class PaperViewerScreen extends StatefulWidget {
  const PaperViewerScreen({super.key, required this.lib, required this.paper, this.host, this.showKey = false});

  final PaperLibrary lib;
  final Paper paper;
  final ClassroomHost? host;
  final bool showKey;

  @override
  State<PaperViewerScreen> createState() => _PaperViewerScreenState();
}

class _PaperViewerScreenState extends State<PaperViewerScreen> {
  Paper get paper => widget.paper;
  OpenPdf? pdf, key;
  bool loading = true, putting = false;
  int page = 0, keyPage = 0;
  late bool keyOn = widget.showKey && paper.hasKey;
  bool overlay = false;
  final zoom = TransformationController();
  final _paneKey = GlobalKey();
  final _strip = ScrollController();

  @override
  void initState() {
    super.initState();
    unawaited(_open());
    zoom.addListener(_zoomed);
  }

  void _zoomed() => setState(() {});

  Future<void> _open() async {
    final bytes = await widget.lib.paperPdf(paper);
    final doc = bytes == null ? null : await OpenPdf.open(bytes);
    if (!mounted) return unawaited(doc?.dispose());
    setState(() {
      pdf = doc;
      loading = false;
    });
    if (doc != null) unawaited(widget.lib.setPageCount(paper, doc.pageCount));
    if (keyOn) await _openKey();
  }

  Future<void> _openKey() async {
    if (key != null || !paper.hasKey) return;
    final bytes = await widget.lib.keyPdf(paper);
    final doc = bytes == null ? null : await OpenPdf.open(bytes);
    if (!mounted) return unawaited(doc?.dispose());
    setState(() => key = doc);
  }

  @override
  void dispose() {
    unawaited(pdf?.dispose());
    unawaited(key?.dispose());
    zoom.dispose();
    _strip.dispose();
    super.dispose();
  }

  int get pages => pdf?.pageCount ?? 0;
  bool get zoomedIn => zoom.value.getMaxScaleOnAxis() > 1.02;

  void _go(int p) {
    if (pdf == null) return;
    final to = p.clamp(0, pages - 1);
    if (to == page) return;
    setState(() {
      page = to;
      zoom.value = Matrix4.identity();
    });
    if (_strip.hasClients) {
      unawaited(_strip.animateTo((to * 96.0 - 300).clamp(0, _strip.position.maxScrollExtent), duration: const Duration(milliseconds: 250), curve: Curves.easeOut));
    }
  }

  void _toggleKey() {
    setState(() => keyOn = !keyOn);
    if (keyOn) unawaited(_openKey());
  }

  /// The part of the page in view when zoomed in (0…1 of the page), else null.
  Rect? _visibleCrop() {
    if (!zoomedIn || pdf == null) return null;
    final box = _paneKey.currentContext?.findRenderObject() as RenderBox?;
    if (box == null || !box.hasSize) return null;
    final size = box.size;
    final pageRect = _fit(size, pdf!.aspect(page));
    final inv = Matrix4.inverted(zoom.value);
    final tl = MatrixUtils.transformPoint(inv, Offset.zero), br = MatrixUtils.transformPoint(inv, Offset(size.width, size.height));
    final seen = Rect.fromPoints(tl, br).intersect(pageRect);
    if (seen.width <= 0 || seen.height <= 0) return null;
    return Rect.fromLTWH((seen.left - pageRect.left) / pageRect.width, (seen.top - pageRect.top) / pageRect.height, seen.width / pageRect.width, seen.height / pageRect.height);
  }

  Future<void> _put() async {
    final host = widget.host, doc = pdf;
    if (host == null || doc == null || putting) return;
    setState(() => putting = true);
    try {
      final crop = _visibleCrop();
      final png = await doc.png(page, width: 1800, crop: crop);
      if (png == null) throw const FormatException('the page could not be drawn');
      final s = doc.pageSize(page);
      final aspect = crop == null ? s.height / s.width : (crop.height * s.height) / (crop.width * s.width);
      // As big as fits under the title on a 1920 × 1080 board page.
      final w = math.min(1640.0, 880 / aspect);
      if (host.wb.elements.isNotEmpty) host.newPage();
      final title = crop == null ? '${paper.title} · page ${page + 1}' : '${paper.title} · part of page ${page + 1}';
      await host.putImage(png, width: w, title: title, at: Offset(math.max(60, (1920 - w) / 2), 40));
      host.showMessage(crop == null ? 'Page ${page + 1} is on the board' : 'That part of page ${page + 1} is on the board');
      if (mounted) Navigator.of(context).pop();
    } catch (e) {
      host.showMessage('Could not put the page on the board: $e');
      if (mounted) setState(() => putting = false);
    }
  }

  @override
  Widget build(BuildContext context) => Theme(
    data: ceTheme(context),
    child: CallbackShortcuts(
      bindings: {
        const SingleActivator(LogicalKeyboardKey.arrowRight): () => _go(page + 1),
        const SingleActivator(LogicalKeyboardKey.pageDown): () => _go(page + 1),
        const SingleActivator(LogicalKeyboardKey.arrowLeft): () => _go(page - 1),
        const SingleActivator(LogicalKeyboardKey.pageUp): () => _go(page - 1),
        const SingleActivator(LogicalKeyboardKey.escape): () => Navigator.of(context).maybePop(),
      },
      child: Focus(
        autofocus: true,
        child: Scaffold(
          key: const Key('ce-paper-viewer'),
          backgroundColor: const Color(0xFFE4E9F2),
          body: SafeArea(
            child: Column(
              children: [
                _bar(),
                Expanded(child: _body()),
                if (pages > 1) _pageStrip(),
              ],
            ),
          ),
        ),
      ),
    ),
  );

  Widget _bar() => Container(
    color: Colors.white,
    padding: const EdgeInsets.fromLTRB(20, 12, 20, 12),
    child: Row(
      children: [
        toolButton('Close', icon: Icons.close_rounded, key: const Key('ce-viewer-close'), onPressed: () => Navigator.of(context).pop()),
        const SizedBox(width: 20),
        Flexible(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(paper.longTitle, maxLines: 1, overflow: TextOverflow.ellipsis, style: ceHeading(26)),
              if (paper.source.isNotEmpty) Text('Source: ${paper.source}', maxLines: 1, overflow: TextOverflow.ellipsis, style: ceText(14)),
            ],
          ),
        ),
        const SizedBox(width: 16),
        if (pages > 0) toolPill('Page ${page + 1} of $pages', key: const Key('ce-viewer-page')),
        const Spacer(),
        toolButton(
          keyOn ? 'Hide answer key' : 'Show answer key',
          icon: Icons.key_outlined,
          key: const Key('ce-viewer-key'),
          onPressed: paper.hasKey ? _toggleKey : null,
        ),
        const SizedBox(width: 12),
        toolButton('Timer', icon: Icons.timer_outlined, key: const Key('ce-viewer-timer'), onPressed: () => openExamTimer(context, exam: paper.exam, title: paper.title)),
        if (widget.host != null) ...[
          const SizedBox(width: 12),
          toolButton(
            putting ? 'Putting…' : (zoomedIn ? 'Put this part on board' : 'Put page on board'),
            icon: Icons.move_to_inbox_outlined,
            filled: true,
            key: const Key('ce-viewer-put'),
            onPressed: pdf == null || putting ? null : _put,
          ),
        ],
      ],
    ),
  );

  Widget _body() {
    if (loading) return const Center(child: CircularProgressIndicator());
    final doc = pdf;
    if (doc == null || doc.pageCount == 0) {
      return const ToolEmpty(icon: Icons.broken_image_outlined, title: 'This paper cannot be opened', line: 'The file may be damaged. Remove it from the library and add it again from the USB stick.');
    }
    final paperPane = _Pane(
      key: const Key('ce-viewer-paper'),
      viewportKey: _paneKey,
      pdf: doc,
      page: page,
      zoom: zoom,
      onPrev: page > 0 ? () => _go(page - 1) : null,
      onNext: page < pages - 1 ? () => _go(page + 1) : null,
    );
    if (!keyOn) return paperPane;
    final keyPane = _keyPane();
    if (overlay) {
      return Stack(
        children: [
          Positioned.fill(child: paperPane),
          Positioned(
            right: 24,
            top: 16,
            bottom: 16,
            width: 620,
            child: Material(elevation: 12, color: Colors.white, borderRadius: BorderRadius.circular(24), clipBehavior: Clip.antiAlias, child: keyPane),
          ),
        ],
      );
    }
    return Row(
      children: [
        Expanded(child: paperPane),
        Container(width: 2, color: CeC.line),
        Expanded(child: ColoredBox(color: const Color(0xFFEFF6EE), child: keyPane)),
      ],
    );
  }

  Widget _keyPane() {
    final doc = key;
    return Column(
      key: const Key('ce-viewer-key-pane'),
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 12, 12, 4),
          child: Row(
            children: [
              ceIconDot(Icons.key_outlined, bg: CeC.mint, size: 40),
              const SizedBox(width: 12),
              Expanded(
                child: Text(doc == null ? 'Answer key' : 'Answer key · page ${keyPage + 1} of ${doc.pageCount}', maxLines: 1, overflow: TextOverflow.ellipsis, style: ceHeading(22)),
              ),
              choiceChip('Side by side', on: !overlay, offIcon: null, tick: false, key: const Key('ce-viewer-key-side'), onTap: () => setState(() => overlay = false)),
              const SizedBox(width: 8),
              choiceChip('On top', on: overlay, offIcon: null, tick: false, key: const Key('ce-viewer-key-overlay'), onTap: () => setState(() => overlay = true)),
            ],
          ),
        ),
        Expanded(
          child: doc == null
              ? const Center(child: CircularProgressIndicator())
              : _Pane(
                  pdf: doc,
                  page: keyPage,
                  small: true,
                  onPrev: keyPage > 0 ? () => setState(() => keyPage--) : null,
                  onNext: keyPage < doc.pageCount - 1 ? () => setState(() => keyPage++) : null,
                ),
        ),
      ],
    );
  }

  Widget _pageStrip() => Container(
    height: 132,
    color: Colors.white,
    child: ListView.builder(
      key: const Key('ce-viewer-strip'),
      controller: _strip,
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
      itemCount: pages,
      itemBuilder: (context, i) => Padding(
        padding: const EdgeInsets.only(right: 16),
        child: InkWell(
          key: Key('ce-viewer-thumb-$i'),
          borderRadius: BorderRadius.circular(8),
          onTap: () => _go(i),
          child: Column(
            children: [
              Container(
                width: 64,
                height: 86,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(6),
                  border: Border.all(color: i == page ? CeC.accent : Colors.transparent, width: 3),
                ),
                child: PdfPageImage(pdf: pdf!, page: i, thumb: true),
              ),
              const SizedBox(height: 4),
              Text('${i + 1}', style: ceText(14, w: i == page ? FontWeight.w700 : FontWeight.w400, c: i == page ? CeC.accent : CeC.muted)),
            ],
          ),
        ),
      ),
    ),
  );
}

/// The page's rectangle when it is fitted (whole) into [box] with a margin.
Rect _fit(Size box, double aspect, {double margin = 16}) {
  final w = math.max(1.0, box.width - margin * 2), h = math.max(1.0, box.height - margin * 2);
  final pw = math.min(w, h / aspect), ph = pw * aspect;
  return Rect.fromLTWH((box.width - pw) / 2, (box.height - ph) / 2, pw, ph);
}

/// One PDF's page, fitted, with pinch zoom and big arrows either side.
class _Pane extends StatelessWidget {
  const _Pane({super.key, required this.pdf, required this.page, this.zoom, this.viewportKey, this.onPrev, this.onNext, this.small = false});

  final OpenPdf pdf;
  final int page;
  final TransformationController? zoom;
  final Key? viewportKey;
  final VoidCallback? onPrev, onNext;
  final bool small;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, box) {
      final size = box.biggest;
      final r = _fit(size, pdf.aspect(page));
      return Stack(
        children: [
          Positioned.fill(
            child: InteractiveViewer(
              key: viewportKey,
              transformationController: zoom,
              maxScale: 6,
              child: SizedBox(
                width: size.width,
                height: size.height,
                child: Stack(
                  children: [
                    Positioned.fromRect(rect: r, child: PdfPageImage(key: ValueKey('page-$page'), pdf: pdf, page: page)),
                  ],
                ),
              ),
            ),
          ),
          Positioned(left: 12, top: 0, bottom: 0, child: Center(child: _arrow(Icons.chevron_left_rounded, onPrev, 'ce-viewer-prev'))),
          Positioned(right: 12, top: 0, bottom: 0, child: Center(child: _arrow(Icons.chevron_right_rounded, onNext, 'ce-viewer-next'))),
        ],
      );
    },
  );

  Widget _arrow(IconData icon, VoidCallback? onTap, String key) {
    final d = small ? 64.0 : 88.0;
    return Opacity(
      opacity: onTap == null ? 0.35 : 1,
      child: Material(
        color: Colors.white,
        elevation: 4,
        shape: const CircleBorder(),
        child: InkWell(
          key: small ? null : Key(key),
          customBorder: const CircleBorder(),
          onTap: onTap,
          child: SizedBox(width: d, height: d, child: Icon(icon, size: d * 0.7, color: CeC.navy)),
        ),
      ),
    );
  }
}

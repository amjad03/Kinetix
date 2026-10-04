import 'package:flutter/material.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/models.dart';
import '../../l10n/l10n.dart';
import '../../widgets/common.dart';

/// A class board the teacher shared, read-only: swipe between pages, pinch to zoom.
class BoardScreen extends StatefulWidget {
  const BoardScreen({super.key, required this.api, required this.boardId, this.summary});

  final StudentApi api;
  final String boardId;

  /// Shown in the app bar while the pages load.
  final BoardSummary? summary;

  static Future<void> open(BuildContext context, StudentApi api, String boardId, {BoardSummary? summary}) => Navigator.of(context).push(
    MaterialPageRoute(
      builder: (_) => BoardScreen(api: api, boardId: boardId, summary: summary),
    ),
  );

  @override
  State<BoardScreen> createState() => _BoardScreenState();
}

class _BoardScreenState extends State<BoardScreen> {
  SharedBoard? _board;
  ApiException? _error;
  int _page = 0;
  bool _zoomed = false;
  final _pages = PageController();
  final _zoom = <int, TransformationController>{};

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _pages.dispose();
    for (final z in _zoom.values) {
      z.dispose();
    }
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final b = await widget.api.whiteboard(widget.boardId);
      if (mounted) setState(() => _board = b);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  TransformationController _zoomFor(int page) => _zoom.putIfAbsent(page, () {
    final z = TransformationController();
    z.addListener(() {
      // While zoomed in, one finger pans the board instead of turning the page.
      final zoomed = z.value.getMaxScaleOnAxis() > 1.01;
      if (page == _page && zoomed != _zoomed) setState(() => _zoomed = zoomed);
    });
    return z;
  });

  Offset? _doubleTapAt;

  /// Double-tap zooms in 2.5× around the finger, or back out.
  void _toggleZoom(int page) {
    final z = _zoomFor(page);
    if (z.value.getMaxScaleOnAxis() > 1.01) {
      z.value = Matrix4.identity();
    } else {
      final p = _doubleTapAt ?? Offset.zero;
      const k = 2.5;
      z.value = Matrix4.identity()
        ..translateByDouble(-p.dx * (k - 1), -p.dy * (k - 1), 0, 1)
        ..scaleByDouble(k, k, 1, 1);
    }
  }

  void _goTo(int page) => _pages.animateToPage(page, duration: const Duration(milliseconds: 250), curve: Curves.easeOutCubic);

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final s = _board?.summary ?? widget.summary;
    final board = _board?.board;
    final pageCount = board?.pageCount ?? 0;
    final subtitle = [?s?.teacherName, if (s?.sharedAt != null) context.fmt.shortDay(s!.sharedAt!)].join(' · ');

    return Scaffold(
      backgroundColor: c.surfaceContainer,
      appBar: AppBar(
        backgroundColor: c.surfaceContainer,
        titleSpacing: 0,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(s?.title ?? context.l10n.classBoard, maxLines: 1, overflow: TextOverflow.ellipsis, style: context.text.titleMedium),
            if (subtitle.isNotEmpty || s?.subjectName != null)
              Text(
                [?s?.subjectName, if (subtitle.isNotEmpty) subtitle].join(' · '),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant),
              ),
          ],
        ),
      ),
      body: _error != null
          ? Padding(
              padding: const EdgeInsets.all(Kx.s16),
              child: Align(
                alignment: Alignment.topCenter,
                child: ErrorBanner(_error!.status == 404 ? context.l10n.boardNotShared : _error!, onRetry: _load),
              ),
            )
          : board == null
          ? const Center(child: CircularProgressIndicator())
          : Column(
              children: [
                Expanded(
                  child: PageView.builder(
                    key: const Key('boardPages'),
                    controller: _pages,
                    physics: _zoomed ? const NeverScrollableScrollPhysics() : const PageScrollPhysics(),
                    itemCount: pageCount,
                    onPageChanged: (i) {
                      _zoom[_page]?.value = Matrix4.identity();
                      setState(() {
                        _page = i;
                        _zoomed = false;
                      });
                    },
                    itemBuilder: (context, i) => GestureDetector(
                      onDoubleTapDown: (d) => _doubleTapAt = d.localPosition,
                      onDoubleTap: () => _toggleZoom(i),
                      child: InteractiveViewer(
                        transformationController: _zoomFor(i),
                        minScale: 1,
                        maxScale: 6,
                        child: Center(
                          child: Padding(
                            padding: const EdgeInsets.all(Kx.s12),
                            child: AspectRatio(
                              aspectRatio: board.canvas.aspectRatio,
                              child: DecoratedBox(
                                decoration: BoxDecoration(
                                  borderRadius: Kx.radiusMd,
                                  boxShadow: [
                                    BoxShadow(color: Colors.black.withValues(alpha: 0.12), blurRadius: 8, offset: const Offset(0, 2)),
                                  ],
                                ),
                                child: ClipRRect(
                                  borderRadius: Kx.radiusMd,
                                  child: WhiteboardView(board: board, page: i),
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
                SafeArea(
                  top: false,
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(Kx.s8, 0, Kx.s8, Kx.s8),
                    child: Row(
                      children: [
                        IconButton(
                          tooltip: context.l10n.previousPage,
                          onPressed: _page > 0 ? () => _goTo(_page - 1) : null,
                          icon: const Icon(Icons.chevron_left),
                        ),
                        Expanded(
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text(context.l10n.pageOf(_page + 1, pageCount), key: const Key('pageLabel'), style: context.text.labelLarge),
                              Text(
                                _zoomed
                                    ? context.l10n.zoomOut
                                    : MediaQuery.orientationOf(context) == Orientation.portrait && board.canvas.aspectRatio > 1
                                    ? context.l10n.zoomSideways
                                    : context.l10n.zoomHint,
                                style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant),
                              ),
                            ],
                          ),
                        ),
                        IconButton(
                          key: const Key('nextPage'),
                          tooltip: context.l10n.nextPage,
                          onPressed: _page < pageCount - 1 ? () => _goTo(_page + 1) : null,
                          icon: const Icon(Icons.chevron_right),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
    );
  }
}

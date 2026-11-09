import 'dart:async';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../ui/ce_confirm.dart';
import '../ui/ce_style.dart';
import 'board_library.dart';

final _day = DateFormat('d MMM yyyy');
final _dayTime = DateFormat('d MMM yyyy, h:mm a');

/// The name a board is saved with first: "1st PUC A · Physics · 9 Nov 2026".
String ceDefaultBoardTitle({required String className, required String subject, required DateTime at}) => [className, subject, _day.format(at)].where((x) => x.trim().isNotEmpty).join(' · ');

/// What Save chose: the name, and whether it is saved as a new board (not over the open one).
typedef CeSaveChoice = ({String title, bool asNew});

/// "Save on this board": the board's name (class, subject and date to start with). With an
/// open saved board ([current]) Save writes over it and "Save as a new board" keeps both.
class CeSaveBoardDialog extends StatefulWidget {
  const CeSaveBoardDialog({super.key, required this.initialTitle, this.current, this.teacherName = ''});

  final String initialTitle;

  /// The saved board open now (its title), if any.
  final String? current;
  final String teacherName;

  @override
  State<CeSaveBoardDialog> createState() => _CeSaveBoardDialogState();
}

class _CeSaveBoardDialogState extends State<CeSaveBoardDialog> {
  late final _title = TextEditingController(text: widget.initialTitle);

  void _done({required bool asNew}) {
    final t = _title.text.trim();
    if (t.isEmpty) return;
    Navigator.pop(context, (title: t, asNew: asNew));
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    key: const Key('ce-save-dialog'),
    scrollable: true,
    icon: const Icon(Icons.save_outlined, size: 36),
    title: const Text('Save on this board'),
    content: SizedBox(
      width: 560,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          TextField(
            key: const Key('ce-save-title'),
            controller: _title,
            autofocus: true,
            maxLength: 120,
            style: ceText(20, c: CeC.navy),
            decoration: const InputDecoration(labelText: 'Name of the board'),
            onSubmitted: (_) => _done(asNew: widget.current == null),
          ),
          const SizedBox(height: 4),
          Row(
            children: [
              const Icon(Icons.lock_outline, size: 18, color: CeC.muted),
              const SizedBox(width: 8),
              Expanded(child: Text('Kept on this board only${widget.teacherName.isEmpty ? '' : ', in ${widget.teacherName}’s boards'}. Open it again from Open, any day.', style: ceText(15))),
            ],
          ),
        ],
      ),
    ),
    actions: [
      TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
      if (widget.current != null) OutlinedButton(key: const Key('ce-save-new'), onPressed: () => _done(asNew: true), child: const Text('Save as a new board')),
      FilledButton(
        key: const Key('ce-save-ok'),
        onPressed: () => _done(asNew: widget.current == null),
        child: const Text('Save'),
      ),
    ],
  );
}

/// "Open a board": the teacher's boards saved on this board, as a grid of thumbnails, with the
/// ones used last on top (Recent), a search by name, this class or all their classes, and
/// Delete (asked first).
class CeBoardLibraryDialog extends StatefulWidget {
  const CeBoardLibraryDialog({super.key, required this.library, required this.teacherId, required this.classId, required this.className, required this.onOpen});

  final LocalBoardLibrary library;
  final String teacherId, classId, className;
  final ValueChanged<LocalBoardEntry> onOpen;

  @override
  State<CeBoardLibraryDialog> createState() => _CeBoardLibraryDialogState();
}

class _CeBoardLibraryDialogState extends State<CeBoardLibraryDialog> {
  final _search = TextEditingController();
  bool _allClasses = false;
  List<LocalBoardEntry>? _all;
  List<LocalBoardEntry> _recent = const [];

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  Future<void> _load() async {
    final all = await widget.library.list(teacherId: widget.teacherId);
    final recent = await widget.library.recent(teacherId: widget.teacherId);
    if (!mounted) return;
    setState(() {
      _all = all;
      _recent = recent;
    });
  }

  List<LocalBoardEntry> get _shown {
    final q = _search.text.trim().toLowerCase();
    return [
      for (final e in _all ?? const <LocalBoardEntry>[])
        if ((_allClasses || e.classId == widget.classId) && (q.isEmpty || '${e.title} ${e.className} ${e.subject}'.toLowerCase().contains(q))) e,
    ];
  }

  Future<void> _delete(LocalBoardEntry e) async {
    final ok = await ceConfirmRemove(
      context,
      title: 'Delete “${e.title}”?',
      body: 'Its ${e.pages} ${e.pages == 1 ? 'page goes' : 'pages go'} from this board for good. Boards in a backup stay in the backup.',
      confirm: 'Delete board',
    );
    if (!ok) return;
    await widget.library.delete(e.id);
    await _load();
  }

  void _open(LocalBoardEntry e) {
    Navigator.pop(context);
    widget.onOpen(e);
  }

  @override
  Widget build(BuildContext context) {
    final shown = _shown;
    final searching = _search.text.trim().isNotEmpty;
    return Dialog(
      key: const Key('ce-library'),
      backgroundColor: CeC.page,
      insetPadding: const EdgeInsets.all(40),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(32)),
      child: SizedBox(
        width: 1440,
        height: 900,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(40, 32, 40, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  ceIconDot(Icons.folder_open_outlined, bg: CeC.lavender, size: 56),
                  const SizedBox(width: 18),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Open a board', style: ceHeading(32)),
                        Text('Your boards saved on this board', style: ceText(17)),
                      ],
                    ),
                  ),
                  IconButton(key: const Key('ce-library-close'), tooltip: 'Close', onPressed: () => Navigator.pop(context), icon: const Icon(Icons.close, size: 30)),
                ],
              ),
              const SizedBox(height: 24),
              Row(
                children: [
                  Flexible(
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 520),
                      child: TextField(
                        key: const Key('ce-library-search'),
                        controller: _search,
                        onChanged: (_) => setState(() {}),
                        style: ceText(18, c: CeC.navy),
                        decoration: InputDecoration(
                          hintText: 'Search by name',
                          prefixIcon: const Icon(Icons.search),
                          filled: true,
                          fillColor: Colors.white,
                          border: OutlineInputBorder(borderRadius: BorderRadius.circular(28), borderSide: BorderSide.none),
                          suffixIcon: searching ? IconButton(onPressed: () => setState(_search.clear), icon: const Icon(Icons.clear)) : null,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 20),
                  ChoiceChip(
                    key: const Key('ce-library-this-class'),
                    label: Text(widget.className.isEmpty ? 'This class' : widget.className),
                    selected: !_allClasses,
                    onSelected: (_) => setState(() => _allClasses = false),
                  ),
                  const SizedBox(width: 10),
                  ChoiceChip(key: const Key('ce-library-all'), label: const Text('All my classes'), selected: _allClasses, onSelected: (_) => setState(() => _allClasses = true)),
                ],
              ),
              const SizedBox(height: 20),
              Expanded(
                child: _all == null
                    ? const Center(child: CircularProgressIndicator())
                    : ListView(
                        children: [
                          if (!searching && _recent.isNotEmpty) ...[
                            Text('Recent', style: ceHeading(22)),
                            const SizedBox(height: 12),
                            _grid([for (final e in _recent) _tile(e, keyPrefix: 'ce-recent')]),
                            const SizedBox(height: 28),
                            Text(_allClasses ? 'All my boards' : 'Boards for ${widget.className.isEmpty ? 'this class' : widget.className}', style: ceHeading(22)),
                            const SizedBox(height: 12),
                          ],
                          if (shown.isEmpty)
                            Padding(
                              key: const Key('ce-library-empty'),
                              padding: const EdgeInsets.symmetric(vertical: 60),
                              child: Center(
                                child: Text(
                                  searching
                                      ? 'No board is called that. Try another word, or All my classes.'
                                      : (_all!.isEmpty
                                            ? 'No boards saved yet. Tap Save on the board’s menu to keep today’s board here.'
                                            : 'No boards for this class yet. Tap All my classes to see the others.'),
                                  textAlign: TextAlign.center,
                                  style: ceText(19),
                                ),
                              ),
                            )
                          else
                            _grid([for (final e in shown) _tile(e, keyPrefix: 'ce-board')]),
                        ],
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _grid(List<Widget> tiles) => Wrap(spacing: 20, runSpacing: 20, children: tiles);

  Widget _tile(LocalBoardEntry e, {required String keyPrefix}) => SizedBox(
    key: Key('$keyPrefix-${e.id}'),
    width: 320,
    child: Material(
      color: Colors.white,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(22),
        side: const BorderSide(color: CeC.line),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => _open(e),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            AspectRatio(
              aspectRatio: 16 / 9,
              child: _Thumb(library: widget.library, entry: e),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 4, 12),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          e.title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: ceHeading(18, w: FontWeight.w600),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          [
                            if (_allClasses || keyPrefix == 'ce-recent') e.className,
                            '${e.pages} ${e.pages == 1 ? 'page' : 'pages'}',
                            _dayTime.format(e.savedAt),
                          ].where((x) => x.isNotEmpty).join(' · '),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: ceText(14),
                        ),
                      ],
                    ),
                  ),
                  if (keyPrefix == 'ce-board')
                    IconButton(
                      key: Key('ce-board-delete-${e.id}'),
                      tooltip: 'Delete',
                      onPressed: () => unawaited(_delete(e)),
                      icon: const Icon(Icons.delete_outline, color: CeC.muted),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    ),
  );
}

class _Thumb extends StatefulWidget {
  const _Thumb({required this.library, required this.entry});

  final LocalBoardLibrary library;
  final LocalBoardEntry entry;

  @override
  State<_Thumb> createState() => _ThumbState();
}

class _ThumbState extends State<_Thumb> {
  Uint8List? _png;
  bool _done = false;

  @override
  void initState() {
    super.initState();
    unawaited(
      widget.library.thumbnail(widget.entry).then((b) {
        if (mounted) {
          setState(() {
            _png = b;
            _done = true;
          });
        }
      }),
    );
  }

  @override
  Widget build(BuildContext context) => Container(
    color: CeC.blue,
    child: _png != null
        ? Image.memory(_png!, fit: BoxFit.cover, gaplessPlayback: true)
        : Center(child: Icon(_done ? Icons.draw_outlined : Icons.hourglass_empty, size: 48, color: CeC.navy.withValues(alpha: 0.4))),
  );
}

import 'dart:async';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:kinetix_ink/kinetix_ink.dart' show BoardBackgroundColors, BoardElement;
import 'package:kinetix_lessons/kinetix_lessons.dart';

import '../../features/phet/phet_view.dart';
import '../../features/reader/read_aloud.dart' show ReaderVoice;
import '../classroom_hooks.dart';
import '../local/classroom_store.dart';
import '../ui/ce_more_text.dart';
import '../ui/ce_style.dart';
import '../content_pack/content_library.dart' show ContentLibrary;
import '../content_pack/content_settings.dart' show TopicVideoButton;
import 'lesson_board.dart';
import 'lesson_embeds.dart';
import 'lesson_library.dart';
import 'lesson_progress.dart';
import '../l10n/ce_strings.dart';

/// The Lessons tab of the split panel (Classroom edition): the PUC lessons bundled on the board,
/// taught step by step. Level and subject chips, pastel chapter cards with how much the class
/// has been taught, the chapter's lessons, then the lesson one step at a time (the step's
/// picture, sim or lab; its line, read aloud by the board's own voice; English or ಕನ್ನಡ) and
/// "Put on board". Progress is kept per class. No AI; no internet needed.
class LessonsPanel extends StatefulWidget {
  const LessonsPanel({super.key, required this.host, this.library, this.progress, this.embeds, this.narrator});

  final ClassroomHost host;

  /// Tests pass their own; the board uses [LessonLibrary.instance] and [LessonProgress.instance].
  final LessonLibrary? library;
  final LessonProgress? progress;
  final Embeds? embeds;
  final Narrator? narrator;

  @override
  State<LessonsPanel> createState() => LessonsPanelState();
}

/// Where the panel was (kept while the board is open, so reopening Lessons comes back to it).
class _Nav {
  static int? year;
  static String? subject;
  static String? classKey;
}

/// The voice that reads a step's line: the board's own text-to-speech (as Read aloud uses).
class BoardNarrator implements Narrator {
  ReaderVoice? _voice;
  Completer<void>? _done;

  @override
  Future<void> speak(String text, Lang lang) async {
    final v = _voice ??= ReaderVoice.make();
    _done = Completer<void>();
    v.onDone = () {
      if (!(_done?.isCompleted ?? true)) _done!.complete();
    };
    final ok = await v.speak(text, lang == Lang.kn ? 'kn-IN' : 'en-IN', 0.45);
    if (!ok) return;
    await _done!.future.timeout(Duration(seconds: 4 + text.length ~/ 8), onTimeout: () {});
  }

  @override
  Future<void> stop() async {
    if (!(_done?.isCompleted ?? true)) _done!.complete();
    await _voice?.stop();
  }

  void dispose() {
    _voice?.dispose();
    _voice = null;
  }
}

class LessonsPanelState extends State<LessonsPanel> {
  late final LessonLibrary lib = widget.library ?? LessonLibrary.instance;
  late final LessonProgress progress = widget.progress ?? LessonProgress.instance;
  LessonCatalogue? cat;
  Object? error;

  late int year;
  late String subject;
  CatChapter? chapter;

  /// The lesson being taught (null: the chapter list or the lesson list).
  LessonController? lesson;
  CatTopic? topic;
  InstalledPack? pack;
  final whiteboardKey = GlobalKey<WhiteboardViewState>();
  final _shotKey = GlobalKey();
  PhetWebView? _phetView;
  late final Embeds embeds = widget.embeds ?? boardLessonEmbeds(onPhet: (v) => _phetView = v);
  late final Narrator narrator = widget.narrator ?? BoardNarrator();
  late ClassRoom room = _room();
  bool _busy = false;

  ClassroomHost get host => widget.host;
  String get classKey => host.currentClass?.id ?? LessonProgress.noClass;

  @override
  void initState() {
    super.initState();
    final fresh = _Nav.classKey != classKey;
    year = (fresh ? null : _Nav.year) ?? host.pucYear ?? 1;
    subject = (fresh ? null : _Nav.subject) ?? subjectIdFor(host.subject) ?? 'physics';
    _Nav.classKey = classKey;
    ClassroomHooks.panelTip = _tip;
    progress.addListener(_changed);
    unawaited(_load());
  }

  Future<void> _load() async {
    try {
      final c = await lib.catalogue();
      await progress.load();
      if (!mounted) return;
      setState(() {
        cat = c;
        if (!c.subjectsOf(year).contains(subject)) subject = c.subjectsOf(year).firstOrNull ?? subject;
      });
    } catch (e) {
      if (mounted) setState(() => error = e);
    }
  }

  void _changed() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    if (ClassroomHooks.panelTip == _tip) ClassroomHooks.panelTip = null;
    progress.removeListener(_changed);
    lesson?.removeListener(_changed);
    lesson?.stopSpeech();
    if (narrator is BoardNarrator) (narrator as BoardNarrator).dispose();
    super.dispose();
  }

  String? _tip() {
    final c = lesson;
    if (c == null) return chapter == null ? ceTr('Tap a chapter, or Continue to carry on from last class.') : ceTr('Tap a lesson to teach it step by step.');
    if (c.isLast && _wbAtEnd) return ceTr('Last step. Put it on the board, then tap Done.');
    return ceTr('Explain the picture, then tap Next for step {n}.', {'n': c.index + 2});
  }

  ClassRoom _room() => ClassRoom(rollCount: host.rolls.isEmpty ? 40 : host.rolls.length, absent: host.absentRolls);

  // --- Navigation ----------------------------------------------------------------------------

  void pickYear(int y) => setState(() {
    year = _Nav.year = y;
    final subs = cat?.subjectsOf(y) ?? const [];
    if (!subs.contains(subject) && subs.isNotEmpty) subject = _Nav.subject = subs.first;
    chapter = null;
  });

  void pickSubject(String s) => setState(() {
    subject = _Nav.subject = s;
    chapter = null;
  });

  void openChapter(CatChapter c) => setState(() => chapter = c);

  /// Opens a topic's lesson where this class stopped (or from the start, once it was taught).
  Future<void> openTopic(CatTopic t, {int? at}) async {
    if (_busy) return;
    _busy = true;
    try {
      final ch = cat!.chapterOfTopic(t.id)!;
      final p = await lib.chapter(ch.id);
      final l = p.lessons[t.id];
      if (l == null || !mounted) return;
      lesson?.removeListener(_changed);
      lesson?.stopSpeech();
      final c = LessonController(pack: p, lesson: l, narrator: narrator, recorder: SessionRecorder(chapterId: ch.id, topicId: t.id, lessonId: l.id), lang: Lang.en);
      final saved = progress.of(classKey, t.id);
      final start = at ?? (saved == null || saved.taught ? 0 : saved.step);
      if (start > 0) c.goTo(start.clamp(0, c.blocks.length - 1));
      c.addListener(_changed);
      setState(() {
        chapter = ch;
        year = ch.year;
        subject = ch.subject;
        topic = t;
        pack = p;
        lesson = c;
        room = _room();
      });
      _record();
    } finally {
      _busy = false;
    }
  }

  void closeLesson() {
    lesson?.removeListener(_changed);
    lesson?.stopSpeech();
    setState(() {
      lesson = null;
      topic = null;
    });
  }

  void _record() {
    final c = lesson, t = topic;
    if (c == null || t == null) return;
    progress.setStep(classKey, t.id, c.index, c.blocks.length);
  }

  bool get _wbAtEnd => lesson?.current.type != BlockType.whiteboard || (whiteboardKey.currentState?.atEnd ?? true);

  /// Next: the step's next card or whiteboard line, then the next step; Done on the last.
  void next() {
    final c = lesson;
    if (c == null) return;
    final wb = whiteboardKey.currentState;
    if (c.current.type == BlockType.whiteboard && wb != null && !wb.atEnd) {
      wb.nextStep();
      setState(() {});
      return;
    }
    if (!c.revealDone) {
      c.revealMore();
      return;
    }
    if (c.isLast) {
      progress.markTaught(classKey, topic!.id, total: c.blocks.length);
      host.showMessage(ceTr('“{title}” marked as taught', {'title': topic!.title.t(Lang.en)}));
      closeLesson();
      return;
    }
    c.goTo(c.index + 1);
    _record();
  }

  void back() {
    final c = lesson;
    if (c == null || c.isFirst) return;
    c.back();
    _record();
  }

  // --- Put on board --------------------------------------------------------------------------

  String stepTitle(Block b, Lang l) => (b.title ?? b.maybe('heading'))?.t(l).replaceAll('*', '') ?? blockName(b.type, l);

  /// The step's line: its voice line for what is shown, a whiteboard step's line, or its narration.
  L10n? caption() {
    final c = lesson;
    if (c == null) return null;
    final b = c.current;
    if (b.type == BlockType.whiteboard && c.stepLine != null) return c.stepLine;
    final voice = b.raw['voice'];
    if (voice is List && voice.isNotEmpty) {
      final v = voice[(c.revealed - 1).clamp(0, voice.length - 1)];
      if (v is Map) return L10n.of(v['say']);
    }
    return b.narration;
  }

  Future<List<BoardElement>> putOnBoard() async {
    final c = lesson;
    if (c == null) return const [];
    final b = c.current, l = c.lang;
    final dark = host.wb.background.isDark;
    List<Map<String, dynamic>>? items;
    List<BoardElement>? vector;
    Uint8List? picture;
    Size? size;
    if (b.type == BlockType.whiteboard) {
      items = whiteboardKey.currentState?.visibleItems ?? [for (final s in b.boardSteps) ...s.draw];
      vector = whiteboardElements(items, l, ink: dark ? inkColor : paperInkColor);
      if (vector == null) {
        size = const Size(1000, 600);
        final its = items;
        picture = await renderWidgetToPng(
          ColoredBox(
            color: dark ? const Color(0xFF141A1D) : Colors.white,
            child: WhiteboardItems(items: [for (final d in its) (d, 0)], current: -1, t: 1, lang: l, ink: dark ? inkColor : paperInkColor),
          ),
          size: size,
          context: mounted ? context : null,
        );
      }
    } else if (b.type == BlockType.simulation && b.s('source') == 'phet') {
      picture = await phetPicture(_phetView);
      if (picture != null) size = await imageSize(picture);
    }
    if (vector == null && picture == null) {
      final shot = await _capture();
      if (shot != null) (picture, size) = shot;
    }
    final placed = putStepOnBoard(
      host,
      title: stepTitle(b, l),
      vector: vector,
      picture: picture,
      pictureSize: size,
      formula: keyFormula(b, board: items),
      note: keyNote(b, c.revealed, l),
    );
    host.showMessage(ceTr('Step {n} is on the board. Write on it, move it or rub it out.', {'n': c.index + 1}));
    return placed;
  }

  Future<(Uint8List, Size)?> _capture() async {
    final r = _shotKey.currentContext?.findRenderObject();
    if (r is! RenderRepaintBoundary || !r.hasSize) return null;
    try {
      final img = await r.toImage(pixelRatio: 1.5);
      final data = await img.toByteData(format: ui.ImageByteFormat.png);
      final s = Size(img.width.toDouble(), img.height.toDouble());
      img.dispose();
      return data == null ? null : (data.buffer.asUint8List(), s);
    } catch (_) {
      return null;
    }
  }

  // --- Build ---------------------------------------------------------------------------------

  @override
  Widget build(BuildContext context) => ColoredBox(
    key: const Key('ce-lessons-panel'),
    color: CeC.page,
    child: error != null
        ? Center(child: Text(context.ce('The lessons could not be opened on this board.'), style: ceText(17, c: CeC.navy)))
        : cat == null
        ? const Center(child: CircularProgressIndicator())
        : lesson != null
        ? _player(context)
        : chapter != null
        ? _chapterView()
        : _home(),
  );

  Widget _chip(String label, {required bool on, IconData? icon, required VoidCallback onTap, Key? key}) => Material(
    key: key,
    color: on ? CeC.navy : Colors.white,
    shape: StadiumBorder(side: BorderSide(color: on ? CeC.navy : CeC.line)),
    child: InkWell(
      customBorder: const StadiumBorder(),
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 9),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (icon != null) ...[Icon(icon, size: 18, color: on ? Colors.white : CeC.navy), const SizedBox(width: 6)],
            Text(label, style: ceText(15, w: FontWeight.w600, c: on ? Colors.white : CeC.navy)),
          ],
        ),
      ),
    ),
  );

  int _taughtIn(CatChapter ch) => ch.topics.where((t) => progress.of(classKey, t.id)?.taught ?? false).length;

  /// The lesson to carry on with in this level and subject: the last one opened, if not finished.
  (CatTopic, TopicProgress)? _continue() {
    final id = progress.lastTopic(classKey);
    if (id == null) return null;
    final ch = cat!.chapterOfTopic(id);
    final t = cat!.topic(id);
    final p = progress.of(classKey, id);
    if (ch == null || t == null || p == null || p.taught || ch.year != year || ch.subject != subject) return null;
    return (t, p);
  }

  Widget _home() {
    final c = cat!;
    final subs = c.subjectsOf(year);
    const main = ['physics', 'chemistry', 'maths', 'biology'];
    final shown = [
      for (final s in main)
        if (subs.contains(s)) s,
      if (!main.contains(subject) && subs.contains(subject)) subject,
    ];
    final more = [
      for (final s in subs)
        if (!shown.contains(s)) s,
    ];
    final chapters = c.chaptersOf(year, subject);
    final cont = _continue();
    return ListView(
      key: const Key('lessons-home'),
      padding: const EdgeInsets.fromLTRB(28, 24, 28, 28),
      children: [
        Row(
          children: [
            Expanded(child: Text(context.ce('Lessons'), style: ceHeading(32))),
            cePill(ceTr('On this board · no internet needed'), icon: Icons.offline_pin_outlined),
          ],
        ),
        const SizedBox(height: 6),
        Text(context.ce('Short, ready lessons for Karnataka PUC. Pick a chapter and teach it step by step.'), style: ceText(16)),
        const SizedBox(height: 18),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            _chip(ceTr('1st PUC'), on: year == 1, onTap: () => pickYear(1), key: const Key('lessons-year-1')),
            _chip(ceTr('2nd PUC'), on: year == 2, onTap: () => pickYear(2), key: const Key('lessons-year-2')),
            Container(width: 1, height: 38, color: CeC.line, margin: const EdgeInsets.symmetric(horizontal: 4)),
            for (final s in shown) _chip(subjectName(s), on: s == subject, icon: subjectIconOf(s), onTap: () => pickSubject(s), key: Key('lessons-subject-$s')),
            if (more.isNotEmpty)
              PopupMenuButton<String>(
                key: const Key('lessons-more-subjects'),
                tooltip: context.ce('More subjects'),
                onSelected: pickSubject,
                itemBuilder: (_) => [
                  for (final s in more)
                    PopupMenuItem(
                      value: s,
                      child: Row(children: [Icon(subjectIconOf(s), size: 20, color: CeC.navy), const SizedBox(width: 10), Text(subjectName(s), style: ceText(16, c: CeC.navy))]),
                    ),
                ],
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 9),
                  decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(99), border: Border.all(color: CeC.line)),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [Text(context.ce('More subjects'), style: ceText(15, w: FontWeight.w600, c: CeC.navy)), const Icon(Icons.expand_more, size: 20, color: CeC.navy)],
                  ),
                ),
              ),
          ],
        ),
        if (cont != null) ...[const SizedBox(height: 20), _continueCard(cont.$1, cont.$2)],
        const SizedBox(height: 24),
        Text('${year == 2 ? '2nd' : '1st'} PUC · ${subjectName(subject)}', style: ceHeading(22)),
        const SizedBox(height: 12),
        LayoutBuilder(
          builder: (context, box) {
            final cols = box.maxWidth > 560 ? 2 : 1;
            final w = (box.maxWidth - 16 * (cols - 1)) / cols;
            return Wrap(
              spacing: 16,
              runSpacing: 16,
              children: [for (final (i, ch) in chapters.indexed) SizedBox(width: w, child: _chapterCard(ch, CeC.pastel(i)))],
            );
          },
        ),
      ],
    );
  }

  Widget _continueCard(CatTopic t, TopicProgress p) {
    final ch = cat!.chapterOfTopic(t.id)!;
    final left = (t.minutes * (1 - (p.step / (p.total == 0 ? 1 : p.total)))).round();
    final i = cat!.chaptersOf(ch.year, ch.subject).indexOf(ch);
    return Container(
      key: const Key('lessons-continue'),
      padding: const EdgeInsets.all(20),
      decoration: ceCard(r: 24),
      child: Row(
        children: [
          Container(
            width: 112,
            height: 80,
            decoration: BoxDecoration(color: CeC.pastel(i + 4), borderRadius: BorderRadius.circular(16)),
            child: Icon(chapterIcon(ch), size: 40, color: CeC.navy),
          ),
          const SizedBox(width: 18),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(context.ce('Continue where you stopped'), style: ceText(14, w: FontWeight.w600, c: CeC.accent)),
                const SizedBox(height: 2),
                Text(t.title.t(Lang.en), style: ceHeading(22), maxLines: 1, overflow: TextOverflow.ellipsis),
                const SizedBox(height: 2),
                Text(ceTr('Chapter {n} · step {step} of {total} · about {left} minutes left', {'n': ch.number, 'step': p.step + 1, 'total': p.total, 'left': left}), style: ceText(15)),
              ],
            ),
          ),
          const SizedBox(width: 12),
          FilledButton.icon(
            key: const Key('lessons-continue-button'),
            onPressed: () => openTopic(t),
            style: ceBigButton(),
            icon: const Icon(Icons.play_arrow_rounded),
            label: Text(context.ce('Continue')),
          ),
        ],
      ),
    );
  }

  Widget _chapterCard(CatChapter ch, Color bg) {
    final done = _taughtIn(ch), n = ch.topics.length;
    return Material(
      key: Key('lessons-chapter-${ch.id}'),
      color: bg,
      borderRadius: BorderRadius.circular(24),
      child: InkWell(
        borderRadius: BorderRadius.circular(24),
        onTap: () => openChapter(ch),
        child: Container(
          height: 168,
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Text(ceTr('Chapter {n}', {'n': ch.number}), style: ceText(14, w: FontWeight.w600, c: CeC.navy.withValues(alpha: 0.75))),
                  const Spacer(),
                  ceIconDot(chapterIcon(ch), size: 40),
                ],
              ),
              const SizedBox(height: 4),
              Text(ch.title.t(Lang.en), maxLines: 2, overflow: TextOverflow.ellipsis, style: ceHeading(20, height: 1.2)),
              const Spacer(),
              Row(
                children: [
                  Expanded(child: Text(ceTr('{n} lessons · {d} diagrams', {'n': n, 'd': ch.diagrams}), style: ceText(14), overflow: TextOverflow.ellipsis)),
                  Text(done == 0 ? ceTr('Not started') : ceTr('{n} of {total} taught', {'n': done, 'total': n}), style: ceText(14, w: FontWeight.w600, c: CeC.navy)),
                ],
              ),
              const SizedBox(height: 8),
              ClipRRect(
                borderRadius: BorderRadius.circular(4),
                child: LinearProgressIndicator(value: n == 0 ? 0 : done / n, minHeight: 6, backgroundColor: Colors.white, color: CeC.navy),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _chapterView() {
    final ch = chapter!;
    final i = cat!.chaptersOf(ch.year, ch.subject).indexOf(ch);
    return ListView(
      key: const Key('lessons-chapter'),
      padding: const EdgeInsets.fromLTRB(28, 18, 28, 28),
      children: [
        Row(
          children: [
            IconButton(key: const Key('lessons-back'), tooltip: ceTr('Back'), onPressed: () => setState(() => chapter = null), icon: const Icon(Icons.arrow_back, color: CeC.navy)),
            const SizedBox(width: 4),
            Expanded(child: Text('${ch.year == 2 ? '2nd' : '1st'} PUC · ${subjectName(ch.subject)}', style: ceText(16, w: FontWeight.w600, c: CeC.navy))),
            cePill(ceTr('{n} of {total} taught', {'n': _taughtIn(ch), 'total': ch.topics.length}), bg: CeC.pastel(i)),
          ],
        ),
        const SizedBox(height: 12),
        Text(ceTr('Chapter {n}', {'n': ch.number}), style: ceText(15, w: FontWeight.w600, c: CeC.accent)),
        Text(ch.title.t(Lang.en), style: ceHeading(32)),
        if (ch.title.kn != null) Text(ch.title.kn!, style: ceText(18, c: CeC.muted)),
        const SizedBox(height: 20),
        for (final (k, t) in ch.topics.indexed) ...[_topicRow(t, k + 1, CeC.pastel(i)), const SizedBox(height: 12)],
      ],
    );
  }

  Widget _topicRow(CatTopic t, int n, Color tint) {
    final p = progress.of(classKey, t.id);
    final status = p == null
        ? ceTr('Not started')
        : p.taught
        ? ceTr('Taught')
        : ceTr('Step {n} of {total}', {'n': p.step + 1, 'total': p.total});
    return Material(
      key: Key('lessons-topic-${t.id}'),
      color: Colors.white,
      borderRadius: BorderRadius.circular(20),
      child: InkWell(
        borderRadius: BorderRadius.circular(20),
        onTap: () => openTopic(t),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(18, 16, 12, 16),
          child: Row(
            children: [
              Container(
                width: 48,
                height: 48,
                alignment: Alignment.center,
                decoration: BoxDecoration(color: p?.taught ?? false ? CeC.mint : tint, shape: BoxShape.circle),
                child: p?.taught ?? false ? const Icon(Icons.check, color: CeC.green) : Text('$n', style: ceHeading(20)),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(t.title.t(Lang.en), style: ceHeading(19, height: 1.2)),
                    const SizedBox(height: 4),
                    Text([ceTr('{n} steps', {'n': t.steps}), ceTr('{n} min', {'n': t.minutes}), if (t.kannada) 'English · ಕನ್ನಡ'].join(' · '), style: ceText(14)),
                  ],
                ),
              ),
              TopicVideoButton(topicId: t.id, host: host, compact: true),
              Text(status, style: ceText(14, w: FontWeight.w600, c: p?.taught ?? false ? CeC.green : CeC.navy)),
              PopupMenuButton<String>(
                key: Key('lessons-topic-menu-${t.id}'),
                icon: const Icon(Icons.more_vert, color: CeC.muted),
                onSelected: (v) => switch (v) {
                  'taught' => progress.markTaught(classKey, t.id, total: t.steps),
                  'start' => openTopic(t, at: 0),
                  _ => progress.markTaught(classKey, t.id, taught: false, total: t.steps),
                },
                itemBuilder: (_) => [
                  PopupMenuItem(value: 'start', child: Text(context.ce('Teach from the start'))),
                  if (!(p?.taught ?? false)) PopupMenuItem(value: 'taught', child: Text(context.ce('Mark as taught'))) else PopupMenuItem(value: 'untaught', child: Text(context.ce('Mark as not taught'))),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _player(BuildContext context) {
    final c = lesson!, ch = chapter!, t = topic!;
    final b = c.current, l = c.lang;
    final n = c.blocks.length;
    final tint = CeC.pastel(cat!.chaptersOf(ch.year, ch.subject).indexOf(ch) + 4);
    final line = caption()?.t(l).replaceAll('*', '');
    final last = c.isLast && c.revealDone && _wbAtEnd;
    return Padding(
      key: const Key('lessons-player'),
      padding: const EdgeInsets.fromLTRB(28, 18, 28, 22),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              IconButton(key: const Key('lessons-player-back'), tooltip: ceTr('Back'), onPressed: closeLesson, icon: const Icon(Icons.arrow_back, color: CeC.navy)),
              const SizedBox(width: 4),
              Expanded(
                child: Text('${ceTr('Chapter {n}', {'n': ch.number})} · ${ch.title.t(l)}', style: ceText(16, w: FontWeight.w600, c: CeC.navy), maxLines: 1, overflow: TextOverflow.ellipsis),
              ),
              cePill(ceTr('Step {n} of {total}', {'n': c.index + 1, 'total': n}), bg: CeC.lavender, key: const Key('lessons-step-count')),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              for (var i = 0; i < n; i++)
                Expanded(
                  child: Container(
                    height: 6,
                    margin: EdgeInsets.symmetric(horizontal: n > 24 ? 1 : 3),
                    decoration: BoxDecoration(color: i <= c.index ? CeC.navy : CeC.line, borderRadius: BorderRadius.circular(3)),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 18),
          Text(stepTitle(b, l), key: const Key('lessons-step-title'), style: ceHeading(30), maxLines: 1, overflow: TextOverflow.ellipsis),
          const SizedBox(height: 4),
          Text(t.title.t(l), style: ceText(17), maxLines: 1, overflow: TextOverflow.ellipsis),
          const SizedBox(height: 16),
          Expanded(
            child: Container(
              decoration: BoxDecoration(color: tint, borderRadius: BorderRadius.circular(28)),
              padding: const EdgeInsets.all(14),
              child: Stack(
                children: [
                  Positioned.fill(
                    child: RepaintBoundary(
                      key: _shotKey,
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(18),
                        child: Theme(
                          data: zynetixTheme(),
                          child: ZCanvas(
                            scale: 0.55,
                            child: LessonBlockView(
                              key: ValueKey('step:${t.id}:${c.index}'),
                              c: c,
                              embeds: embeds,
                              room: room,
                              paper: tint,
                              whiteboardKey: whiteboardKey,
                              video: (v, lang) => ConceptVideoCard(video: v, lang: lang, topicId: t.id, step: '${t.id}#${c.index}', host: host),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                  // The other blocks carry their own tag or stage title.
                  if (b.type == BlockType.whiteboard) Positioned(top: 8, left: 8, child: cePill(blockLabel(b, l), icon: stepIcon(b), bg: Colors.white)),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),
          Container(
            key: const Key('lessons-caption'),
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
            decoration: ceCard(r: 22, shadow: false),
            child: Row(
              children: [
                Material(
                  color: c.speaking ? CeC.navy : CeC.accent,
                  shape: const CircleBorder(),
                  child: IconButton(
                    key: const Key('lessons-read-aloud'),
                    tooltip: c.speaking ? ceTr('Stop reading') : ceTr('Read aloud'),
                    onPressed: line == null || line.isEmpty
                        ? null
                        : () {
                            if (c.speaking) {
                              c.stopSpeech();
                              setState(() {});
                              return;
                            }
                            unawaited(_readAloud(c));
                          },
                    icon: Icon(c.speaking ? Icons.stop_rounded : Icons.volume_up_rounded, color: Colors.white),
                  ),
                ),
                const SizedBox(width: 16),
                // Two lines, then "More" when the step says more (it used to scroll out of sight).
                Expanded(
                  child: CeMoreText(
                    line == null || line.isEmpty ? ceTr('Explain this step in your own words.') : '“$line”',
                    key: const Key('lessons-caption'),
                    title: ceTr('Step {n} of {total}', {'n': c.index + 1, 'total': n}),
                    style: ceText(18, c: CeC.body, height: 1.35),
                  ),
                ),
                if (t.kannada) ...[const SizedBox(width: 12), _langToggle(c)],
              ],
            ),
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              OutlinedButton.icon(key: Key('lessons-back-step'), onPressed: c.isFirst ? null : back, style: ceSoftButton(), icon: Icon(Icons.chevron_left), label: Text(context.ce('Back'))),
              const SizedBox(width: 12),
              OutlinedButton.icon(
                key: const Key('lessons-next'),
                onPressed: next,
                style: ceSoftButton(),
                icon: Icon(last ? Icons.check : Icons.chevron_right),
                label: Text(last ? ceTr('Done') : ceTr('Next')),
              ),
              const Spacer(),
              FilledButton.icon(
                key: const Key('ce-put-on-board'),
                onPressed: () => unawaited(putOnBoard()),
                style: ceBigButton(),
                icon: const Icon(Icons.add_to_photos_outlined),
                label: Text(context.ce('Put on board')),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Future<void> _readAloud(LessonController c) async {
    final line = caption();
    if (line == null) return;
    c.readAloudOn = true;
    setState(() {});
    await c.speak(L10n(line.en.replaceAll('*', ''), line.kn?.replaceAll('*', '')));
    if (mounted) setState(() {});
  }

  Widget _langToggle(LessonController c) => Container(
    key: const Key('lessons-lang'),
    decoration: BoxDecoration(color: CeC.page, borderRadius: BorderRadius.circular(99)),
    padding: const EdgeInsets.all(3),
    child: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        for (final (lang, label) in [(Lang.en, 'English'), (Lang.kn, 'ಕನ್ನಡ')])
          InkWell(
            key: Key('lessons-lang-${lang.name}'),
            borderRadius: BorderRadius.circular(99),
            onTap: () {
              c.stopSpeech();
              c.setLang(lang);
            },
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
              decoration: BoxDecoration(color: c.lang == lang ? CeC.navy : Colors.transparent, borderRadius: BorderRadius.circular(99)),
              child: Text(label, style: ceText(14, w: FontWeight.w600, c: c.lang == lang ? Colors.white : CeC.navy)),
            ),
          ),
      ],
    ),
  );
}

/// The subjects' chip icons.
IconData subjectIconOf(String s) => switch (s) {
  'physics' => Icons.bolt_outlined,
  'chemistry' => Icons.science_outlined,
  'maths' => Icons.functions,
  'biology' => Icons.eco_outlined,
  'computer_science' => Icons.computer_outlined,
  'electronics' => Icons.memory_outlined,
  'statistics' => Icons.bar_chart,
  'accountancy' => Icons.account_balance_wallet_outlined,
  'business_studies' => Icons.business_center_outlined,
  'economics' => Icons.trending_up,
  'commerce' => Icons.storefront_outlined,
  'english' => Icons.menu_book_outlined,
  _ => Icons.school_outlined,
};

/// A chapter's icon, from what it is about (the subject's icon otherwise).
IconData chapterIcon(CatChapter ch) {
  final t = ch.title.en.toLowerCase();
  for (final (words, icon) in const [
    (['charge', 'electrostatic'], Icons.bolt_outlined),
    (['capacit', 'cell'], Icons.battery_charging_full_outlined),
    (['current', 'circuit'], Icons.electrical_services_outlined),
    (['magnet'], Icons.explore_outlined),
    (['induction', 'alternating'], Icons.sync_alt),
    (['wave', 'oscillation', 'sound'], Icons.waves),
    (['ray', 'optic', 'light'], Icons.wb_incandescent_outlined),
    (['atom', 'nucle'], Icons.blur_on),
    (['motion', 'kinematic', 'laws'], Icons.speed),
    (['gravit'], Icons.public),
    (['thermo', 'heat', 'thermal', 'kinetic theory'], Icons.thermostat),
    (['fluid', 'solution', 'liquid'], Icons.water_drop_outlined),
    (['semiconductor', 'electronic', 'digital'], Icons.memory_outlined),
    (['matrix', 'matrices', 'determinant'], Icons.grid_on),
    (['integral', 'derivative', 'differential', 'continuity', 'limit'], Icons.show_chart),
    (['probabilit', 'statistic'], Icons.casino_outlined),
    (['vector'], Icons.north_east),
    (['set', 'relation', 'function'], Icons.join_inner),
    (['trigonometr'], Icons.change_history),
    (['plant', 'photosynth', 'flower'], Icons.local_florist_outlined),
    (['cell', 'biomolecule'], Icons.biotech_outlined),
    (['human', 'body', 'breath', 'digest', 'neural', 'locomotion'], Icons.accessibility_new),
    (['inherit', 'genetic', 'evolution', 'molecular'], Icons.hub_outlined),
    (['ecosystem', 'organism', 'biodiversity', 'environment'], Icons.forest_outlined),
    (['bond', 'structure', 'periodic', 'element'], Icons.bubble_chart_outlined),
    (['equilibrium', 'kinetics', 'redox', 'electrochem'], Icons.balance),
    (['organic', 'hydrocarbon', 'alcohol', 'amine', 'aldehyde', 'halo'], Icons.hexagon_outlined),
  ]) {
    if (words.any(t.contains)) return icon;
  }
  return subjectIconOf(ch.subject);
}

IconData stepIcon(Block b) => switch (b.type) {
  BlockType.intro => Icons.flag_outlined,
  BlockType.concept => Icons.lightbulb_outline,
  BlockType.whiteboard => Icons.draw_outlined,
  BlockType.interactive || BlockType.simulation => Icons.science_outlined,
  BlockType.virtualLab => Icons.biotech_outlined,
  BlockType.model3d => Icons.view_in_ar_outlined,
  BlockType.example => Icons.edit_note,
  BlockType.classQuiz || BlockType.pyq => Icons.quiz_outlined,
  BlockType.activity || BlockType.challenge => Icons.touch_app_outlined,
  BlockType.trick => Icons.tips_and_updates_outlined,
  BlockType.recap => Icons.checklist,
  BlockType.explainer => Icons.record_voice_over_outlined,
  BlockType.conceptVideo => Icons.play_circle_outline,
};

/// The start screen's "Next lesson" line for a class and subject: the lesson it stopped in, or
/// the first one not yet taught. Null until the lessons and progress are loaded.
String? nextLessonLineFor(CeClass cls, String subjectName, {LessonLibrary? library, LessonProgress? progress}) {
  final lib = library ?? LessonLibrary.instance;
  final cat = lib.loaded;
  final prog = progress ?? LessonProgress.instance;
  final subject = subjectIdFor(subjectName);
  // The catalogue is read the first time it is needed (here, or the Lessons panel), off the UI
  // isolate; the start screen draws again when it is in (LessonLibrary.loadedCount).
  if (cat == null && subject != null) unawaited(lib.catalogue().then((_) {}, onError: (Object _) {}));
  if (cat == null || !prog.loaded || subject == null) return null;
  final chapters = cat.chaptersOf(cls.year, subject);
  if (chapters.isEmpty) return null;
  final last = prog.lastTopic(cls.id);
  if (last != null) {
    final ch = cat.chapterOfTopic(last);
    final t = cat.topic(last);
    final p = prog.of(cls.id, last);
    if (ch != null && t != null && p != null && !p.taught && ch.subject == subject && ch.year == cls.year) {
      return ceTr('Next lesson: {title} · step {n} of {total}', {'title': t.title.en, 'n': p.step + 1, 'total': p.total});
    }
  }
  for (final ch in chapters) {
    for (final t in ch.topics) {
      if (!(prog.of(cls.id, t.id)?.taught ?? false)) return ceTr('Next lesson: {title}', {'title': t.title.en});
    }
  }
  return ceTr('All {subject} lessons taught', {'subject': subjectName.trim()});
}

/// Fills [ClassroomHooks.nextLessonLine] and loads the progress in the background (the
/// Classroom edition's main calls it once). The lessons' catalogue is not read while the app
/// starts: only when the Lessons panel or the start screen's line first needs it.
void installLessonHooks() {
  ClassroomHooks.nextLessonLine = (cls, subject) => nextLessonLineFor(cls, subject);
  unawaited(LessonProgress.instance.load().then((_) {}, onError: (_) {}));
  // The installed content pack (lesson videos): its small index only, the files stay on disk.
  unawaited(ContentLibrary.shared().then((_) {}, onError: (_) {}));
}

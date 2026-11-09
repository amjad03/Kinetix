import 'dart:async';

import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/board_controller.dart';
import '../../features/enrollment/enroll_screen.dart';
import '../backup/backup.dart';
import '../backup/backup_page.dart' show restoreBackupFlow;
import '../classroom_hooks.dart';
import '../local/classroom_store.dart';
import '../local/local_class.dart';
import '../settings/classroom_settings.dart';
import '../ui/ce_confirm.dart';
import '../ui/ce_style.dart';
import 'language_switch.dart';
import 'setup_problem.dart';
import 'setup_wizard.dart';
import '../l10n/ce_strings.dart';

enum _Scene { start, who, pair }

/// The Classroom edition's first screens on a board with no ERP enrolment (README.md): the
/// start screen with "Start my class" for the period on the board's own timetable, and "Who's
/// teaching now?" with the teachers kept on the board. Pairing with the Teacher App (a college
/// on the ERP) is in Settings → Advanced, and runs the usual enrolment.
class ClassroomStart extends StatefulWidget {
  const ClassroomStart({super.key, required this.board});

  final BoardController board;

  /// Restores a backup after the school PIN (Settings → Backup & restore); offered when the
  /// saved set-up could not be read.
  static Future<void> Function(BuildContext context, ClassroomStore store)? restoreBackup = restoreBackupFlow;

  /// Today's daily backup, made when the start screen first shows each day (tests replace it).
  static Future<void> Function(ClassroomStore store) dailyBackup = (store) async {
    try {
      await BackupService(store: store).ensureDaily();
    } catch (e) {
      debugPrint('Daily backup not made: $e');
    }
  };

  @override
  State<ClassroomStart> createState() => _ClassroomStartState();
}

class _ClassroomStartState extends State<ClassroomStart> {
  _Scene _scene = _Scene.start;

  /// The teacher picked on "Who's teaching now?" (else the timetable's teacher for the period).
  String? _picked;

  /// Whether the set-up wizard shows (decided when the set-up has loaded).
  bool? _wizard;
  late final Timer _tick = Timer.periodic(const Duration(seconds: 30), (_) {
    if (mounted) setState(() {});
  });

  ClassroomStore get store => widget.board.classroom;

  @override
  void initState() {
    super.initState();
    store.addListener(_changed);
    unawaited(ClassroomStart.dailyBackup(store));
  }

  @override
  void dispose() {
    _tick.cancel();
    store.removeListener(_changed);
    super.dispose();
  }

  void _changed() {
    if (mounted) setState(() {});
  }

  /// Who is teaching: the picked teacher, else the teacher of the period on now (or next).
  CeTeacher? get _teacher => _picked != null ? store.teacher(_picked) : store.teacher(store.slotNowOrNext()?.teacherId);

  /// The period to start: the teacher's own now (or next), else whatever is on now.
  CeSlot? get _slot {
    final t = _teacher;
    if (t != null && !t.isGuest) {
      final own = store.slotNowOrNext(teacherId: t.id);
      if (own != null) return own;
    }
    return store.slotNow() ?? (t == null || t.isGuest ? store.slotNowOrNext() : null);
  }

  Future<void> _start() async {
    final slot = _slot;
    final teacher = _teacher ?? CeTeacher.guest;
    final cls = store.classById(slot?.classId);
    if (slot != null && cls != null) {
      startLocalClass(widget.board, teacher: teacher, cls: cls, subject: slot.subject, slot: slot);
      return;
    }
    // Nothing on the timetable now: the teacher picks the class.
    final picked = await pickClass(context, store, subject: teacher.subject);
    if (picked != null && mounted) startLocalClass(widget.board, teacher: teacher, cls: picked.$1, subject: picked.$2);
  }

  Future<void> _practice() async {
    final cls = store.classById(_slot?.classId) ?? store.classes.firstOrNull ?? const CeClass(id: 'practice', year: 1, section: 'A');
    startLocalClass(widget.board, teacher: _teacher ?? CeTeacher.guest, cls: cls, subject: _slot?.subject ?? _teacher?.subject ?? '', practice: true);
  }

  Future<void> _settings() async {
    if (await askSchoolPin(context, store) && mounted) {
      await openClassroomSettings(
        context,
        store,
        // Settings → Advanced: pairing with the Teacher App, for a college on the ERP.
        onPair: () {
          Navigator.of(context).popUntil((r) => r.isFirst);
          if (mounted) setState(() => _scene = _Scene.pair);
        },
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    // A board nobody has set up: the set-up wizard first (P1 item 10). Decided once, so the
    // wizard stays while its first steps fill in the college.
    _wizard ??= store.loaded ? store.needsSetup && store.problem == null : null;
    if (_wizard ?? false) {
      return CeSetupWizard(
        key: const Key('ce-first-run'),
        store: store,
        onDone: (tour) {
          if (mounted) setState(() => _wizard = false);
          if (tour) unawaited(_practice());
        },
      );
    }
    final child = switch (_scene) {
      _Scene.start => CeStartScreen(
        store: store,
        board: widget.board,
        teacher: _teacher,
        slot: _slot,
        onStart: () => unawaited(_start()),
        onWho: () => setState(() => _scene = _Scene.who),
        onPractice: () => unawaited(_practice()),
        onSettings: () => unawaited(_settings()),
      ),
      _Scene.who => CeWhoScreen(
        store: store,
        selected: _teacher?.id,
        slot: _slot,
        onPick: (t) => setState(() => _picked = t.id),
        onBack: () => setState(() => _scene = _Scene.start),
        onStart: () => unawaited(_start()),
      ),
      _Scene.pair => Stack(
        children: [
          Positioned.fill(child: EnrollScreen(controller: widget.board)),
          Positioned(
            left: Kx.s16,
            top: Kx.s16,
            child: SafeArea(
              child: OutlinedButton.icon(
                key: const Key('ce-pair-back'),
                style: ceSoftButton(),
                onPressed: () => setState(() => _scene = _Scene.start),
                icon: const Icon(Icons.arrow_back),
                label: Text(context.ce('Back')),
              ),
            ),
          ),
        ],
      ),
    };
    final problem = store.problem;
    return Theme(
      data: ceTheme(context),
      // A Scaffold for the start screens' messages (Undo after removing a teacher).
      child: Scaffold(
        backgroundColor: CeC.page,
        body: problem == null || _scene == _Scene.pair
            ? child
            : Stack(
                children: [
                  Positioned.fill(child: child),
                  Positioned(
                    left: 24,
                    right: 24,
                    top: 104,
                    child: Center(
                      child: CeSetupProblemBanner(
                        problem: problem,
                        onKeep: () => unawaited(store.acceptRecovered()),
                        onRestore: ClassroomStart.restoreBackup == null ? null : () => unawaited(ClassroomStart.restoreBackup!(context, store)),
                      ),
                    ),
                  ),
                ],
              ),
      ),
    );
  }
}

/// The top strip of the start screens: the brand, "Works offline", the college and Settings.
class _TopStrip extends StatelessWidget {
  const _TopStrip({required this.store, this.onSettings, this.board});

  final ClassroomStore store;
  final VoidCallback? onSettings;

  /// For the ಕನ್ನಡ / English switch.
  final BoardController? board;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(48, 32, 48, 0),
    child: Row(
      children: [
        ceBrand(),
        const SizedBox(width: 24),
        if (board != null) CeLanguageSwitch(board: board!),
        const SizedBox(width: 16),
        // The pills give way (with an ellipsis) before the buttons do.
        Expanded(
          child: Row(
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              Flexible(child: cePill(context.ce('Works offline · saved on this board'), icon: Icons.cloud_off_outlined, bg: Colors.white)),
              if (store.college.isNotEmpty) ...[const SizedBox(width: 12), Flexible(child: cePill(store.college, icon: Icons.account_balance_outlined, bg: Colors.white, key: const Key('ce-college')))],
            ],
          ),
        ),
        if (onSettings != null) ...[
          const SizedBox(width: 12),
          Tooltip(
            message: context.ce('College settings'),
            child: OutlinedButton.icon(
              key: const Key('ce-settings'),
              style: ceSoftButton().copyWith(minimumSize: const WidgetStatePropertyAll(Size(64, 64))),
              onPressed: onSettings,
              icon: const Icon(Icons.settings_outlined),
              label: Text(context.ce('Settings')),
            ),
          ),
        ],
      ],
    ),
  );
}

String _greeting(BuildContext context, DateTime t) => t.hour < 12 ? context.ce('Good morning') : (t.hour < 17 ? context.ce('Good afternoon') : context.ce('Good evening'));

/// "2nd" (English) or "2ನೇ" (Kannada).
String _ordinal(BuildContext context, int n) => context.ceKannada ? '$nನೇ' : '$n${n % 100 >= 11 && n % 100 <= 13 ? 'th' : const ['th', 'st', 'nd', 'rd', 'th', 'th', 'th', 'th', 'th', 'th'][n % 10]}';

/// Screen 01: "Start my class" for the period on now.
class CeStartScreen extends StatelessWidget {
  const CeStartScreen({
    super.key,
    required this.store,
    required this.teacher,
    required this.slot,
    required this.onStart,
    required this.onWho,
    required this.onPractice,
    this.onSettings,
    this.board,
  });

  final ClassroomStore store;
  final CeTeacher? teacher;
  final CeSlot? slot;
  final VoidCallback onStart, onWho, onPractice;
  final VoidCallback? onSettings;

  /// For the ಕನ್ನಡ / English switch (none in tests that pump the screen alone).
  final BoardController? board;

  @override
  Widget build(BuildContext context) {
    final now = store.now();
    final s = slot;
    final cls = store.classById(s?.classId);
    final onNow = s != null && s.covers(now);
    final name = teacher == null || teacher!.isGuest ? null : teacher!.firstName;
    final day = ceDay(context, now.weekday);
    final subline = s == null
        ? (store.slots.isEmpty ? context.ce('{day}. Add your timetable in Settings, or start a class now.', {'day': day}) : context.ce('{day}. No more periods on your timetable today.', {'day': day}))
        : onNow
        ? context.ce('{day}, {nth} period. Your class is ready on this board.', {'day': day, 'nth': _ordinal(context, store.periodNumber(s))})
        : context.ce('{day}. Your next period starts at {time}.', {'day': day, 'time': CeSlot.short(s.start)});
    final later = [
      for (final x in store.today(teacherId: teacher == null || teacher!.isGuest ? null : teacher!.id))
        if (x.startMinute > (s?.startMinute ?? now.hour * 60 + now.minute) && x.id != s?.id) x,
    ].take(3).toList();
    return Material(
      color: CeC.page,
      child: LayoutBuilder(
        builder: (context, box) {
          final side = ((box.maxWidth - 1520) / 2).clamp(24.0, 200.0);
          return SingleChildScrollView(
            child: ConstrainedBox(
              constraints: BoxConstraints(minHeight: box.maxHeight),
              child: IntrinsicHeight(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    _TopStrip(store: store, onSettings: onSettings, board: board),
                    const SizedBox(height: 56),
                    Padding(
                      padding: EdgeInsets.symmetric(horizontal: side),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(name == null ? _greeting(context, now) : '${_greeting(context, now)}, $name', key: const Key('ce-greeting'), style: ceHeading(44, w: FontWeight.w400)),
                          const SizedBox(height: 8),
                          Text(subline, style: ceText(20)),
                          const SizedBox(height: 36),
                          _NowCard(store: store, slot: s, cls: cls, onNow: onNow, teacher: teacher, onStart: onStart),
                          if (later.isNotEmpty) ...[
                            const SizedBox(height: 40),
                            Text(context.ce('Later today'), style: ceHeading(24)),
                            const SizedBox(height: 16),
                            Row(
                              children: [
                                for (final (i, x) in later.indexed) ...[
                                  if (i > 0) const SizedBox(width: 20),
                                  Expanded(child: _LaterCard(store: store, slot: x, index: i)),
                                ],
                                for (var i = later.length; i < 3; i++) ...[const SizedBox(width: 20), const Expanded(child: SizedBox())],
                              ],
                            ),
                          ],
                        ],
                      ),
                    ),
                    const Spacer(),
                    const SizedBox(height: 24),
                    Padding(
                      padding: EdgeInsets.fromLTRB(side, 0, side, 40),
                      child: Wrap(
                        spacing: 16,
                        runSpacing: 12,
                        crossAxisAlignment: WrapCrossAlignment.center,
                        alignment: WrapAlignment.spaceBetween,
                        children: [
                          Wrap(
                            spacing: 16,
                            runSpacing: 12,
                            children: [
                              OutlinedButton.icon(
                                key: const Key('ce-who'),
                                onPressed: onWho,
                                style: ceSoftButton(),
                                icon: const Icon(Icons.people_alt_outlined),
                                label: Text(name == null ? context.ce('Choose who’s teaching') : context.ce('Not {name}? Choose who’s teaching', {'name': name})),
                              ),
                              OutlinedButton.icon(key: Key('ce-practice'), onPressed: onPractice, style: ceSoftButton(), icon: Icon(Icons.gesture), label: Text(context.ce('Practice board'))),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

class _NowCard extends StatelessWidget {
  const _NowCard({required this.store, required this.slot, required this.cls, required this.onNow, required this.teacher, required this.onStart});

  final ClassroomStore store;
  final CeSlot? slot;
  final CeClass? cls;
  final bool onNow;
  final CeTeacher? teacher;
  final VoidCallback onStart;

  @override
  Widget build(BuildContext context) {
    final s = slot;
    final c = cls;
    final extra = c == null || s == null ? null : ClassroomHooks.nextLessonLine?.call(c, s.subject);
    final details = [
      ?extra,
      if (c != null) ceStudents(context, c.rollCount),
    ].join(' · ');
    return Container(
      key: const Key('ce-now-card'),
      padding: const EdgeInsets.fromLTRB(44, 40, 44, 40),
      decoration: ceCard(r: 32),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (s != null)
                  Wrap(
                    spacing: 10,
                    runSpacing: 8,
                    children: [
                      cePill('${onNow ? context.ce('Now') : context.ce('Next')} · ${CeSlot.short(s.start)} – ${CeSlot.short(s.end)}', icon: Icons.schedule, bg: CeC.mint),
                      if (s.room.isNotEmpty) cePill(s.room, icon: Icons.meeting_room_outlined, bg: CeC.blue),
                      cePill(context.ce('From your timetable'), icon: Icons.event_note_outlined, bg: CeC.lavender),
                    ],
                  )
                else
                  cePill(context.ce('Not on the timetable'), icon: Icons.event_busy_outlined, bg: CeC.butter),
                const SizedBox(height: 28),
                Text(
                  s != null && c != null ? [c.name, s.subject].where((x) => x.isNotEmpty).join(' · ') : context.ce('Teach any class now'),
                  key: const Key('ce-now-class'),
                  style: ceHeading(48),
                ),
                const SizedBox(height: 10),
                if (s != null && s.topic.isNotEmpty) ...[Text(s.topic, style: ceText(24, w: FontWeight.w500, c: CeC.navy)), const SizedBox(height: 6)],
                Text(s == null ? context.ce('Pick the class and subject, and the board opens for it.') : details, style: ceText(18)),
              ],
            ),
          ),
          const SizedBox(width: 32),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              FilledButton.icon(
                key: const Key('ce-start-class'),
                onPressed: onStart,
                style: FilledButton.styleFrom(
                  backgroundColor: CeC.accent,
                  foregroundColor: Colors.white,
                  minimumSize: const Size(380, 96),
                  shape: const StadiumBorder(),
                  textStyle: ceText(28, w: FontWeight.w600),
                ),
                icon: const Icon(Icons.play_arrow_rounded, size: 40),
                label: Text(context.ce('Start my class')),
              ),
              const SizedBox(height: 16),
              Text(s == null ? context.ce('Opens the board for the class you pick') : context.ce('Opens the board with today’s lesson ready'), style: ceText(15)),
            ],
          ),
        ],
      ),
    );
  }
}

const _laterIcons = [Icons.bolt_outlined, Icons.straighten, Icons.edit_note, Icons.science_outlined, Icons.functions, Icons.menu_book_outlined];

class _LaterCard extends StatelessWidget {
  const _LaterCard({required this.store, required this.slot, required this.index});

  final ClassroomStore store;
  final CeSlot slot;
  final int index;

  @override
  Widget build(BuildContext context) {
    final c = store.classById(slot.classId);
    final title = [c?.name, slot.subject].whereType<String>().where((x) => x.isNotEmpty).join(' · ');
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: ceCard(color: const [CeC.peach, CeC.butter, CeC.blue][index % 3], shadow: false),
      child: Row(
        children: [
          ceIconDot(_laterIcons[index % _laterIcons.length], size: 52),
          const SizedBox(width: 18),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('${CeSlot.short(slot.start)} – ${CeSlot.short(slot.end)}', style: ceText(15, w: FontWeight.w600, c: CeC.navy.withValues(alpha: 0.75))),
                const SizedBox(height: 4),
                Text(title, maxLines: 1, overflow: TextOverflow.ellipsis, style: ceHeading(21)),
                const SizedBox(height: 2),
                Text(slot.topic.isEmpty ? (slot.room.isEmpty ? ' ' : slot.room) : slot.topic, maxLines: 1, overflow: TextOverflow.ellipsis, style: ceText(15)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Screen 02: the teachers kept on this board, "Add a teacher" and "Guest teacher".
class CeWhoScreen extends StatelessWidget {
  const CeWhoScreen({super.key, required this.store, required this.selected, required this.slot, required this.onPick, required this.onBack, required this.onStart});

  final ClassroomStore store;
  final String? selected;
  final CeSlot? slot;
  final ValueChanged<CeTeacher> onPick;
  final VoidCallback onBack, onStart;

  @override
  Widget build(BuildContext context) {
    final t = store.teacher(selected);
    final c = store.classById(slot?.classId);
    final summary = [
      ?t?.name,
      if (c != null) [c.name, slot!.subject].where((x) => x.isNotEmpty).join(' · ') + (slot!.covers(store.now()) ? context.ce(', now') : context.ce(', at {time}', {'time': CeSlot.short(slot!.start)})),
    ].join(' · ');
    return Material(
      color: CeC.page,
      child: LayoutBuilder(
        builder: (context, box) {
          final side = ((box.maxWidth - 1520) / 2).clamp(24.0, 200.0);
          final gridW = (box.maxWidth - 2 * (side + 30)).clamp(300.0, 470.0 * 3 + 48);
          final cols = gridW >= 900 ? 3 : (gridW >= 600 ? 2 : 1);
          final cardW = (gridW - 24 * (cols - 1)) / cols;
          return Column(
            children: [
              _TopStrip(store: store),
              Expanded(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.only(top: 64, bottom: 24),
                  child: Column(
                    children: [
                      Text(context.ce('Who’s teaching now?'), style: ceHeading(48, w: FontWeight.w400)),
                      const SizedBox(height: 12),
                      Text(context.ce('Tap your card. No password on this board — your lessons and settings open for you.'), textAlign: TextAlign.center, style: ceText(20)),
                      const SizedBox(height: 48),
                      SizedBox(
                        width: gridW,
                        child: Wrap(
                          spacing: 24,
                          runSpacing: 24,
                          children: [
                            for (final x in store.teachers)
                              _TeacherCard(
                                key: Key('ce-teacher-${x.id}'),
                                teacher: x,
                                classes: store.classesOf(x.id),
                                width: cardW,
                                selected: x.id == selected,
                                onTap: () => onPick(x),
                                onEdit: () => unawaited(editTeacher(context, store, x)),
                              ),
                            _ActionCard(
                              key: const Key('ce-add-teacher'),
                              width: cardW,
                              icon: Icons.person_add_alt_1_outlined,
                              label: context.ce('Add a teacher'),
                              onTap: () async {
                                final added = await editTeacher(context, store, null);
                                if (added != null) onPick(added);
                              },
                            ),
                            _ActionCard(
                              key: const Key('ce-guest'),
                              width: cardW,
                              icon: Icons.badge_outlined,
                              label: context.ce('Guest teacher'),
                              selected: selected == CeTeacher.guestId,
                              onTap: () => onPick(CeTeacher.guest),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              Padding(
                padding: EdgeInsets.fromLTRB(side, 0, side, 48),
                child: Row(
                  children: [
                    OutlinedButton.icon(key: Key('ce-who-back'), onPressed: onBack, style: ceSoftButton(), icon: Icon(Icons.arrow_back), label: Text(context.ce('Back'))),
                    const SizedBox(width: 20),
                    Expanded(child: Text(summary, key: const Key('ce-who-summary'), textAlign: TextAlign.right, overflow: TextOverflow.ellipsis, style: ceText(17, c: CeC.navy))),
                    const SizedBox(width: 20),
                    FilledButton.icon(key: Key('ce-who-start'), onPressed: onStart, style: ceBigButton(), icon: Icon(Icons.play_arrow_rounded), label: Text(context.ce('Start my class'))),
                  ],
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _TeacherCard extends StatelessWidget {
  const _TeacherCard({super.key, required this.teacher, required this.classes, required this.width, required this.selected, required this.onTap, required this.onEdit});

  final CeTeacher teacher;
  final String classes;
  final double width;
  final bool selected;
  final VoidCallback onTap, onEdit;

  @override
  Widget build(BuildContext context) => Semantics(
    button: true,
    selected: selected,
    label: [teacher.name, teacher.subject, classes].where((x) => x.isNotEmpty).join(', '),
    hint: context.ce('Hold to change'),
    child: SizedBox(
    width: width,
    height: 156,
    child: Material(
      color: CeC.pastel(teacher.colour),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(28), side: BorderSide(color: selected ? CeC.accent : Colors.transparent, width: 3)),
      elevation: selected ? 3 : 0,
      shadowColor: const Color(0x33000000),
      child: InkWell(
        borderRadius: BorderRadius.circular(28),
        onTap: onTap,
        onLongPress: onEdit,
        child: Padding(
          padding: const EdgeInsets.all(26),
          child: Row(
            children: [
              Container(
                width: 88,
                height: 88,
                alignment: Alignment.center,
                decoration: const BoxDecoration(color: Colors.white, shape: BoxShape.circle),
                child: Text(KxAvatar.initials(teacher.name), style: ceHeading(32)),
              ),
              const SizedBox(width: 22),
              Expanded(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(teacher.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: ceHeading(26)),
                    if (teacher.subject.isNotEmpty) ...[const SizedBox(height: 4), Text(teacher.subject, style: ceText(17, w: FontWeight.w600, c: CeC.navy))],
                    if (classes.isNotEmpty) ...[const SizedBox(height: 2), Text(classes, maxLines: 1, overflow: TextOverflow.ellipsis, style: ceText(15))],
                  ],
                ),
              ),
              if (selected) ...[
                IconButton(key: Key('ce-teacher-edit'), tooltip: context.ce('Edit'), onPressed: onEdit, icon: const Icon(Icons.edit_outlined, color: CeC.muted)),
                const Icon(Icons.check_circle, color: CeC.accent, size: 34),
              ],
            ],
          ),
        ),
      ),
    ),
    ),
  );
}

class _ActionCard extends StatelessWidget {
  const _ActionCard({super.key, required this.width, required this.icon, required this.label, required this.onTap, this.selected = false});

  final double width;
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final bool selected;

  @override
  Widget build(BuildContext context) => SizedBox(
    width: width,
    height: 156,
    child: Material(
      color: Colors.white,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(28), side: BorderSide(color: selected ? CeC.accent : CeC.line, width: selected ? 3 : 2)),
      child: InkWell(
        borderRadius: BorderRadius.circular(28),
        onTap: onTap,
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            ceIconDot(icon, bg: CeC.page, size: 56),
            const SizedBox(width: 16),
            Text(label, style: ceHeading(24)),
            if (selected) ...[const SizedBox(width: 16), const Icon(Icons.check_circle, color: CeC.accent, size: 30)],
          ],
        ),
      ),
    ),
  );
}

/// Add (when [t] is null) or edit a teacher: name and subject. Adding needs no PIN (a new
/// teacher adds themselves on "Who's teaching now?"); changing or removing one needs the school
/// PIN unless [pinChecked] (College settings asked for it already). Removing asks first, says
/// what happens to their periods, and offers Undo for 10 seconds. Answers the teacher added or
/// changed.
Future<CeTeacher?> editTeacher(BuildContext context, ClassroomStore store, CeTeacher? t, {bool pinChecked = false}) async {
  if (t != null && !pinChecked && !await askSchoolPin(context, store, reason: context.ce('Changing or removing a teacher needs the school PIN.'))) return null;
  if (!context.mounted) return null;
  final name = TextEditingController(text: t?.name ?? '');
  final subject = TextEditingController(text: t?.subject ?? '');
  final result = await showDialog<String>(
    context: context,
    builder: (ctx) => AlertDialog(
      key: const Key('ce-teacher-dialog'),
      title: Text(t == null ? context.ce('Add a teacher') : context.ce('Edit {name}', {'name': t.name})),
      content: SizedBox(
        width: 480,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(key: Key('ce-teacher-name'), controller: name, autofocus: true, textCapitalization: TextCapitalization.words, decoration: InputDecoration(labelText: context.ce('Name'))),
            const SizedBox(height: Kx.s12),
            TextField(key: Key('ce-teacher-subject'), controller: subject, textCapitalization: TextCapitalization.words, decoration: InputDecoration(labelText: context.ce('Subject (e.g. Physics)'))),
          ],
        ),
      ),
      actionsAlignment: MainAxisAlignment.spaceBetween,
      actions: [
        if (t != null) ceRemoveAction(key: Key('ce-teacher-remove'), label: context.ce('Remove teacher…'), onPressed: () => Navigator.pop(ctx, 'remove')) else const SizedBox(),
        Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: Text(context.ce('Cancel'))),
            const SizedBox(width: Kx.s8),
            FilledButton(key: Key('ce-teacher-save'), onPressed: () => Navigator.pop(ctx, 'save'), child: Text(context.ce('Save'))),
          ],
        ),
      ],
    ),
  );
  if (!context.mounted) return null;
  if (result == 'remove' && t != null) {
    await removeTeacherAsking(context, store, t);
    return null;
  }
  if (result != 'save' || name.text.trim().isEmpty) return null;
  if (t == null) return store.addTeacher(name.text, subject: subject.text);
  final updated = t.copyWith(name: name.text.trim(), subject: subject.text.trim());
  await store.updateTeacher(updated);
  return updated;
}

/// "Remove Lakshmi Rao?" with what happens to their periods; then Undo for 10 seconds.
Future<bool> removeTeacherAsking(BuildContext context, ClassroomStore store, CeTeacher t) async {
  final periods = store.slots.where((s) => s.teacherId == t.id).length;
  final ok = await ceConfirmRemove(
    context,
    title: context.ce('Remove {name}?', {'name': t.name}),
    body: [
      context.ce('{name}’s card goes from “Who’s teaching now?”.', {'name': t.firstName}),
      if (periods == 1) context.ce('Their 1 period stays on the timetable with no teacher, until you choose one in Settings.') else if (periods > 1) context.ce('Their {n} periods stay on the timetable with no teacher, until you choose one in Settings.', {'n': periods}),
      context.ce('Boards they saved stay on this board.'),
    ].join(' '),
    confirm: context.ce('Remove teacher'),
  );
  if (!ok || !context.mounted) return false;
  final before = store.setup;
  await store.removeTeacher(t.id);
  if (context.mounted) ceUndoSnack(context, context.ce('{name} removed.', {'name': t.name}), () => unawaited(store.replace(before)));
  return true;
}

/// Off the timetable: which class, and the subject. Null when cancelled.
Future<(CeClass, String)?> pickClass(BuildContext context, ClassroomStore store, {String subject = ''}) async {
  if (store.classes.isEmpty) {
    await showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(context.ce('No classes on this board yet')),
        content: Text(context.ce('Add the college’s classes in Settings (the gear at the top right).')),
        actions: [TextButton(onPressed: () => Navigator.pop(ctx), child: Text(context.ce('OK')))],
      ),
    );
    return null;
  }
  var picked = store.classes.first;
  final subj = TextEditingController(text: subject);
  final ok = await showDialog<bool>(
    context: context,
    builder: (ctx) => StatefulBuilder(
      builder: (ctx, set) => AlertDialog(
        key: const Key('ce-pick-class'),
        title: Text(context.ce('Which class are you teaching?')),
        content: SizedBox(
          width: 560,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final c in store.classes)
                    ChoiceChip(key: Key('ce-pick-${c.id}'), label: Text(c.name), selected: c.id == picked.id, onSelected: (_) => set(() => picked = c)),
                ],
              ),
              const SizedBox(height: Kx.s16),
              TextField(key: Key('ce-pick-subject'), controller: subj, textCapitalization: TextCapitalization.words, decoration: InputDecoration(labelText: context.ce('Subject'))),
            ],
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(context.ce('Cancel'))),
          FilledButton(key: Key('ce-pick-start'), onPressed: () => Navigator.pop(ctx, true), child: Text(context.ce('Start'))),
        ],
      ),
    ),
  );
  return ok == true ? (picked, subj.text.trim()) : null;
}

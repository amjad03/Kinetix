import 'dart:convert';
import 'dart:math';

import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../core/device_store.dart';

/// A teacher who uses this board (the Classroom edition keeps them on the board itself: no
/// accounts, no PIN to teach). [colour] picks the card's pastel.
@immutable
class CeTeacher {
  const CeTeacher({required this.id, required this.name, this.subject = '', this.colour = 0});

  final String id;
  final String name;
  final String subject;
  final int colour;

  static const guestId = 'guest';

  /// "Guest teacher": a substitute or a visitor, with nothing of their own kept.
  static const guest = CeTeacher(id: guestId, name: 'Guest teacher');

  bool get isGuest => id == guestId;

  /// "Lakshmi" for "Lakshmi Rao".
  String get firstName => name.trim().split(RegExp(r'\s+')).first;

  CeTeacher copyWith({String? name, String? subject, int? colour}) => CeTeacher(id: id, name: name ?? this.name, subject: subject ?? this.subject, colour: colour ?? this.colour);

  Map<String, dynamic> toJson() => {'id': id, 'name': name, 'subject': subject, 'colour': colour};

  static CeTeacher fromJson(Map<String, dynamic> j) =>
      CeTeacher(id: '${j['id']}', name: '${j['name'] ?? ''}', subject: '${j['subject'] ?? ''}', colour: (j['colour'] as num?)?.toInt() ?? 0);
}

/// One class (section) of the college: 1st or 2nd PUC and a section letter. Students are roll
/// numbers 1 to [rollCount]; the Classroom edition never keeps a student's name.
@immutable
class CeClass {
  const CeClass({required this.id, required this.year, required this.section, this.stream = '', this.rollCount = 40});

  final String id;

  /// 1 for 1st PUC (grade 11), 2 for 2nd PUC (grade 12).
  final int year;
  final String section;

  /// "Science", "Commerce", "Arts" (optional).
  final String stream;
  final int rollCount;

  static const maxRolls = 200;

  /// "1st PUC A".
  String get name => '${year == 2 ? '2nd' : '1st'} PUC $section'.trim();

  /// The class's grade: 11 or 12.
  int get grade => year == 2 ? 12 : 11;

  /// Roll numbers 1 … [rollCount].
  List<int> get rolls => [for (var i = 1; i <= rollCount; i++) i];

  CeClass copyWith({int? year, String? section, String? stream, int? rollCount}) =>
      CeClass(id: id, year: year ?? this.year, section: section ?? this.section, stream: stream ?? this.stream, rollCount: (rollCount ?? this.rollCount).clamp(1, maxRolls));

  Map<String, dynamic> toJson() => {'id': id, 'year': year, 'section': section, 'stream': stream, 'rollCount': rollCount};

  static CeClass fromJson(Map<String, dynamic> j) => CeClass(
    id: '${j['id']}',
    year: (j['year'] as num?)?.toInt() == 2 ? 2 : 1,
    section: '${j['section'] ?? ''}',
    stream: '${j['stream'] ?? ''}',
    rollCount: ((j['rollCount'] as num?)?.toInt() ?? 40).clamp(1, maxRolls),
  );
}

/// One period of the board's own timetable: on [weekday] (1 Monday … 7 Sunday) from [start] to
/// [end] ("09:50"), [teacherId] teaches [subject] to class [classId].
@immutable
class CeSlot {
  const CeSlot({required this.id, required this.weekday, required this.start, required this.end, required this.classId, required this.subject, this.teacherId, this.room = '', this.topic = ''});

  final String id;
  final int weekday;
  final String start;
  final String end;
  final String classId;
  final String subject;
  final String? teacherId;
  final String room;

  /// What the class is on ("Electric Charges and Fields"), as the teacher typed it (optional).
  final String topic;

  /// Minutes after midnight of [start] and [end].
  int get startMinute => minuteOf(start);
  int get endMinute => minuteOf(end);

  /// "09:50–10:45", the label the board's class bar reads.
  String get label => '$start–$end';

  bool covers(DateTime t) => t.weekday == weekday && startMinute <= t.hour * 60 + t.minute && t.hour * 60 + t.minute < endMinute;

  static int minuteOf(String hhmm) {
    final p = hhmm.split(':');
    if (p.length != 2) return 0;
    return (int.tryParse(p[0]) ?? 0) * 60 + (int.tryParse(p[1]) ?? 0);
  }

  /// "9:50" for "09:50" (as the start screen shows times).
  static String short(String hhmm) {
    final m = minuteOf(hhmm);
    final h = m ~/ 60 % 12 == 0 ? 12 : m ~/ 60 % 12;
    return '$h:${(m % 60).toString().padLeft(2, '0')}';
  }

  CeSlot copyWith({int? weekday, String? start, String? end, String? classId, String? subject, String? teacherId, bool clearTeacher = false, String? room, String? topic}) => CeSlot(
    id: id,
    weekday: weekday ?? this.weekday,
    start: start ?? this.start,
    end: end ?? this.end,
    classId: classId ?? this.classId,
    subject: subject ?? this.subject,
    teacherId: clearTeacher ? null : teacherId ?? this.teacherId,
    room: room ?? this.room,
    topic: topic ?? this.topic,
  );

  Map<String, dynamic> toJson() => {
    'id': id,
    'weekday': weekday,
    'start': start,
    'end': end,
    'classId': classId,
    'subject': subject,
    'teacherId': ?teacherId,
    'room': room,
    'topic': topic,
  };

  static CeSlot fromJson(Map<String, dynamic> j) => CeSlot(
    id: '${j['id']}',
    weekday: ((j['weekday'] as num?)?.toInt() ?? 1).clamp(1, 7),
    start: '${j['start'] ?? '09:00'}',
    end: '${j['end'] ?? '09:45'}',
    classId: '${j['classId'] ?? ''}',
    subject: '${j['subject'] ?? ''}',
    teacherId: j['teacherId'] as String?,
    room: '${j['room'] ?? ''}',
    topic: '${j['topic'] ?? ''}',
  );
}

/// The saved set-up could not be read when the board started ([ClassroomStore.problem]).
@immutable
class SetupProblem {
  const SetupProblem({required this.badKey, required this.usedPrevious, required this.at});

  /// Where the damaged text is kept (a `classroom.setup.bad-<ms>` setting).
  final String badKey;

  /// True: the board shows the copy from before the last change; false: the starter classes.
  final bool usedPrevious;
  final DateTime at;
}

/// Everything the Classroom edition keeps about the college on this board.
@immutable
class CeSetup {
  const CeSetup({this.college = '', this.teachers = const [], this.classes = const [], this.slots = const []});

  final String college;
  final List<CeTeacher> teachers;
  final List<CeClass> classes;
  final List<CeSlot> slots;

  /// The classes a new board starts with: 1st PUC A–C and 2nd PUC A–B, 40 roll numbers each.
  static final starter = CeSetup(
    classes: [
      for (final (y, s) in const [(1, 'A'), (1, 'B'), (1, 'C'), (2, 'A'), (2, 'B')]) CeClass(id: 'c$y${s.toLowerCase()}', year: y, section: s),
    ],
  );

  CeSetup copyWith({String? college, List<CeTeacher>? teachers, List<CeClass>? classes, List<CeSlot>? slots}) =>
      CeSetup(college: college ?? this.college, teachers: teachers ?? this.teachers, classes: classes ?? this.classes, slots: slots ?? this.slots);

  Map<String, dynamic> toJson() => {
    'v': 1,
    'college': college,
    'teachers': [for (final t in teachers) t.toJson()],
    'classes': [for (final c in classes) c.toJson()],
    'slots': [for (final s in slots) s.toJson()],
  };

  static CeSetup fromJson(Map<String, dynamic> j) {
    List<T> list<T>(String k, T Function(Map<String, dynamic>) f) => [
      for (final e in (j[k] as List?) ?? const [])
        if (e is Map) f(e.cast<String, dynamic>()),
    ];
    return CeSetup(college: '${j['college'] ?? ''}', teachers: list('teachers', CeTeacher.fromJson), classes: list('classes', CeClass.fromJson), slots: list('slots', CeSlot.fromJson));
  }
}

/// The Classroom edition's college data on this board — teachers, classes (roll numbers only),
/// the weekly timetable and the school PIN for Settings — saved with the board's own settings
/// store ([DeviceStore], shared preferences). Also the local roster API the Lessons and Class
/// tools use (README.md): [classes], [rollsOf], [currentClass], [currentTeacher].
class ClassroomStore extends ChangeNotifier {
  ClassroomStore({DeviceStore? store, DateTime Function()? now}) : _store = store ?? DeviceStore(), now = now ?? DateTime.now;

  final DeviceStore _store;

  /// The clock the timetable is read with (tests set it).
  DateTime Function() now;

  static const setupKey = 'classroom.setup';
  static const pinKey = 'classroom.pin';
  static const tourKey = 'classroom.tourSeen';
  static const simpleKey = 'classroom.showAllTools';

  /// The PIN Settings asks for until the college changes it.
  static const defaultPin = '1234';

  CeSetup setup = CeSetup.starter;
  bool loaded = false;

  /// "Show all tools" on the board (else the Simple board), remembered on the board.
  bool showAllTools = false;

  /// Whether the guided tour has been seen on this board.
  bool tourSeen = false;

  String? _pinHash;

  /// Who is teaching and which class, while a local class is open (set by [startClass]).
  CeTeacher? currentTeacher;
  CeClass? currentClass;
  CeSlot? currentSlot;
  String? currentSubject;

  List<CeTeacher> get teachers => setup.teachers;
  List<CeClass> get classes => setup.classes;
  List<CeSlot> get slots => setup.slots;
  String get college => setup.college;

  /// The copy of the set-up kept before the last change (a damaged set-up falls back to it).
  static const prevKey = '$setupKey.prev';

  /// A set-up that could not be read is kept under `classroom.setup.bad-<ms since epoch>`.
  static const badPrefix = '$setupKey.bad-';

  /// Set when the saved set-up could not be read at [load]: the start screen asks what to do.
  SetupProblem? problem;

  Future<void> load() async {
    try {
      final raw = await _store.setting(setupKey);
      if (raw != null) {
        final parsed = parseSetup(raw);
        if (parsed != null) {
          setup = parsed;
        } else {
          await _quarantine(raw);
        }
      }
      _pinHash = await _store.setting(pinKey);
      showAllTools = await _store.setting(simpleKey) == 'true';
      tourSeen = await _store.setting(tourKey) == 'true';
    } catch (e) {
      debugPrint('Classroom set-up not loaded: $e');
    }
    loaded = true;
    notifyListeners();
  }

  /// The set-up in [raw], or null when it is not one (damaged, cut short, not JSON).
  static CeSetup? parseSetup(String? raw) {
    if (raw == null || raw.trim().isEmpty) return null;
    try {
      final j = jsonDecode(raw);
      if (j is! Map || j['classes'] is! List) return null;
      return CeSetup.fromJson(j.cast<String, dynamic>());
    } catch (_) {
      return null;
    }
  }

  /// The saved set-up is damaged: its text is kept exactly as it was (never overwritten), and
  /// the board goes on with the copy from before the last change, else the starter classes,
  /// until the college decides on the start screen (keep this, or restore a backup).
  Future<void> _quarantine(String raw) async {
    final key = '$badPrefix${now().millisecondsSinceEpoch}';
    try {
      await _store.setSetting(key, raw);
    } catch (e) {
      debugPrint('Damaged set-up not kept: $e');
    }
    final prev = parseSetup(await _store.setting(prevKey));
    setup = prev ?? CeSetup.starter;
    problem = SetupProblem(badKey: key, usedPrevious: prev != null, at: now());
    debugPrint('Classroom set-up unreadable: kept as $key; ${prev != null ? 'using the copy from before the last change' : 'using the starter classes'}');
  }

  /// The college keeps the set-up showing now (the recovered copy or the starter classes): it
  /// is saved and the prompt goes. The damaged text stays under its `bad-` key.
  Future<void> acceptRecovered() async {
    problem = null;
    await _save();
  }

  /// The damaged set-ups kept on this board (newest first), for a backup or support.
  Future<List<String>> badCopies() async {
    try {
      final p = await SharedPreferences.getInstance();
      return [for (final k in p.getKeys()) if (k.startsWith('setting.$badPrefix')) k.substring('setting.'.length)]..sort((a, b) => b.compareTo(a));
    } catch (_) {
      return const [];
    }
  }

  /// Writes the set-up safely: the text is checked by reading it back, the copy before it is
  /// kept under [prevKey], then it replaces the set-up in one commit, so a failed or cut-short
  /// write never leaves the board without a readable set-up.
  Future<void> _save() async {
    notifyListeners();
    try {
      final text = jsonEncode(setup.toJson());
      if (parseSetup(text) == null) throw StateError('the set-up did not read back');
      final old = await _store.setting(setupKey);
      if (old != null && old != text && parseSetup(old) != null) await _store.setSetting(prevKey, old);
      await _store.setSetting(setupKey, text);
    } catch (e) {
      debugPrint('Classroom set-up not saved: $e');
    }
  }

  Future<void> replace(CeSetup s) {
    setup = s;
    return _save();
  }

  // --- Teachers ---------------------------------------------------------------------------

  CeTeacher? teacher(String? id) => id == CeTeacher.guestId ? CeTeacher.guest : teachers.where((t) => t.id == id).firstOrNull;

  Future<CeTeacher> addTeacher(String name, {String subject = ''}) async {
    final t = CeTeacher(id: _id('t'), name: name.trim(), subject: subject.trim(), colour: teachers.length % 6);
    setup = setup.copyWith(teachers: [...teachers, t]);
    await _save();
    return t;
  }

  Future<void> updateTeacher(CeTeacher t) => replace(setup.copyWith(teachers: [for (final x in teachers) x.id == t.id ? t : x]));

  /// Removes a teacher; their periods stay on the timetable without a teacher.
  Future<void> removeTeacher(String id) => replace(
    setup.copyWith(
      teachers: teachers.where((t) => t.id != id).toList(),
      slots: [for (final s in slots) s.teacherId == id ? s.copyWith(clearTeacher: true) : s],
    ),
  );

  // --- Classes (roll numbers only) ----------------------------------------------------------

  CeClass? classById(String? id) => classes.where((c) => c.id == id).firstOrNull;

  /// Roll numbers of a class (1 … its roll count).
  List<int> rollsOf(String classId) => classById(classId)?.rolls ?? const [];

  Future<CeClass> addClass({required int year, required String section, String stream = '', int rollCount = 40}) async {
    final c = CeClass(id: _id('c'), year: year, section: section.trim().toUpperCase(), stream: stream.trim(), rollCount: rollCount.clamp(1, CeClass.maxRolls));
    setup = setup.copyWith(classes: [...classes, c]);
    await _save();
    return c;
  }

  Future<void> updateClass(CeClass c) => replace(setup.copyWith(classes: [for (final x in classes) x.id == c.id ? c : x]));

  /// Removes a class and its periods.
  Future<void> removeClass(String id) => replace(setup.copyWith(classes: classes.where((c) => c.id != id).toList(), slots: slots.where((s) => s.classId != id).toList()));

  // --- Timetable ----------------------------------------------------------------------------

  Future<CeSlot> addSlot(CeSlot s) async {
    final slot = s.id.isEmpty ? CeSlot(id: _id('p'), weekday: s.weekday, start: s.start, end: s.end, classId: s.classId, subject: s.subject, teacherId: s.teacherId, room: s.room, topic: s.topic) : s;
    setup = setup.copyWith(slots: [...slots, slot]);
    await _save();
    return slot;
  }

  Future<void> updateSlot(CeSlot s) => replace(setup.copyWith(slots: [for (final x in slots) x.id == s.id ? s : x]));

  Future<void> removeSlot(String id) => replace(setup.copyWith(slots: slots.where((s) => s.id != id).toList()));

  /// Today's periods (of [teacherId] when given), in order.
  List<CeSlot> today({String? teacherId, DateTime? at}) {
    final t = at ?? now();
    return [
      for (final s in slots)
        if (s.weekday == t.weekday && (teacherId == null || s.teacherId == teacherId)) s,
    ]..sort((a, b) => a.startMinute.compareTo(b.startMinute));
  }

  /// The period on now (the teacher's own when [teacherId] is given).
  CeSlot? slotNow({String? teacherId, DateTime? at}) {
    final t = at ?? now();
    return today(teacherId: teacherId, at: t).where((s) => s.covers(t)).firstOrNull;
  }

  /// The period on now, else the next one today (the teacher's own when [teacherId] is given).
  CeSlot? slotNowOrNext({String? teacherId, DateTime? at}) {
    final t = at ?? now();
    final m = t.hour * 60 + t.minute;
    final list = today(teacherId: teacherId, at: t);
    return list.where((s) => s.covers(t)).firstOrNull ?? list.where((s) => s.startMinute > m).firstOrNull;
  }

  /// Which period of the day [s] is (1st, 2nd …), counting distinct start times today.
  int periodNumber(CeSlot s) {
    final starts = {for (final x in slots.where((x) => x.weekday == s.weekday)) x.startMinute}.toList()..sort();
    return starts.indexOf(s.startMinute) + 1;
  }

  /// The classes a teacher has on the timetable ("1st PUC A, C · 2nd PUC B").
  String classesOf(String teacherId) {
    final byYear = <int, Set<String>>{};
    for (final s in slots.where((s) => s.teacherId == teacherId)) {
      final c = classById(s.classId);
      if (c != null) (byYear[c.year] ??= <String>{}).add(c.section);
    }
    return [
      for (final y in [1, 2])
        if (byYear[y] != null) '${y == 2 ? '2nd' : '1st'} PUC ${(byYear[y]!.toList()..sort()).join(', ')}',
    ].join(' · ');
  }

  // --- The open class -----------------------------------------------------------------------

  /// Records who is teaching which class now (the board opens it, see `startLocalClass`).
  void startClass({required CeTeacher teacher, required CeClass cls, required String subject, CeSlot? slot}) {
    currentTeacher = teacher;
    currentClass = cls;
    currentSubject = subject;
    currentSlot = slot;
    notifyListeners();
  }

  void endClass() {
    currentTeacher = null;
    currentClass = null;
    currentSubject = null;
    currentSlot = null;
    notifyListeners();
  }

  // --- School PIN, tour, the Simple board ---------------------------------------------------

  /// Whether [pin] opens Settings (1234 until the college sets its own).
  bool checkPin(String pin) => _pinHash == null ? pin == defaultPin : _hash(pin) == _pinHash;

  bool get pinIsDefault => _pinHash == null;

  Future<void> setPin(String pin) async {
    _pinHash = _hash(pin);
    try {
      await _store.setSetting(pinKey, _pinHash!);
    } catch (e) {
      debugPrint('PIN not saved: $e');
    }
    notifyListeners();
  }

  Future<void> setShowAllTools(bool v) async {
    showAllTools = v;
    notifyListeners();
    try {
      await _store.setSetting(simpleKey, '$v');
    } catch (_) {}
  }

  Future<void> markTourSeen() async {
    tourSeen = true;
    try {
      await _store.setSetting(tourKey, 'true');
    } catch (_) {}
  }

  static String _hash(String pin) => sha256.convert(utf8.encode('zynetix-classroom:$pin')).toString();

  final _random = Random();
  String _id(String prefix) => '$prefix${DateTime.now().microsecondsSinceEpoch.toRadixString(36)}${_random.nextInt(1 << 16).toRadixString(36)}';
}

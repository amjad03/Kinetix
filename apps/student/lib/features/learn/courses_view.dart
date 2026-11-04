import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:zynetix_ui/zynetix_ui.dart';

import '../../core/api.dart';
import '../../core/lms.dart';
import '../../core/lms_offline.dart';
import '../../l10n/l10n.dart';
import '../../widgets/common.dart';
import 'forum_screen.dart';

/// Opens a web address outside the app (meeting links, files, the SCORM player); tests replace it.
typedef UrlOpener = Future<bool> Function(Uri url);
Future<bool> _openExternally(Uri url) => launchUrl(url, mode: LaunchMode.externalApplication);

/// "Courses" in My Learning: live classes coming up, certificates and paths, and the published course for each
/// subject with the student's progress and running grade. With [prefs] the courses are also kept on the phone, so
/// they open without a connection and progress made offline is sent later.
class CoursesView extends StatefulWidget {
  const CoursesView({super.key, required this.api, required this.studentId, this.prefs, this.open = _openExternally});

  final StudentApi api;
  final String studentId;
  final SharedPreferences? prefs;
  final UrlOpener open;

  @override
  State<CoursesView> createState() => _CoursesViewState();
}

class _CoursesViewState extends State<CoursesView> {
  List<LmsCourseSummary>? _items;
  List<LiveClassRow> _live = const [];
  ApiException? _error;
  bool _offline = false;
  late final LmsOfflineStore? _store = widget.prefs == null ? null : LmsOfflineStore(widget.prefs!, widget.studentId);

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final r = await widget.api.lmsCourses(widget.studentId);
      if (mounted) {
        setState(() {
          _items = r;
          _offline = false;
        });
      }
      final store = _store;
      if (store != null) {
        await store.sync(widget.api);
        await store.refresh(widget.api);
      }
      final live = await widget.api.myLiveClasses(widget.studentId);
      if (mounted) setState(() => _live = live);
    } on ApiException catch (e) {
      final store = _store;
      if (e.status == 0 && store != null && store.savedAt != null) {
        if (mounted) {
          setState(() {
            _items = store.courses();
            _offline = true;
          });
        }
      } else if (mounted) {
        setState(() => _error = e);
      }
    }
  }

  Future<void> _join(LiveClassRow r) async {
    final l = context.l10n;
    final messenger = ScaffoldMessenger.of(context);
    try {
      final url = await widget.api.joinLiveClass(r.id);
      final ok = await widget.open(Uri.parse(url));
      if (!ok) messenger.showSnackBar(SnackBar(content: Text(l.lpOpenFailed)));
      _load();
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final items = _items;
    final ml = MaterialLocalizations.of(context);
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(Kx.s16),
        children: [
          if (_error != null) ErrorBanner(_error!, onRetry: _load),
          if (_offline && _store?.savedAt != null)
            Padding(
              padding: const EdgeInsets.only(bottom: Kx.s12),
              child: LmsNotice(key: const Key('offlineCopy'), tone: KxTone.warning, message: '${l.lpOfflineCopy('${ml.formatShortDate(_store!.savedAt!)} ${ml.formatTimeOfDay(TimeOfDay.fromDateTime(_store.savedAt!))}')}${_store.pending().isEmpty ? '' : '. ${l.lpPendingSync(_store.pending().length)}'}'),
            ),
          if (items == null && _error == null) const KxLoading(),
          if (_live.isNotEmpty) ...[
            Text(l.lpLive, style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w600)),
            const SizedBox(height: Kx.s8),
            for (final r in _live)
              Padding(
                padding: const EdgeInsets.only(bottom: Kx.s8),
                child: KxCard(
                  key: Key('live-${r.id}'),
                  child: Row(
                    children: [
                      const Icon(Icons.videocam_outlined),
                      const SizedBox(width: Kx.s12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(r.title, style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w600)),
                            Text(l.lpLiveAt(r.course, '${ml.formatShortDate(r.startsAt)} ${ml.formatTimeOfDay(TimeOfDay.fromDateTime(r.startsAt))}'), style: context.text.bodySmall?.copyWith(color: context.colors.onSurfaceVariant)),
                          ],
                        ),
                      ),
                      if (r.open) FilledButton(key: Key('join-${r.id}'), onPressed: () => _join(r), child: Text(r.joined ? l.lpJoined : l.lpJoin)) else Flexible(child: Text(l.lpLiveOpensSoon, style: context.text.bodySmall, textAlign: TextAlign.end)),
                    ],
                  ),
                ),
              ),
            const SizedBox(height: Kx.s8),
          ],
          if (items != null && !_offline)
            Padding(
              padding: const EdgeInsets.only(bottom: Kx.s12),
              child: KxCard(
                key: const Key('openAchievements'),
                onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => AchievementsScreen(api: widget.api, studentId: widget.studentId, open: widget.open))),
                child: Row(children: [const Icon(Icons.workspace_premium_outlined), const SizedBox(width: Kx.s12), Expanded(child: Text(l.lpAchievements, style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w600))), const Icon(Icons.chevron_right)]),
              ),
            ),
          if (items != null && items.isEmpty) KxEmptyState(icon: Icons.school_outlined, message: l.coursesNone),
          if (items != null)
            for (final c in items) ...[
              KxCard(
                key: Key('course-${c.courseId}'),
                onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => CourseScreen(api: widget.api, studentId: widget.studentId, summary: c, store: _store, open: widget.open))),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(c.title, style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w600)),
                              Text(l.courseModulesCount(c.moduleCount), style: context.text.bodySmall?.copyWith(color: context.colors.onSurfaceVariant)),
                            ],
                          ),
                        ),
                        if (!_offline) GradeChip(overall: c.overall, letter: c.letter),
                      ],
                    ),
                    if (c.itemsTotal > 0) ...[
                      const SizedBox(height: Kx.s8),
                      LinearProgressIndicator(value: c.completionPct / 100, minHeight: 6, borderRadius: BorderRadius.circular(3)),
                      const SizedBox(height: Kx.s4),
                      Text(l.lpProgress(c.itemsDone, c.itemsTotal), style: context.text.bodySmall),
                    ],
                  ],
                ),
              ),
              const SizedBox(height: Kx.s12),
            ],
        ],
      ),
    );
  }
}

/// The running grade as "A · 82%", or a dash before anything is graded.
class GradeChip extends StatelessWidget {
  const GradeChip({super.key, required this.overall, required this.letter});

  final double? overall;
  final String? letter;

  @override
  Widget build(BuildContext context) {
    final t = kxTone(context, overall == null ? KxTone.neutral : KxTone.success);
    return Pill(overall == null ? '-' : '$letter · ${overall!.toStringAsFixed(overall! % 1 == 0 ? 0 : 1)}%', background: t.bg, foreground: t.fg);
  }
}

/// A tinted one-line notice (offline copy, prerequisites, quiz rules).
class LmsNotice extends StatelessWidget {
  const LmsNotice({super.key, required this.message, this.tone = KxTone.warning});

  final String message;
  final KxTone tone;

  @override
  Widget build(BuildContext context) {
    final t = kxTone(context, tone);
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: Kx.s12, vertical: Kx.s8),
      decoration: BoxDecoration(color: t.bg, borderRadius: BorderRadius.circular(8)),
      child: Text(message, style: context.text.bodyMedium?.copyWith(color: t.fg)),
    );
  }
}

IconData _kindIcon(String kind) => switch (kind) {
  'page' || 'topic' => Icons.article_outlined,
  'video' => Icons.play_circle_outline,
  'file' || 'pdf' || 'ppt' => Icons.description_outlined,
  'link' || 'case_study' => Icons.link,
  'scorm' || 'simulation' || 'virtual_lab' => Icons.touch_app_outlined,
  'quiz' || 'assessment' => Icons.quiz_outlined,
  'live' => Icons.videocam_outlined,
  'homework' || 'worksheet' => Icons.assignment_outlined,
  _ => Icons.folder_outlined,
};

class CourseScreen extends StatefulWidget {
  const CourseScreen({super.key, required this.api, required this.studentId, required this.summary, this.store, this.open = _openExternally});

  final StudentApi api;
  final String studentId;
  final LmsCourseSummary summary;
  final LmsOfflineStore? store;
  final UrlOpener open;

  @override
  State<CourseScreen> createState() => _CourseScreenState();
}

class _CourseScreenState extends State<CourseScreen> {
  LmsCourseDetail? _course;
  ApiException? _error;
  bool _claimed = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final r = await widget.api.lmsCourse(widget.summary.courseId, widget.studentId);
      if (mounted) setState(() => _course = r);
    } on ApiException catch (e) {
      final copy = e.status == 0 ? widget.store?.course(widget.summary.courseId) : null;
      if (mounted) setState(() => copy != null ? _course = copy : _error = e);
    }
  }

  /// Records progress; without a connection it is kept and sent later.
  Future<void> _progress(LmsItem i, {bool completed = false}) async {
    try {
      await widget.api.lmsItemProgress(i.id, completed: completed);
    } on ApiException catch (e) {
      if (e.status == 0 && widget.store != null) {
        await widget.store!.queue(i.id, completed: completed);
      } else {
        rethrow;
      }
    }
  }

  Future<void> _openItem(LmsItem i) async {
    final l = context.l10n;
    final messenger = ScaffoldMessenger.of(context);
    if (i.locked) {
      messenger.showSnackBar(SnackBar(content: Text(l.lpLocked)));
      return;
    }
    try {
      switch (i.kind) {
        case 'page':
        case 'topic':
          await Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => LessonPageScreen(item: i, onOpen: () => _progress(i), onDone: () => _progress(i, completed: true))));
        case 'quiz':
          messenger.showSnackBar(SnackBar(content: Text(l.lpQuizInTab)));
        case 'scorm':
          final url = await widget.api.launchPackage(i.refId ?? '');
          if (!await widget.open(Uri.parse(url))) messenger.showSnackBar(SnackBar(content: Text(l.lpOpenFailed)));
        case 'live':
          final url = await widget.api.joinLiveClass(i.refId ?? '');
          if (!await widget.open(Uri.parse(url))) messenger.showSnackBar(SnackBar(content: Text(l.lpOpenFailed)));
        default:
          await _progress(i);
          if (i.url != null && !await widget.open(Uri.parse(i.url!))) messenger.showSnackBar(SnackBar(content: Text(l.lpOpenFailed)));
      }
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    }
    if (mounted) _load();
  }

  Future<void> _claim() async {
    final l = context.l10n;
    final messenger = ScaffoldMessenger.of(context);
    try {
      await widget.api.claimCourseCertificate(widget.summary.courseId);
      setState(() => _claimed = true);
      messenger.showSnackBar(SnackBar(content: Text(l.lpCertificateTaken)));
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  String _ruleText(AppLocalizations l, String rule) => switch (rule) {
    'pass' => l.lpRulePass,
    'mark_done' => l.lpRuleMarkDone,
    _ => l.lpRuleView,
  };

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final c = _course;
    final comp = c?.completion;
    return Scaffold(
      appBar: AppBar(title: Text(widget.summary.title)),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(Kx.s16),
          children: [
            if (_error != null) ErrorBanner(_error!, onRetry: _load),
            if (c == null && _error == null) const KxLoading(),
            if (c != null) ...[
              if (c.prerequisites.isNotEmpty) Padding(padding: const EdgeInsets.only(bottom: Kx.s12), child: LmsNotice(key: const Key('needsCourses'), tone: KxTone.warning, message: l.lpNeedsCourses(c.prerequisites.join(', ')))),
              if (comp != null)
                KxCard(
                  key: const Key('courseProgress'),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(l.lpCourseProgress, style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w600)),
                      const SizedBox(height: Kx.s8),
                      LinearProgressIndicator(value: comp.pct / 100, minHeight: 8, borderRadius: BorderRadius.circular(4)),
                      const SizedBox(height: Kx.s4),
                      Text('${l.lpProgress(comp.done, comp.total)} · ${comp.pct}%'),
                      if (comp.eligible && c.certificate && !c.offlineCopy) ...[
                        const SizedBox(height: Kx.s8),
                        Text(l.lpCertificateReady),
                        const SizedBox(height: Kx.s4),
                        FilledButton.icon(key: const Key('claimCertificate'), onPressed: _claimed ? null : _claim, icon: const Icon(Icons.workspace_premium_outlined), label: Text(_claimed ? l.lpCertificateTaken : l.lpGetCertificate)),
                      ],
                    ],
                  ),
                ),
              const SizedBox(height: Kx.s12),
              if (!c.offlineCopy) ...[
                KxCard(
                  key: const Key('courseGrade'),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(children: [Expanded(child: Text(l.courseGradeTitle, style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w600))), GradeChip(overall: c.overall, letter: c.letter)]),
                      if (c.parts.isEmpty) Text(l.courseNoGrade, style: context.text.bodySmall),
                      for (final p in c.parts)
                        Padding(
                          padding: const EdgeInsets.only(top: Kx.s4),
                          child: Row(children: [Expanded(child: Text('${p.name} (${p.weight.toStringAsFixed(0)}%)')), Text(p.percent == null ? '-' : '${p.percent!.toStringAsFixed(p.percent! % 1 == 0 ? 0 : 1)}%')]),
                        ),
                    ],
                  ),
                ),
                const SizedBox(height: Kx.s12),
                KxCard(
                  key: const Key('openForum'),
                  onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => ForumScreen(api: widget.api, courseId: widget.summary.courseId, title: widget.summary.title))),
                  child: Row(children: [const Icon(Icons.forum_outlined), const SizedBox(width: Kx.s12), Expanded(child: Text(l.forumTitle, style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w600))), const Icon(Icons.chevron_right)]),
                ),
                const SizedBox(height: Kx.s12),
              ],
              if (c.announcements.isNotEmpty)
                KxCard(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(l.courseAnnouncements, style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w600)), for (final a in c.announcements) Text(a)])),
              const SizedBox(height: Kx.s12),
              if (c.modules.isEmpty) KxEmptyState(icon: Icons.folder_open_outlined, message: l.courseNoModules),
              for (final m in c.modules) ...[
                KxCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(m.title, style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w600)),
                      for (final i in m.items)
                        ListTile(
                          key: Key('item-${i.id}'),
                          contentPadding: EdgeInsets.zero,
                          leading: Icon(_kindIcon(i.kind)),
                          title: Text(i.title),
                          subtitle: Text([_ruleText(l, i.completionRule), if (i.durationMin != null) l.lpMinutes(i.durationMin!), if (i.sizeKb != null) l.lpSizeKb(i.sizeKb!)].join(' · ')),
                          trailing: Icon(i.locked ? Icons.lock_outline : i.completed ? Icons.check_circle : Icons.radio_button_unchecked, color: i.completed ? kxTone(context, KxTone.success).fg : null, semanticLabel: i.locked ? l.lpLocked : i.completed ? l.lpMarkedDone : null),
                          onTap: () => _openItem(i),
                        ),
                    ],
                  ),
                ),
                const SizedBox(height: Kx.s12),
              ],
            ],
          ],
        ),
      ),
    );
  }
}

/// A lesson page: its text (kept on the phone, so it reads offline), and "Mark as done" for items that ask for it.
class LessonPageScreen extends StatefulWidget {
  const LessonPageScreen({super.key, required this.item, required this.onOpen, required this.onDone});

  final LmsItem item;
  final Future<void> Function() onOpen;
  final Future<void> Function() onDone;

  @override
  State<LessonPageScreen> createState() => _LessonPageScreenState();
}

class _LessonPageScreenState extends State<LessonPageScreen> {
  late bool _done = widget.item.completed;

  @override
  void initState() {
    super.initState();
    widget.onOpen().catchError((_) {});
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final i = widget.item;
    return Scaffold(
      appBar: AppBar(title: Text(i.title)),
      body: ListView(
        padding: const EdgeInsets.all(Kx.s16),
        children: [
          SelectableText(i.body.isEmpty ? i.title : i.body, key: const Key('lessonBody'), style: context.text.bodyLarge?.copyWith(height: 1.5)),
          const SizedBox(height: Kx.s24),
          if (i.completionRule == 'mark_done')
            FilledButton.icon(
              key: const Key('markDone'),
              onPressed: _done
                  ? null
                  : () async {
                      await widget.onDone();
                      if (mounted) setState(() => _done = true);
                    },
              icon: Icon(_done ? Icons.check : Icons.done_all),
              label: Text(_done ? l.lpMarkedDone : l.lpMarkDone),
            ),
        ],
      ),
    );
  }
}

/// The student's certificates (with the link anyone can check) and learning paths with progress.
class AchievementsScreen extends StatefulWidget {
  const AchievementsScreen({super.key, required this.api, required this.studentId, this.open = _openExternally});

  final StudentApi api;
  final String studentId;
  final UrlOpener open;

  @override
  State<AchievementsScreen> createState() => _AchievementsScreenState();
}

class _AchievementsScreenState extends State<AchievementsScreen> {
  List<LmsCertificate>? _certs;
  List<LearningPathRow>? _paths;
  ApiException? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final c = await widget.api.myLmsCertificates(widget.studentId);
      final p = await widget.api.myLearningPaths(widget.studentId);
      if (mounted) {
        setState(() {
          _certs = c;
          _paths = p;
          _error = null;
        });
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final ml = MaterialLocalizations.of(context);
    final certs = _certs;
    final paths = _paths;
    return Scaffold(
      appBar: AppBar(title: Text(l.lpAchievements)),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.all(Kx.s16),
          children: [
            if (_error != null) ErrorBanner(_error!, onRetry: _load),
            if (certs == null && _error == null) const KxLoading(),
            if (certs != null) ...[
              Text(l.lpCertificates, style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w600)),
              const SizedBox(height: Kx.s8),
              if (certs.isEmpty) KxEmptyState(icon: Icons.workspace_premium_outlined, message: l.lpNoCertificates),
              for (final c in certs)
                Padding(
                  padding: const EdgeInsets.only(bottom: Kx.s8),
                  child: KxCard(
                    key: Key('cert-${c.id}'),
                    child: Row(
                      children: [
                        const Icon(Icons.workspace_premium_outlined),
                        const SizedBox(width: Kx.s12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(c.title, style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w600)),
                              Text('${c.serial} · ${ml.formatShortDate(c.issuedAt)}${c.revoked ? ' · ${l.lpRevoked}' : ''}', style: context.text.bodySmall),
                            ],
                          ),
                        ),
                        if (c.verifyUrl.isNotEmpty && !c.revoked) TextButton(onPressed: () => widget.open(Uri.parse(c.verifyUrl)), child: Text(l.lpVerify)),
                      ],
                    ),
                  ),
                ),
            ],
            if (paths != null) ...[
              const SizedBox(height: Kx.s16),
              Text(l.lpPaths, style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w600)),
              const SizedBox(height: Kx.s8),
              if (paths.isEmpty) KxEmptyState(icon: Icons.route_outlined, message: l.lpNoPaths),
              for (final p in paths)
                Padding(
                  padding: const EdgeInsets.only(bottom: Kx.s8),
                  child: KxCard(
                    key: Key('path-${p.id}'),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(p.title, style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w600)),
                        const SizedBox(height: Kx.s4),
                        LinearProgressIndicator(value: p.pct / 100, minHeight: 6, borderRadius: BorderRadius.circular(3)),
                        Text(l.lpPathProgress(p.pct), style: context.text.bodySmall),
                        for (final s in p.steps)
                          Row(children: [Icon(s.done ? Icons.check_circle : Icons.radio_button_unchecked, size: 18), const SizedBox(width: Kx.s8), Expanded(child: Text(s.required ? s.title : '${s.title} (${l.lpOptional})'))]),
                      ],
                    ),
                  ),
                ),
            ],
          ],
        ),
      ),
    );
  }
}

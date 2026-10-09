import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/alumni.dart';
import '../../core/api.dart';
import '../../core/app_state.dart';
import '../../core/files.dart';
import '../../core/format.dart';
import '../../l10n/l10n.dart';
import '../../widgets/common.dart';
import '../../widgets/load_view.dart';

/// The home of a signed-in graduate: their profile, the success stories they write, giving and
/// volunteering, and the published stories. Opened as the whole app for an alumni login ([state]
/// is set: language and sign out show on Profile), or pushed from More by a student who is also
/// an alumnus.
class AlumniHome extends StatelessWidget {
  const AlumniHome({super.key, required this.api, this.state, this.openFile = openWithSystem});

  final StudentApi api;
  final AppState? state;
  final OpenFile openFile;

  static Future<void> open(BuildContext context, StudentApi api) => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => AlumniHome(api: api)));

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return DefaultTabController(
      length: 4,
      child: Scaffold(
        appBar: AppBar(
          title: Text(state?.me?.institution ?? l.alTitle),
          bottom: TabBar(isScrollable: true, tabAlignment: TabAlignment.start, tabs: [Tab(text: l.alTabProfile), Tab(text: l.alTabStories), Tab(text: l.alTabGive), Tab(text: l.alTabPublished)]),
        ),
        body: TabBarView(children: [_ProfileTab(api: api, state: state), _MyStoriesTab(api: api), _GiveTab(api: api, openFile: openFile), _PublishedTab(api: api)]),
      ),
    );
  }
}

class _ProfileTab extends StatelessWidget {
  const _ProfileTab({required this.api, this.state});

  final StudentApi api;
  final AppState? state;

  Future<void> _signOut(BuildContext context) async {
    final l = context.l10n;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(l.signOutQuestion),
        content: Text(l.signOutBody),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(l.cancel)),
          FilledButton(key: const Key('confirmSignOut'), onPressed: () => Navigator.pop(ctx, true), child: Text(l.signOut)),
        ],
      ),
    );
    if (ok == true) await state!.signOut();
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return LoadBody<AlumniProfile>(
      load: api.alumniProfile,
      builder: (context, p, reload) => [
        Text(p.fullName, style: context.text.headlineSmall),
        Text(l.alGraduated(p.program, p.graduationYear), style: context.text.bodyMedium?.copyWith(color: context.colors.onSurfaceVariant)),
        if ((p.email ?? '').isNotEmpty) Text(p.email!, style: context.text.bodyMedium),
        const SizedBox(height: Kx.s8),
        _ProfileForm(key: ValueKey(p.fullName + p.bio + (p.employer ?? '')), api: api, profile: p, onSaved: reload),
        if (state != null) ...[
          const Divider(),
          LanguageTile(onChanged: state!.setLanguage),
          Padding(
            padding: const EdgeInsets.only(top: Kx.s16),
            child: OutlinedButton.icon(key: const Key('signOut'), onPressed: () => _signOut(context), icon: const Icon(Icons.logout), label: Text(l.signOut)),
          ),
        ],
      ],
    );
  }
}

class _ProfileForm extends StatefulWidget {
  const _ProfileForm({super.key, required this.api, required this.profile, required this.onSaved});

  final StudentApi api;
  final AlumniProfile profile;
  final Future<void> Function() onSaved;

  @override
  State<_ProfileForm> createState() => _ProfileFormState();
}

class _ProfileFormState extends State<_ProfileForm> {
  late final _phone = TextEditingController(text: widget.profile.phone ?? '');
  late final _employer = TextEditingController(text: widget.profile.employer ?? '');
  late final _designation = TextEditingController(text: widget.profile.designation ?? '');
  late final _city = TextEditingController(text: widget.profile.city ?? '');
  late final _bio = TextEditingController(text: widget.profile.bio);
  late bool _directory = widget.profile.directoryVisible;
  late bool _mentor = widget.profile.mentorAvailable;
  bool _busy = false;

  @override
  void dispose() {
    for (final c in [_phone, _employer, _designation, _city, _bio]) {
      c.dispose();
    }
    super.dispose();
  }

  String? _text(TextEditingController c) => c.text.trim().isEmpty ? null : c.text.trim();

  Future<void> _save() async {
    setState(() => _busy = true);
    final ok = await attempt(
      context,
      () => widget.api.saveAlumniProfile(phone: _text(_phone), employer: _text(_employer), designation: _text(_designation), city: _text(_city), bio: _bio.text.trim(), directoryVisible: _directory, mentorAvailable: _mentor),
      done: context.l10n.alSaved,
    );
    if (!mounted) return;
    setState(() => _busy = false);
    if (ok) await widget.onSaved();
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        TextField(key: const Key('alPhone'), controller: _phone, keyboardType: TextInputType.phone, maxLength: 20, decoration: InputDecoration(labelText: l.alPhone)),
        TextField(key: const Key('alEmployer'), controller: _employer, maxLength: 200, decoration: InputDecoration(labelText: l.alEmployer)),
        TextField(key: const Key('alDesignation'), controller: _designation, maxLength: 200, decoration: InputDecoration(labelText: l.alDesignation)),
        TextField(key: const Key('alCity'), controller: _city, maxLength: 200, decoration: InputDecoration(labelText: l.alCity)),
        TextField(key: const Key('alBio'), controller: _bio, minLines: 2, maxLines: 5, maxLength: 1000, decoration: InputDecoration(labelText: l.alBio)),
        SwitchListTile(key: const Key('alDirectory'), contentPadding: EdgeInsets.zero, title: Text(l.alDirectory), subtitle: Text(l.alDirectoryHelp), value: _directory, onChanged: (v) => setState(() => _directory = v)),
        SwitchListTile(key: const Key('alMentor'), contentPadding: EdgeInsets.zero, title: Text(l.alMentor), value: _mentor, onChanged: (v) => setState(() => _mentor = v)),
        FilledButton(key: const Key('alSave'), onPressed: _busy ? null : _save, child: Text(l.save)),
      ],
    );
  }
}

// ── My success stories ──────────────────────────────────────────────────────────────────────────

String storyStatusLabel(AppLocalizations l, String s) => switch (s) {
  'submitted' => l.storyStatus_submitted,
  'published' => l.storyStatus_published,
  'rejected' => l.storyStatus_rejected,
  _ => l.storyStatus_draft,
};

class _MyStoriesTab extends StatefulWidget {
  const _MyStoriesTab({required this.api});

  final StudentApi api;

  @override
  State<_MyStoriesTab> createState() => _MyStoriesTabState();
}

class _MyStoriesTabState extends State<_MyStoriesTab> {
  final _body = GlobalKey<LoadBodyState<List<SuccessStory>>>();

  Future<void> _write([SuccessStory? story]) async {
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _StoryForm(api: widget.api, story: story),
    );
    if (saved == true) await _body.currentState?.reload();
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return Scaffold(
      backgroundColor: Colors.transparent,
      floatingActionButton: FloatingActionButton.extended(key: const Key('writeStory'), onPressed: _write, icon: const Icon(Icons.edit_outlined), label: Text(l.storyWrite)),
      body: LoadBody<List<SuccessStory>>(
        key: _body,
        load: widget.api.myStories,
        padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s8, Kx.s16, 96),
        builder: (context, stories, reload) => [
          Text(l.storyIntro, style: context.text.bodyMedium?.copyWith(color: context.colors.onSurfaceVariant)),
          if (stories.isEmpty) EmptyNote(l.storyNone),
          for (final s in stories)
            KxCard(
              key: Key('story-${s.id}'),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(child: Text(s.title, style: context.text.titleSmall)),
                      Pill(
                        storyStatusLabel(l, s.status),
                        key: Key('status-${s.id}'),
                        background: kxTone(context, switch (s.status) { 'published' => KxTone.success, 'rejected' => KxTone.danger, 'submitted' => KxTone.primary, _ => KxTone.neutral }).bg,
                        foreground: kxTone(context, switch (s.status) { 'published' => KxTone.success, 'rejected' => KxTone.danger, 'submitted' => KxTone.primary, _ => KxTone.neutral }).fg,
                      ),
                    ],
                  ),
                  Padding(padding: const EdgeInsets.only(top: Kx.s4), child: Text(s.body, maxLines: 4, overflow: TextOverflow.ellipsis)),
                  if (s.status == 'rejected' && (s.reviewNote ?? '').isNotEmpty) Padding(padding: const EdgeInsets.only(top: Kx.s4), child: Text(l.storyReviewNote(s.reviewNote!), style: TextStyle(color: context.colors.error))),
                  if (s.status == 'submitted') Padding(padding: const EdgeInsets.only(top: Kx.s4), child: Text(l.storyUnderReview, style: context.text.bodySmall)),
                  if (s.editable)
                    Row(
                      mainAxisAlignment: MainAxisAlignment.end,
                      children: [
                        TextButton(key: Key('edit-${s.id}'), onPressed: () => _write(s), child: Text(l.storyEdit)),
                        if (s.status == 'draft')
                          FilledButton.tonal(
                            key: Key('submit-${s.id}'),
                            onPressed: () async {
                              if (await attempt(context, () => widget.api.submitStory(s.id), done: l.storySubmitted)) await reload();
                            },
                            child: Text(l.storySubmit),
                          ),
                      ],
                    ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _StoryForm extends StatefulWidget {
  const _StoryForm({required this.api, this.story});

  final StudentApi api;
  final SuccessStory? story;

  @override
  State<_StoryForm> createState() => _StoryFormState();
}

class _StoryFormState extends State<_StoryForm> {
  late final _title = TextEditingController(text: widget.story?.title ?? '');
  late final _body = TextEditingController(text: widget.story?.body ?? '');
  bool _busy = false;
  String? _problem;

  @override
  void dispose() {
    _title.dispose();
    _body.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final l = context.l10n;
    final title = _title.text.trim(), body = _body.text.trim();
    if (title.length < 3) return setState(() => _problem = l.storyNeedTitle);
    if (body.length < 40) return setState(() => _problem = l.storyNeedBody);
    setState(() {
      _busy = true;
      _problem = null;
    });
    final s = widget.story;
    final ok = await attempt(context, () => s == null ? widget.api.writeStory(title, body) : widget.api.editStory(s.id, title, body), done: l.storySaved);
    if (!mounted) return;
    if (ok) {
      Navigator.pop(context, true);
    } else {
      setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return Padding(
      padding: EdgeInsets.fromLTRB(Kx.s16, 0, Kx.s16, MediaQuery.viewInsetsOf(context).bottom + Kx.s16),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(widget.story == null ? l.storyWrite : l.storyEdit, style: context.text.titleMedium),
            TextField(key: const Key('storyTitle'), controller: _title, maxLength: 160, decoration: InputDecoration(labelText: l.pjFieldTitle)),
            TextField(key: const Key('storyBody'), controller: _body, minLines: 5, maxLines: 10, maxLength: 5000, decoration: InputDecoration(labelText: l.storyBody)),
            if (_problem != null) Padding(padding: const EdgeInsets.only(bottom: Kx.s8), child: Text(_problem!, style: TextStyle(color: context.colors.error))),
            SizedBox(width: double.infinity, child: FilledButton(key: const Key('saveStory'), onPressed: _busy ? null : _save, child: Text(l.storySaveDraft))),
          ],
        ),
      ),
    );
  }
}

// ── Giving and volunteering ─────────────────────────────────────────────────────────────────────

typedef _Give = (List<AlumniCampaign>, Giving, List<VolunteerOpportunity>);

class _GiveTab extends StatelessWidget {
  const _GiveTab({required this.api, required this.openFile});

  final StudentApi api;
  final OpenFile openFile;

  Future<_Give> _load() async {
    final r = await Future.wait<Object>([api.alumniCampaigns(), api.alumniGiving(), api.alumniVolunteering()]);
    return (r[0] as List<AlumniCampaign>, r[1] as Giving, r[2] as List<VolunteerOpportunity>);
  }

  Future<void> _pledge(BuildContext context, AlumniCampaign c, Future<void> Function() reload) async {
    final l = context.l10n;
    final r = await askFields(
      context,
      title: l.giveTitle(c.name),
      fields: [
        FieldSpec('pledgeAmount', l.giveAmount, keyboard: TextInputType.number, prefix: '₹ '),
        FieldSpec('pledgeNote', l.giveNote, maxLength: 500),
      ],
      confirmLabel: l.givePledge,
      confirmKey: 'sendPledge',
      footer: l.giveHelp,
    );
    if (r == null || !context.mounted) return;
    final rupees = int.tryParse(r['pledgeAmount']!.replaceAll(',', ''));
    if (rupees == null || rupees < 1) return say(context, l.giveNeedAmount);
    if (await attempt(context, () => api.alumniPledge(c.id, rupees * 100, note: r['pledgeNote']!), done: l.giveThanks)) await reload();
  }

  Future<void> _receipt(BuildContext context, String id) async {
    final l = context.l10n;
    Uint8List? bytes;
    final ok = await attempt(context, () async => bytes = await api.alumniReceiptPdf(id));
    if (!ok || bytes == null) return;
    if (!await openFile(bytes!, 'receipt.pdf', 'application/pdf') && context.mounted) say(context, l.fileOpenFailed);
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return LoadBody<_Give>(
      load: _load,
      builder: (context, data, reload) {
        final (campaigns, giving, volunteering) = data;
        return [
          if (giving.totalGivenPaise > 0) Text(l.giveTotal(Fmt.rupees(giving.totalGivenPaise)), key: const Key('giveTotal'), style: context.text.titleMedium),
          Heading(l.giveCampaigns),
          if (campaigns.isEmpty) EmptyNote(l.giveNoCampaigns),
          for (final c in campaigns)
            KxCard(
              key: Key('campaign-${c.id}'),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(c.name, style: context.text.titleSmall),
                  if (c.description.isNotEmpty) Text(c.description),
                  Text([if (c.goalPaise > 0) l.giveGoal(Fmt.rupees(c.goalPaise)), if (c.endsOn != null) l.giveEnds(dayText(context, c.endsOn))].join(' · '), style: context.text.bodyMedium?.copyWith(color: context.colors.onSurfaceVariant)),
                  Align(alignment: Alignment.centerRight, child: FilledButton.tonal(key: Key('pledge-${c.id}'), onPressed: () => _pledge(context, c, reload), child: Text(l.givePledge))),
                ],
              ),
            ),
          if (giving.pledges.isNotEmpty) ...[
            Heading(l.givePledges),
            for (final p in giving.pledges)
              ListTile(key: Key('pledgeRow-${p.id}'), contentPadding: EdgeInsets.zero, leading: const Icon(Icons.volunteer_activism_outlined), title: Text(Fmt.rupees(p.amountPaise)), subtitle: Text([dayText(context, p.on), pledgeStatusLabel(l, p.status)].where((s) => s.isNotEmpty).join(' · '))),
          ],
          if (giving.donations.isNotEmpty) ...[
            Heading(l.giveDonations),
            for (final d in giving.donations)
              ListTile(
                key: Key('donation-${d.id}'),
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.receipt_long_outlined),
                title: Text('${Fmt.rupees(d.amountPaise)} · ${d.campaign}'),
                subtitle: Text([dayText(context, d.on), d.receiptSerial].where((s) => s.isNotEmpty).join(' · ')),
                trailing: IconButton(key: Key('receipt-${d.id}'), tooltip: l.giveReceipt, icon: const Icon(Icons.picture_as_pdf_outlined), onPressed: () => _receipt(context, d.id)),
              ),
          ],
          Heading(l.volTitle),
          if (volunteering.isEmpty) EmptyNote(l.volNone),
          for (final v in volunteering)
            KxCard(
              key: Key('vol-${v.id}'),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(v.title, style: context.text.titleSmall),
                  if (v.description.isNotEmpty) Text(v.description),
                  Text([if (v.startsOn != null) dayText(context, v.startsOn), if (v.slots != null) l.volPlaces(v.taken, v.slots!)].join(' · '), style: context.text.bodyMedium?.copyWith(color: context.colors.onSurfaceVariant)),
                  Align(
                    alignment: Alignment.centerRight,
                    child: v.signedUp
                        ? OutlinedButton(
                            key: Key('withdraw-${v.id}'),
                            onPressed: () async {
                              if (await attempt(context, () => api.alumniVolunteerWithdraw(v.id))) await reload();
                            },
                            child: Text(l.volWithdraw),
                          )
                        : FilledButton.tonal(
                            key: Key('signup-${v.id}'),
                            onPressed: v.full
                                ? null
                                : () async {
                                    if (await attempt(context, () => api.alumniVolunteerSignUp(v.id), done: l.volThanks)) await reload();
                                  },
                            child: Text(v.full ? l.volFull : l.volSignUp),
                          ),
                  ),
                ],
              ),
            ),
        ];
      },
    );
  }
}

String pledgeStatusLabel(AppLocalizations l, String s) => switch (s) {
  'fulfilled' => l.pledgeStatus_fulfilled,
  'cancelled' => l.pledgeStatus_cancelled,
  _ => l.pledgeStatus_open,
};

// ── Published stories ───────────────────────────────────────────────────────────────────────────

class _PublishedTab extends StatelessWidget {
  const _PublishedTab({required this.api});

  final StudentApi api;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return LoadBody<List<SuccessStory>>(
      load: api.publishedStories,
      builder: (context, stories, reload) => [
        if (stories.isEmpty) EmptyNote(l.storiesNone),
        for (final s in stories)
          KxCard(
            key: Key('published-${s.id}'),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(children: [Expanded(child: Text(s.title, style: context.text.titleSmall)), if (s.featured) const Icon(Icons.star, size: 18)]),
                Text([if (s.alumnus != null) s.alumnus!, if (s.graduationYear != null) '${s.graduationYear}', if ((s.work ?? '').isNotEmpty) s.work!].join(' · '), style: context.text.bodyMedium?.copyWith(color: context.colors.onSurfaceVariant)),
                Padding(padding: const EdgeInsets.only(top: Kx.s4), child: Text(s.body)),
              ],
            ),
          ),
      ],
    );
  }
}

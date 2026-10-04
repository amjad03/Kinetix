import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/models.dart';
import '../../l10n/l10n.dart';
import '../../widgets/common.dart';

/// One child's privacy decisions (`/v1/consents`): loading them and recording changes.
class ConsentController extends ChangeNotifier {
  ConsentController(this.api, this.child);

  final ParentApi api;
  final Child child;

  String get studentId => child.id;

  Consents? consents;
  ApiException? error;
  bool loading = false;

  /// Purposes being saved now.
  final saving = <ConsentPurpose>{};

  Future<Consents?> load() async {
    loading = true;
    error = null;
    notifyListeners();
    try {
      consents = await api.consents(studentId);
    } on ApiException catch (e) {
      error = e;
    } finally {
      loading = false;
      notifyListeners();
    }
    return consents;
  }

  /// Records one decision. Throws the server's error (shown by the caller).
  Future<void> set(ConsentPurpose purpose, bool granted) async {
    saving.add(purpose);
    notifyListeners();
    try {
      consents = await api.setConsent(studentId, purpose, granted: granted);
    } finally {
      saving.remove(purpose);
      notifyListeners();
    }
  }

  /// Records every decision in [choices], in order.
  Future<void> saveAll(Map<ConsentPurpose, bool> choices) async {
    for (final MapEntry(key: p, value: granted) in choices.entries) {
      await set(p, granted);
    }
  }
}

/// Words for each purpose: (title, what it covers, if you say no).
(String, String, String) purposeText(AppLocalizations l, ConsentPurpose p) => switch (p) {
  ConsentPurpose.dataProcessing => (l.purposeDataTitle, l.purposeDataBody, l.purposeDataNo),
  ConsentPurpose.aiFeatures => (l.purposeAiTitle, l.purposeAiBody, l.purposeAiNo),
  ConsentPurpose.classRecordings => (l.purposeRecordingsTitle, l.purposeRecordingsBody, l.purposeRecordingsNo),
  ConsentPurpose.photos => (l.purposePhotosTitle, l.purposePhotosBody, l.purposePhotosNo),
};

IconData purposeIcon(ConsentPurpose p) => switch (p) {
  ConsentPurpose.dataProcessing => Icons.folder_shared_outlined,
  ConsentPurpose.aiFeatures => Icons.auto_awesome_outlined,
  ConsentPurpose.classRecordings => Icons.videocam_outlined,
  ConsentPurpose.photos => Icons.photo_camera_outlined,
};

/// Asked once after sign-in while something is undecided (or the notice changed): a short
/// summary of the notice and a switch per purpose. Nothing is pre-ticked; "Allow all" and "Save
/// my choices" record every purpose. "Not now" asks again next time.
class ConsentScreen extends StatefulWidget {
  const ConsentScreen({super.key, required this.controller});

  final ConsentController controller;

  /// Shows the screen when [controller] needs answers; true when they were saved.
  static Future<bool> askIfNeeded(BuildContext context, ConsentController controller) async {
    final c = controller.consents ?? await controller.load();
    if (c == null || !c.needsAnswer || !context.mounted) return false;
    final saved = await Navigator.of(context).push<bool>(
      MaterialPageRoute(fullscreenDialog: true, builder: (_) => ConsentScreen(controller: controller)),
    );
    return saved ?? false;
  }

  @override
  State<ConsentScreen> createState() => _ConsentScreenState();
}

class _ConsentScreenState extends State<ConsentScreen> {
  late final Map<ConsentPurpose, bool> _choices = {
    for (final p in ConsentPurpose.values) p: widget.controller.consents?.purposes[p]?.granted ?? false,
  };
  bool _saving = false;
  ApiException? _error;

  Future<void> _save({bool all = false}) async {
    if (all) setState(() => _choices.updateAll((_, _) => true));
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await widget.controller.saveAll(_choices);
      if (mounted) Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      if (mounted) {
        setState(() {
          _saving = false;
          _error = e;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final c = context.colors;
    return Scaffold(
      appBar: AppBar(
        automaticallyImplyLeading: false,
        title: Text(l.consentTitleFor(widget.controller.child.firstName)),
        actions: [TextButton(key: const Key('consentLater'), onPressed: _saving ? null : () => Navigator.of(context).pop(false), child: Text(l.notNow))],
      ),
      body: LayoutBuilder(
        builder: (context, box) => ListView(
          key: const Key('consentList'),
          padding: EdgeInsets.fromLTRB(sideGutter(box.maxWidth), Kx.s8, sideGutter(box.maxWidth), Kx.s32),
          children: [
            Text(l.consentIntroFor(widget.controller.child.firstName), style: context.text.bodyLarge),
            const SizedBox(height: Kx.s8),
            Text(l.noticeDataInIndia, style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant)),
            const SizedBox(height: Kx.s16),
            for (final p in ConsentPurpose.values)
              Builder(
                builder: (context) {
                  final (title, body, no) = purposeText(l, p);
                  return Card(
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(0, Kx.s4, 0, Kx.s12),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          SwitchListTile(
                            key: Key('consent-${p.wire}'),
                            secondary: Icon(purposeIcon(p)),
                            title: Text(title),
                            subtitle: Text(body),
                            value: _choices[p]!,
                            onChanged: _saving ? null : (v) => setState(() => _choices[p] = v),
                          ),
                          Padding(
                            padding: const EdgeInsets.fromLTRB(Kx.s16 + 40, 0, Kx.s16, 0),
                            child: Text(l.ifYouSayNo(no), style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant)),
                          ),
                        ],
                      ),
                    ),
                  );
                },
              ),
            const SizedBox(height: Kx.s8),
            Text(l.changeAnyTime, style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant)),
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton.icon(
                key: const Key('readNotice'),
                onPressed: () => NoticeScreen.open(context, widget.controller.consents?.noticeVersion),
                icon: const Icon(Icons.article_outlined),
                label: Text(l.readFullNotice),
              ),
            ),
            if (_error != null) ...[const SizedBox(height: Kx.s8), ErrorBanner(_error!)],
            const SizedBox(height: Kx.s16),
            if (_saving)
              const Center(child: CircularProgressIndicator())
            else ...[
              FilledButton(key: const Key('consentAllowAll'), onPressed: () => _save(all: true), child: Text(l.allowAll)),
              const SizedBox(height: Kx.s8),
              OutlinedButton(key: const Key('consentSave'), onPressed: _save, child: Text(l.saveChoices)),
            ],
          ],
        ),
      ),
    );
  }
}

/// Profile → Privacy: each decision, who made it and when, with a switch to change it (or, when
/// someone else decides, the decisions read-only).
class PrivacyScreen extends StatefulWidget {
  const PrivacyScreen({super.key, required this.controller});

  final ConsentController controller;

  static Future<void> open(BuildContext context, ParentApi api, Child child) =>
      Navigator.of(context).push(MaterialPageRoute(builder: (_) => PrivacyScreen(controller: ConsentController(api, child))));

  @override
  State<PrivacyScreen> createState() => _PrivacyScreenState();
}

class _PrivacyScreenState extends State<PrivacyScreen> {
  ConsentController get controller => widget.controller;

  @override
  void initState() {
    super.initState();
    if (controller.consents == null) controller.load();
  }

  Future<void> _change(ConsentPurpose p, bool granted) async {
    final l = context.l10n;
    try {
      await controller.set(p, granted);
      if (mounted) {
        ScaffoldMessenger.of(context)
          ..hideCurrentSnackBar()
          ..showSnackBar(SnackBar(content: Text(l.choicesSaved)));
      }
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
          ..hideCurrentSnackBar()
          ..showSnackBar(SnackBar(content: Text(context.errorText(e))));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final c = context.colors;
    return Scaffold(
      body: ListenableBuilder(
        listenable: controller,
        builder: (context, _) {
          final cs = controller.consents;
          return CustomScrollView(
            slivers: [
              SliverAppBar.large(title: Text(l.childPrivacy(controller.child.firstName))),
              if (controller.error != null && cs == null)
                CenteredSliver(sliver: SliverToBoxAdapter(child: ErrorBanner(controller.error!, onRetry: controller.load)))
              else if (cs == null)
                const SliverFillRemaining(hasScrollBody: false, child: Center(child: CircularProgressIndicator()))
              else
                CenteredSliver(
                  bottom: Kx.s32,
                  sliver: SliverList.list(
                    children: [
                      if (!cs.canDecide)
                        Container(
                          key: const Key('consentReadOnly'),
                          padding: const EdgeInsets.all(Kx.s12),
                          margin: const EdgeInsets.only(bottom: Kx.s12),
                          decoration: BoxDecoration(color: c.secondaryContainer, borderRadius: Kx.radiusMd),
                          child: Row(
                            children: [
                              Icon(Icons.school_outlined, color: c.onSecondaryContainer),
                              const SizedBox(width: Kx.s12),
                              Expanded(
                                child: Text(l.managedByStudent(controller.child.firstName), style: context.text.bodyMedium?.copyWith(color: c.onSecondaryContainer)),
                              ),
                            ],
                          ),
                        ),
                      Text(
                        cs.canDecide ? l.privacyIntroFor(controller.child.firstName) : l.privacyIntroReadOnlyFor(controller.child.firstName),
                        style: context.text.bodyLarge,
                      ),
                      const SizedBox(height: Kx.s12),
                      for (final p in ConsentPurpose.values) _PurposeTile(purpose: p, consents: cs, saving: controller.saving.contains(p), onChanged: _change),
                      const SizedBox(height: Kx.s8),
                      Text(l.changeAnyTime, style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant)),
                      Align(
                        alignment: Alignment.centerLeft,
                        child: TextButton.icon(
                          key: const Key('readNotice'),
                          onPressed: () => NoticeScreen.open(context, cs.noticeVersion),
                          icon: const Icon(Icons.article_outlined),
                          label: Text(l.readFullNotice),
                        ),
                      ),
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

class _PurposeTile extends StatelessWidget {
  const _PurposeTile({required this.purpose, required this.consents, required this.saving, required this.onChanged});

  final ConsentPurpose purpose;
  final Consents consents;
  final bool saving;
  final void Function(ConsentPurpose, bool) onChanged;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final c = context.colors;
    final (title, body, _) = purposeText(l, purpose);
    final d = consents.purposes[purpose];
    final who = d == null
        ? l.notDecided
        : l.decidedBy(d.granted ? l.allowed : l.notAllowed, d.givenBy ?? '', context.fmt.date(d.at));
    final subtitle = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(body),
        const SizedBox(height: Kx.s4),
        Text(who, key: Key('decided-${purpose.wire}'), style: context.text.bodySmall?.copyWith(color: d == null ? c.error : c.onSurfaceVariant)),
      ],
    );
    return Card(
      child: consents.canDecide
          ? SwitchListTile(
              key: Key('privacy-${purpose.wire}'),
              secondary: Icon(purposeIcon(purpose)),
              title: Text(title),
              subtitle: subtitle,
              value: d?.granted ?? false,
              onChanged: saving ? null : (v) => onChanged(purpose, v),
            )
          : ListTile(
              key: Key('privacy-${purpose.wire}'),
              leading: Icon(purposeIcon(purpose)),
              title: Text(title),
              subtitle: subtitle,
              trailing: Icon(
                d?.granted == true ? Icons.check_circle : Icons.remove_circle_outline,
                color: d?.granted == true ? Tone.good(context) : c.onSurfaceVariant,
              ),
            ),
    );
  }
}

/// The privacy notice in full (docs/product/privacy-notice.md), in the app's language.
class NoticeScreen extends StatelessWidget {
  const NoticeScreen({super.key, this.version});

  final String? version;

  static Future<void> open(BuildContext context, String? version) =>
      Navigator.of(context).push(MaterialPageRoute(builder: (_) => NoticeScreen(version: version)));

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final c = context.colors;
    Widget heading(String t) => Padding(
      padding: const EdgeInsets.only(top: Kx.s24, bottom: Kx.s8),
      child: Text(t, style: context.text.titleMedium?.copyWith(color: c.primary)),
    );
    Widget para(String t) => Padding(
      padding: const EdgeInsets.only(bottom: Kx.s8),
      child: Text(t, style: context.text.bodyLarge?.copyWith(height: 1.5)),
    );
    return Scaffold(
      appBar: AppBar(title: Text(l.privacyNotice)),
      body: LayoutBuilder(
        builder: (context, box) => ListView(
          key: const Key('noticeList'),
          padding: EdgeInsets.fromLTRB(sideGutter(box.maxWidth), Kx.s8, sideGutter(box.maxWidth), Kx.s32),
          children: [
            if (version != null) Text(l.noticeVersion(version!), style: context.text.labelMedium?.copyWith(color: c.onSurfaceVariant)),
            heading(l.noticeWhoDecides),
            BulletLine(l.noticeSchool),
            BulletLine(l.noticeCollege),
            para(l.changeAnyTime),
            heading(l.noticeWhatWeAsk),
            for (final p in ConsentPurpose.values)
              Builder(
                builder: (context) {
                  final (title, body, no) = purposeText(l, p);
                  return Padding(
                    padding: const EdgeInsets.only(bottom: Kx.s12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(title, style: context.text.titleSmall),
                        const SizedBox(height: 2),
                        Text(body, style: context.text.bodyMedium),
                        const SizedBox(height: 2),
                        Text(l.ifYouSayNo(no), style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant)),
                      ],
                    ),
                  );
                },
              ),
            heading(l.noticeWhereKept),
            para(l.noticeDataInIndia),
            heading(l.noticeQuestions),
            para(l.noticeContact),
          ],
        ),
      ),
    );
  }
}

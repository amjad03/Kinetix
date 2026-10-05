import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../l10n/l10n.dart';

/// One "How do I…?" answer: a few short steps, and the control it is about for "Show me".
class HelpTopic {
  const HelpTopic(this.id, this.icon, this.title, this.steps, {this.target});
  final String id;
  final IconData icon;
  final String title;
  final List<String> steps;

  /// The control on the board ("Show me" points at it).
  final Key? target;
}

/// Everything a teacher may need, grouped, in the board's language.
List<(String, List<HelpTopic>)> helpTopics(AppLocalizations l) => [
  (
    l.helpGroupWriting,
    [
      HelpTopic('write', Icons.edit_outlined, l.helpWriteTitle, [l.helpWrite1, l.helpWrite2], target: const Key('tool-write')),
      HelpTopic('erase', Icons.undo, l.helpEraseTitle, [l.helpErase1, l.helpErase2], target: const Key('tool-erase')),
      HelpTopic('shapes', Icons.interests_outlined, l.helpShapesTitle, [l.helpShapes1, l.helpShapes2], target: const Key('tool-shapes')),
      HelpTopic('text', Icons.title, l.helpTextTitle, [l.helpText1], target: const Key('tool-text')),
    ],
  ),
  (
    l.helpGroupContent,
    [
      HelpTopic('pages', Icons.auto_stories_outlined, l.helpPagesTitle, [l.helpPages1, l.helpPages2], target: const Key('next-page')),
      HelpTopic('picture', Icons.add_photo_alternate_outlined, l.helpPictureTitle, [l.helpPicture1, l.helpPicture2], target: const Key('tool-insert')),
      HelpTopic('import', Icons.slideshow_outlined, l.helpImportTitle, [l.helpImport1, l.helpImport2], target: const Key('tool-insert')),
      HelpTopic('sims', Icons.science, l.helpSimsTitle, [l.helpSims1, l.helpSims2], target: const Key('tool-insert')),
    ],
  ),
  (
    l.helpGroupClass,
    [
      HelpTopic('toolkit', Icons.timer_outlined, l.helpToolkitTitle, [l.helpToolkit1, l.helpToolkit2], target: const Key('tool-tools')),
      HelpTopic('shade', Icons.vignette_outlined, l.helpShadeTitle, [l.helpShade1, l.helpShade2], target: const Key('tool-tools')),
      HelpTopic('read', Icons.record_voice_over_outlined, l.helpReadTitle, [l.helpRead1, l.helpRead2], target: const Key('tool-tools')),
      HelpTopic('record', Icons.fiber_manual_record, l.helpRecordTitle, [l.helpRecord1, l.helpRecord2], target: const Key('record')),
    ],
  ),
  (
    l.helpGroupAi,
    [
      HelpTopic('ai', Icons.auto_awesome, l.helpAiTitle, [l.helpAi1, l.helpAi2], target: const Key('panel-ai')),
      HelpTopic('books', Icons.menu_book, l.helpBooksTitle, [l.helpBooks1, l.helpBooks2], target: const Key('panel-books')),
    ],
  ),
  (
    l.helpGroupSettings,
    [HelpTopic('settings', Icons.settings_outlined, l.helpSettingsTitle, [l.helpSettings1], target: const Key('profile-button'))],
  ),
];

/// "How do I…?": search, short answers, "Show me" on the board, and the tour and practice.
class HelpSheet extends StatefulWidget {
  const HelpSheet({super.key, this.onShowMe, this.onTour, this.onPractice, this.canShow});

  final void Function(HelpTopic topic)? onShowMe;
  final bool Function(Key target)? canShow;
  final VoidCallback? onTour, onPractice;

  /// Opens the help sheet over the board; the callbacks run after it closes.
  static Future<void> show(BuildContext context, {void Function(HelpTopic)? onShowMe, bool Function(Key)? canShow, VoidCallback? onTour, VoidCallback? onPractice}) async {
    VoidCallback? then;
    await showDialog<void>(
      context: context,
      builder: (ctx) => HelpSheet(
        canShow: canShow,
        onShowMe: onShowMe == null ? null : (t) => then = () => onShowMe(t),
        onTour: onTour == null ? null : () => then = onTour,
        onPractice: onPractice == null ? null : () => then = onPractice,
      ),
    );
    then?.call();
  }

  @override
  State<HelpSheet> createState() => _HelpSheetState();
}

class _HelpSheetState extends State<HelpSheet> {
  String _q = '';
  String? _open;

  void _close(VoidCallback f) {
    f();
    Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final c = context.colors;
    final q = _q.trim().toLowerCase();
    final groups = [
      for (final (name, topics) in helpTopics(l))
        (
          name,
          [
            for (final t in topics)
              if (q.isEmpty || t.title.toLowerCase().contains(q) || t.steps.any((s) => s.toLowerCase().contains(q))) t,
          ],
        ),
    ].where((g) => g.$2.isNotEmpty).toList();
    final size = MediaQuery.sizeOf(context);
    return Dialog(
      key: const Key('help-sheet'),
      child: SizedBox(
        width: 640,
        height: (size.height - 64).clamp(320, 820).toDouble(),
        child: ListView(
          padding: const EdgeInsets.fromLTRB(Kx.s24, Kx.s20, Kx.s24, Kx.s24),
          children: [
            Row(
              children: [
                Expanded(child: Text(l.helpTitle, style: context.text.headlineSmall)),
                IconButton(tooltip: l.close, onPressed: () => Navigator.pop(context), icon: const Icon(Icons.close)),
              ],
            ),
            Text(l.helpSubtitle, style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant)),
            const SizedBox(height: Kx.s16),
            Wrap(
              spacing: Kx.s12,
              runSpacing: Kx.s12,
              children: [
                if (widget.onTour != null)
                  FilledButton.tonalIcon(key: const Key('help-tour'), onPressed: () => _close(widget.onTour!), icon: const Icon(Icons.explore_outlined), label: Text(l.helpShowAround)),
                if (widget.onPractice != null)
                  FilledButton.icon(key: const Key('help-practice'), onPressed: () => _close(widget.onPractice!), icon: const Icon(Icons.school_outlined), label: Text(l.helpPractise)),
              ],
            ),
            const SizedBox(height: Kx.s16),
            TextField(
              key: const Key('help-search'),
              onChanged: (v) => setState(() => _q = v),
              decoration: InputDecoration(prefixIcon: const Icon(Icons.search), hintText: l.helpSearch, border: const OutlineInputBorder(), isDense: true),
            ),
            if (groups.isEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: Kx.s24),
                child: Text(l.helpNothing, textAlign: TextAlign.center, style: TextStyle(color: c.onSurfaceVariant)),
              ),
            for (final (name, topics) in groups) ...[
              Padding(
                padding: const EdgeInsets.fromLTRB(Kx.s4, Kx.s16, Kx.s4, Kx.s8),
                child: Text(name, style: context.text.titleSmall?.copyWith(color: c.primary)),
              ),
              for (final t in topics) _topic(t),
            ],
          ],
        ),
      ),
    );
  }

  Widget _topic(HelpTopic t) {
    final l = context.l10n;
    final c = context.colors;
    final open = _open == t.id || _q.trim().isNotEmpty;
    final show = widget.onShowMe != null && t.target != null && (widget.canShow?.call(t.target!) ?? true);
    return Card(
      elevation: 0,
      color: open ? c.secondaryContainer : c.surfaceContainerHigh,
      margin: const EdgeInsets.only(bottom: Kx.s8),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Kx.rLg)),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        key: Key('help-${t.id}'),
        onTap: () => setState(() => _open = _open == t.id ? null : t.id),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s12, Kx.s12, Kx.s12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(t.icon, color: c.primary),
                  const SizedBox(width: Kx.s12),
                  Expanded(child: Text(t.title, style: context.text.titleMedium)),
                  Icon(open ? Icons.expand_less : Icons.expand_more, color: c.onSurfaceVariant),
                ],
              ),
              if (open)
                Padding(
                  padding: const EdgeInsets.only(left: 36, top: Kx.s8),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      for (final (i, s) in t.steps.indexed)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 6),
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('${i + 1}.  ', style: TextStyle(color: c.onSurfaceVariant)),
                              Expanded(child: Text(s, style: const TextStyle(height: 1.35))),
                            ],
                          ),
                        ),
                      if (show)
                        Align(
                          alignment: Alignment.centerRight,
                          child: FilledButton.tonalIcon(
                            key: Key('help-show-${t.id}'),
                            onPressed: () => _close(() => widget.onShowMe!(t)),
                            icon: const Icon(Icons.ads_click, size: 18),
                            label: Text(l.helpShowMe),
                          ),
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
}

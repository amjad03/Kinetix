import 'package:flutter/material.dart';
import 'package:zynetix_ui/zynetix_ui.dart';

import '../../core/api.dart';
import '../../core/self_service.dart';
import '../../l10n/l10n.dart';
import '../../widgets/common.dart';
import '../../widgets/load_view.dart';

/// Student council elections: the ballot while voting is open (one secret vote, up to the
/// post's seats per post), and the results once the committee publishes them.
class ElectionsScreen extends StatefulWidget {
  const ElectionsScreen({super.key, required this.api, required this.studentId});

  final StudentApi api;
  final String studentId;

  static Future<void> open(BuildContext context, StudentApi api, String studentId) =>
      Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => ElectionsScreen(api: api, studentId: studentId)));

  @override
  State<ElectionsScreen> createState() => _ElectionsScreenState();
}

class _ElectionsScreenState extends State<ElectionsScreen> {
  List<Election>? _elections;
  ApiException? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final e = await widget.api.myElections(widget.studentId);
      if (mounted) setState(() => _elections = e);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  Future<void> _vote(Election e) async {
    final cast = await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => BallotScreen(api: widget.api, studentId: widget.studentId, election: e)));
    if (cast == true && mounted) {
      say(context, context.l10n.elVoted);
      await _load();
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final c = context.colors;
    final list = _elections;
    return Scaffold(
      appBar: AppBar(title: Text(l.elTitle)),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s8, Kx.s16, Kx.s32),
          children: [
            if (_error != null) ErrorBanner(_error!, onRetry: _load),
            if (list == null && _error == null) const KxLoading(),
            if (list != null && list.isEmpty) KxEmptyState(key: const Key('elEmpty'), icon: Icons.how_to_vote_outlined, message: l.elEmpty),
            for (final e in list ?? const <Election>[])
              Padding(
                padding: const EdgeInsets.only(bottom: Kx.s12),
                child: KxCard(
                  key: Key('election-${e.id}'),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          KxIconBox(e.published ? Icons.emoji_events_outlined : Icons.how_to_vote_outlined, tone: e.published ? KxTone.success : KxTone.primary),
                          const SizedBox(width: Kx.s12),
                          Expanded(child: Text(e.title, style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w600))),
                        ],
                      ),
                      if (e.description.isNotEmpty) Padding(padding: const EdgeInsets.only(top: Kx.s8), child: Text(e.description, style: context.text.bodyMedium)),
                      const SizedBox(height: Kx.s8),
                      Text(
                        e.published ? l.elResultsOut : l.elVotingWindow(context.fmt.dateTime(e.votingStartsAt), context.fmt.dateTime(e.votingEndsAt)),
                        style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant),
                      ),
                      const SizedBox(height: Kx.s12),
                      if (e.published)
                        for (final p in e.posts) _ResultPost(post: p)
                      else if (e.voted)
                        Row(
                          key: Key('voted-${e.id}'),
                          children: [
                            Icon(Icons.verified, color: Tone.good(context)),
                            const SizedBox(width: Kx.s8),
                            Expanded(child: Text(l.elAlreadyVoted, style: context.text.bodyLarge?.copyWith(color: Tone.good(context)))),
                          ],
                        )
                      else if (e.canVote)
                        SizedBox(
                          width: double.infinity,
                          child: FilledButton.icon(key: Key('vote-${e.id}'), onPressed: () => _vote(e), icon: const Icon(Icons.how_to_vote), label: Text(l.elVoteNow)),
                        )
                      else
                        Text(l.elNotOpen, style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant)),
                    ],
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// A published post: candidates by votes, the elected ones marked.
class _ResultPost extends StatelessWidget {
  const _ResultPost({required this.post});

  final ElectionPost post;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final c = context.colors;
    final ranked = [...post.candidates]..sort((a, b) => (b.votes ?? 0).compareTo(a.votes ?? 0));
    final total = ranked.fold<int>(0, (n, x) => n + (x.votes ?? 0));
    return Padding(
      padding: const EdgeInsets.only(bottom: Kx.s12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(post.title, style: context.text.titleSmall),
          const SizedBox(height: Kx.s4),
          for (final x in ranked)
            Padding(
              key: Key('result-${x.id}'),
              padding: const EdgeInsets.symmetric(vertical: Kx.s4),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(child: Text(x.fullName, style: context.text.bodyLarge?.copyWith(fontWeight: x.elected ? FontWeight.w600 : null))),
                      if (x.elected) Pill(l.elElected, icon: Icons.emoji_events, background: Tone.goodContainer(context), foreground: Tone.good(context)),
                    ],
                  ),
                  const SizedBox(height: 2),
                  KxProgressBar(value: total == 0 ? 0 : (x.votes ?? 0) / total, label: l.elVotes(x.votes ?? 0), tone: x.elected ? KxTone.success : KxTone.neutral),
                ],
              ),
            ),
          if (ranked.isEmpty) Text(l.elNoCandidates, style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant)),
        ],
      ),
    );
  }
}

/// The ballot: pick up to each post's seats, review, and cast once. The choices are never shown again.
class BallotScreen extends StatefulWidget {
  const BallotScreen({super.key, required this.api, required this.studentId, required this.election});

  final StudentApi api;
  final String studentId;
  final Election election;

  @override
  State<BallotScreen> createState() => _BallotScreenState();
}

class _BallotScreenState extends State<BallotScreen> {
  late final Map<String, Set<String>> _picks = {for (final p in widget.election.posts) p.id: <String>{}};
  bool _busy = false;

  void _toggle(ElectionPost p, String candidateId) {
    final set = _picks[p.id]!;
    setState(() {
      if (p.seats == 1) {
        set
          ..clear()
          ..add(candidateId);
      } else if (set.contains(candidateId)) {
        set.remove(candidateId);
      } else if (set.length < p.seats) {
        set.add(candidateId);
      } else {
        say(context, context.l10n.elMaxPicks(p.seats));
      }
    });
  }

  Future<void> _cast() async {
    final l = context.l10n;
    final e = widget.election;
    final skipped = e.posts.where((p) => _picks[p.id]!.isEmpty).toList();
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(l.elConfirmTitle),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              for (final p in e.posts)
                Padding(
                  padding: const EdgeInsets.only(bottom: Kx.s8),
                  child: Text.rich(
                    TextSpan(
                      children: [
                        TextSpan(text: '${p.title}: ', style: const TextStyle(fontWeight: FontWeight.w600)),
                        TextSpan(text: _picks[p.id]!.isEmpty ? l.elNoChoice : [for (final c in p.candidates) if (_picks[p.id]!.contains(c.id)) c.fullName].join(', ')),
                      ],
                    ),
                  ),
                ),
              if (skipped.isNotEmpty) Text(l.elSkippedNote, style: TextStyle(color: Tone.warn(context))),
              const SizedBox(height: Kx.s8),
              Text(l.elFinalNote),
            ],
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: Text(l.elChange)),
          FilledButton(key: const Key('elConfirm'), onPressed: () => Navigator.pop(context, true), child: Text(l.elCast)),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    setState(() => _busy = true);
    try {
      await widget.api.vote(widget.studentId, e.id, {for (final p in e.posts) p.id: _picks[p.id]!.toList()});
      if (mounted) Navigator.of(context).pop(true);
    } on ApiException catch (err) {
      if (mounted) {
        setState(() => _busy = false);
        say(context, context.errorText(err));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final c = context.colors;
    final e = widget.election;
    final any = _picks.values.any((s) => s.isNotEmpty);
    return Scaffold(
      appBar: AppBar(title: Text(e.title)),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s8, Kx.s16, 96),
        children: [
          Container(
            padding: const EdgeInsets.all(Kx.s12),
            decoration: BoxDecoration(color: c.secondaryContainer, borderRadius: Kx.radiusMd),
            child: Row(
              children: [
                Icon(Icons.lock_outline, color: c.onSecondaryContainer),
                const SizedBox(width: Kx.s12),
                Expanded(child: Text(l.elSecretNote, style: context.text.bodyMedium?.copyWith(color: c.onSecondaryContainer))),
              ],
            ),
          ),
          for (final p in e.posts) ...[
            SectionTitle(p.title),
            Text(p.seats == 1 ? l.elPickOne : l.elPickUpTo(p.seats), style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant)),
            const SizedBox(height: Kx.s8),
            if (p.candidates.isEmpty) Text(l.elNoCandidates, style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant)),
            for (final x in p.candidates)
              Card(
                key: Key('candidate-${x.id}'),
                color: _picks[p.id]!.contains(x.id) ? c.primaryContainer : null,
                child: InkWell(
                  borderRadius: Kx.radiusLg,
                  onTap: _busy ? null : () => _toggle(p, x.id),
                  child: Padding(
                    padding: const EdgeInsets.all(Kx.s12),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Icon(
                          _picks[p.id]!.contains(x.id) ? (p.seats == 1 ? Icons.radio_button_checked : Icons.check_box) : (p.seats == 1 ? Icons.radio_button_unchecked : Icons.check_box_outline_blank),
                          color: _picks[p.id]!.contains(x.id) ? c.primary : c.onSurfaceVariant,
                        ),
                        const SizedBox(width: Kx.s12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(x.fullName, style: context.text.titleSmall),
                              if (x.className.isNotEmpty) Text(x.className, style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant)),
                              if (x.manifesto.isNotEmpty) Padding(padding: const EdgeInsets.only(top: Kx.s4), child: Text(x.manifesto, style: context.text.bodyMedium)),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
          ],
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        key: const Key('elCastButton'),
        onPressed: _busy || !any ? null : _cast,
        icon: _busy ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.how_to_vote),
        label: Text(l.elReview),
      ),
    );
  }
}

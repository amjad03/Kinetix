import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/campus_extras.dart';
import '../../l10n/l10n.dart';
import '../../widgets/common.dart';

String _day(DateTime d) => '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

/// Rate a canteen meal served today from one to five stars, with an optional note.
class RateMealScreen extends StatefulWidget {
  const RateMealScreen({super.key, required this.api, this.now});

  final StudentApi api;

  /// For tests; defaults to the device clock.
  final DateTime Function()? now;

  static Future<void> open(BuildContext context, StudentApi api) =>
      Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => RateMealScreen(api: api)));

  @override
  State<RateMealScreen> createState() => _RateMealScreenState();
}

class _RateMealScreenState extends State<RateMealScreen> {
  static const _meals = ['breakfast', 'lunch', 'snacks', 'dinner'];
  String _meal = 'lunch';
  int _stars = 0;
  bool _busy = false;
  final _comment = TextEditingController();

  @override
  void dispose() {
    _comment.dispose();
    super.dispose();
  }

  String _mealName(AppLocalizations l, String m) => switch (m) {
    'breakfast' => l.mealBreakfast,
    'lunch' => l.mealLunch,
    'snacks' => l.mealSnacks,
    _ => l.mealDinner,
  };

  Future<void> _send() async {
    final l = context.l10n;
    final messenger = ScaffoldMessenger.of(context);
    if (_stars == 0) {
      messenger.showSnackBar(SnackBar(content: Text(l.mealRatePick)));
      return;
    }
    setState(() => _busy = true);
    try {
      await widget.api.rateMeal(mealDate: _day((widget.now ?? DateTime.now)()), meal: _meal, rating: _stars, comment: _comment.text.trim());
      messenger.showSnackBar(SnackBar(content: Text(l.mealRateThanks)));
      if (mounted) Navigator.of(context).pop();
    } on ApiException catch (e) {
      if (mounted) messenger.showSnackBar(SnackBar(content: Text(context.errorText(e))));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return Scaffold(
      appBar: AppBar(title: Text(l.mealRateTitle)),
      body: ListView(
        padding: const EdgeInsets.all(Kx.s16),
        children: [
          Text(l.mealRateSub, style: context.text.bodyLarge?.copyWith(color: context.colors.onSurfaceVariant)),
          const SizedBox(height: Kx.s16),
          Wrap(
            spacing: Kx.s8,
            runSpacing: Kx.s8,
            children: [
              for (final m in _meals)
                ChoiceChip(key: Key('meal-$m'), label: Text(_mealName(l, m)), selected: _meal == m, onSelected: (_) => setState(() => _meal = m)),
            ],
          ),
          const SizedBox(height: Kx.s16),
          Wrap(
            children: [
              for (var i = 1; i <= 5; i++)
                IconButton(
                  key: Key('star-$i'),
                  tooltip: '$i',
                  iconSize: 36,
                  onPressed: () => setState(() => _stars = i),
                  icon: Icon(i <= _stars ? Icons.star_rounded : Icons.star_outline_rounded, color: i <= _stars ? Tone.warn(context) : null),
                ),
            ],
          ),
          const SizedBox(height: Kx.s8),
          TextField(
            key: const Key('mealComment'),
            controller: _comment,
            maxLength: 500,
            maxLines: 3,
            decoration: InputDecoration(labelText: l.mealRateComment, border: const OutlineInputBorder()),
          ),
          const SizedBox(height: Kx.s8),
          FilledButton(key: const Key('mealSend'), onPressed: _busy ? null : _send, child: Text(l.mealRateSend)),
        ],
      ),
    );
  }
}

/// The repairs the person asked for and where each stands.
class RepairRequestsScreen extends StatefulWidget {
  const RepairRequestsScreen({super.key, required this.api});

  final StudentApi api;

  static Future<void> open(BuildContext context, StudentApi api) =>
      Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => RepairRequestsScreen(api: api)));

  @override
  State<RepairRequestsScreen> createState() => _RepairRequestsScreenState();
}

class _RepairRequestsScreenState extends State<RepairRequestsScreen> {
  List<RepairRequest>? _items;
  ApiException? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final r = await widget.api.repairRequests();
      if (mounted) setState(() => _items = r);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  String _status(AppLocalizations l, String s) => switch (s) {
    'assigned' => l.repairAssigned,
    'in_progress' => l.repairInProgress,
    'done' => l.repairDone,
    'verified' => l.repairClosed,
    _ => l.repairWaiting,
  };

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final c = context.colors;
    final items = _items;
    return Scaffold(
      appBar: AppBar(title: Text(l.repairTitle)),
      body: items == null
          ? (_error == null ? const Center(child: CircularProgressIndicator()) : Padding(padding: const EdgeInsets.all(Kx.s16), child: ErrorBanner(_error!, onRetry: _load)))
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.all(Kx.s16),
                children: [
                  if (items.isEmpty) Text(l.repairEmpty, key: const Key('repairEmpty'), style: context.text.bodyLarge?.copyWith(color: c.onSurfaceVariant)),
                  for (final r in items)
                    Card(
                      key: Key('repair-${r.id}'),
                      child: Padding(
                        padding: const EdgeInsets.all(Kx.s16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Expanded(child: Text(r.title, style: context.text.titleSmall)),
                                const SizedBox(width: Kx.s8),
                                Pill(
                                  _status(l, r.status),
                                  background: r.finished ? Tone.goodContainer(context) : c.secondaryContainer,
                                  foreground: r.finished ? Tone.good(context) : c.onSecondaryContainer,
                                ),
                              ],
                            ),
                            if (r.complaint.isNotEmpty) Text(r.complaint, style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant)),
                            if (!r.finished && r.dueOn != null) Text(l.repairDueOn(context.fmt.shortDay(r.dueOn!)), style: context.text.bodySmall),
                            if (r.completedAt != null) Text(l.repairFixedOn(context.fmt.shortDay(r.completedAt!)), style: context.text.bodySmall),
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

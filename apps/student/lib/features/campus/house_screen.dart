import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/growth.dart';
import '../../l10n/l10n.dart';
import '../../widgets/common.dart';

String _categoryLabel(AppLocalizations l, String c) => switch (c) {
  'academics' => l.houseCatAcademics,
  'sports' => l.houseCatSports,
  'arts' => l.houseCatArts,
  'discipline' => l.houseCatDiscipline,
  'service' => l.houseCatService,
  _ => l.houseCatGeneral,
};

/// My house, its recent points and my own, and the leaderboard of all houses.
class HouseScreen extends StatefulWidget {
  const HouseScreen({super.key, required this.api, required this.studentId});

  final StudentApi api;
  final String studentId;

  static Future<void> open(BuildContext context, StudentApi api, String studentId) =>
      Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => HouseScreen(api: api, studentId: studentId)));

  @override
  State<HouseScreen> createState() => _HouseScreenState();
}

class _HouseScreenState extends State<HouseScreen> {
  List<HouseRow>? _houses;
  HouseRow? _mine;
  HouseDetail? _detail;
  ApiException? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  /// The houses, then each in turn until one lists me as a member.
  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final rows = await widget.api.houses();
      HouseRow? mine;
      HouseDetail? detail;
      for (final h in rows) {
        final d = await widget.api.houseDetail(h.id);
        if (d.members.any((m) => m.studentId == widget.studentId)) {
          mine = h;
          detail = d;
          break;
        }
      }
      if (mounted) {
        setState(() {
          _houses = rows;
          _mine = mine;
          _detail = detail;
        });
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final rows = _houses;
    final d = _detail;
    final me = d?.members.where((m) => m.studentId == widget.studentId).firstOrNull;
    return Scaffold(
      appBar: AppBar(title: Text(l.houseTitle)),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(Kx.s16),
          children: [
            if (_error != null) ErrorBanner(_error!, onRetry: _load),
            if (rows == null && _error == null) const KxLoading(),
            if (rows != null && _mine == null) KxEmptyState(icon: Icons.emoji_events_outlined, message: l.houseNone),
            if (_mine != null && d != null) ...[
              Card(
                key: const Key('myHouse'),
                child: Padding(
                  padding: const EdgeInsets.all(Kx.s16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(d.name, style: context.text.headlineSmall),
                      if (d.motto.isNotEmpty) Text(d.motto),
                      const SizedBox(height: Kx.s8),
                      Text('${l.houseRank} ${_mine!.rank} · ${d.total} ${l.housePointsLabel}', key: const Key('houseSummary')),
                      if (me != null) Text('${l.houseMyPoints}: ${me.points}${me.isCaptain ? ' · ${l.houseCaptain}' : ''}', key: const Key('myHousePoints')),
                    ],
                  ),
                ),
              ),
              if (d.ledger.isNotEmpty) ...[
                const SizedBox(height: Kx.s16),
                Text(l.houseRecent, style: context.text.titleMedium),
                for (final p in d.ledger.take(10))
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text(p.reason),
                    subtitle: Text('${_categoryLabel(l, p.category)} · ${p.awardedOn}'),
                    trailing: Text(p.points > 0 ? '+${p.points}' : '${p.points}', style: context.text.titleMedium),
                  ),
              ],
            ],
            if (rows != null && rows.isNotEmpty) ...[
              const SizedBox(height: Kx.s16),
              Text(l.houseLeaderboard, style: context.text.titleMedium),
              for (final h in rows)
                ListTile(
                  key: Key('leader-${h.id}'),
                  contentPadding: EdgeInsets.zero,
                  selected: h.id == _mine?.id,
                  leading: CircleAvatar(child: Text('${h.rank}')),
                  title: Text(h.name),
                  subtitle: Text('${h.members} ${l.houseMembers}'),
                  trailing: Text('${h.points}', style: context.text.titleMedium),
                ),
            ],
          ],
        ),
      ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:zynetix_ui/zynetix_ui.dart';

import '../../core/api.dart';
import '../../core/campus_services.dart';
import '../../core/hostel_life.dart';
import '../../l10n/l10n.dart';
import '../../widgets/common.dart';
import '../../widgets/load_view.dart';

/// The resident's gate QR, whether they are out or in, and their last moves through the gate.
class GateQrScreen extends StatefulWidget {
  const GateQrScreen({super.key, required this.api, required this.studentId});

  final StudentApi api;
  final String studentId;

  static Future<void> open(BuildContext context, StudentApi api, String studentId) =>
      Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => GateQrScreen(api: api, studentId: studentId)));

  @override
  State<GateQrScreen> createState() => _GateQrScreenState();
}

class _GateQrScreenState extends State<GateQrScreen> {
  GateQr? _qr;
  HostelView? _view;
  ApiException? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final r = await Future.wait<Object>([widget.api.gateQr(widget.studentId), widget.api.hostel(widget.studentId)]);
      if (mounted) {
        setState(() {
          _qr = r[0] as GateQr;
          _view = r[1] as HostelView;
        });
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final c = context.colors;
    final qr = _qr;
    final v = _view;
    return Scaffold(
      appBar: AppBar(title: Text(l.hlGateQr)),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s8, Kx.s16, Kx.s32),
          children: [
            if (_error != null) ErrorBanner(_error!, onRetry: _load),
            if (qr == null && _error == null) const KxLoading(),
            if (qr != null && v != null) ...[
              KxCard(
                child: Column(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(Kx.s12),
                      decoration: BoxDecoration(color: Colors.white, borderRadius: Kx.radiusMd),
                      child: QrImageView(key: const Key('gateQr'), data: qr.code, size: 220, backgroundColor: Colors.white),
                    ),
                    const SizedBox(height: Kx.s12),
                    Text(l.gatePassRoom(v.block ?? '', v.room ?? ''), style: context.text.titleMedium),
                    const SizedBox(height: Kx.s4),
                    Pill(v.outNow ? l.hlYouAreOut : l.hlYouAreIn, key: const Key('gateState'), background: v.outNow ? c.tertiaryContainer : c.primaryContainer, foreground: v.outNow ? c.onTertiaryContainer : c.onPrimaryContainer),
                    const SizedBox(height: Kx.s12),
                    Text(l.hlGateQrHelp, textAlign: TextAlign.center, style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant)),
                  ],
                ),
              ),
              SectionTitle(l.hlRecentMoves),
              if (v.gateLog.isEmpty) EmptyNote(l.hlNoMoves),
              for (final m in v.gateLog) _MoveTile(move: m),
            ],
          ],
        ),
      ),
    );
  }
}

class _MoveTile extends StatelessWidget {
  const _MoveTile({required this.move});

  final GateMove move;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final m = move;
    final out = m.direction == 'out';
    return Card(
      key: Key('gateMove-${m.id}'),
      child: ListTile(
        leading: Icon(out ? Icons.logout : Icons.login, color: m.minutesLate > 0 ? context.colors.error : null),
        title: Text('${out ? l.hlOut : l.hlIn} · ${context.fmt.date(m.at)} ${context.fmt.time(m.at)}'),
        subtitle: Text([if (m.withPass) l.hlOnPass, if (m.method == 'manual') l.hlByHand, if (m.minutesLate > 0) l.hlLateBy(m.minutesLate)].join(' · ')),
      ),
    );
  }
}

/// My complaints about the room and the hostel, and a form to raise one.
class HostelComplaintsScreen extends StatefulWidget {
  const HostelComplaintsScreen({super.key, required this.api, required this.studentId});

  final StudentApi api;
  final String studentId;

  static Future<void> open(BuildContext context, StudentApi api, String studentId) =>
      Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => HostelComplaintsScreen(api: api, studentId: studentId)));

  @override
  State<HostelComplaintsScreen> createState() => _HostelComplaintsScreenState();
}

class _HostelComplaintsScreenState extends State<HostelComplaintsScreen> {
  List<HostelComplaint>? _items;
  ApiException? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final items = await widget.api.hostelComplaints(widget.studentId);
      if (mounted) setState(() => _items = items);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  Future<void> _raise() async {
    final sent = await showModalBottomSheet<bool>(context: context, isScrollControlled: true, showDragHandle: true, builder: (_) => _ComplaintSheet(api: widget.api, studentId: widget.studentId));
    if (sent == true && mounted) {
      say(context, context.l10n.hlComplaintSent);
      await _load();
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final items = _items;
    return Scaffold(
      appBar: AppBar(title: Text(l.hlComplaints)),
      floatingActionButton: FloatingActionButton.extended(key: const Key('hlRaise'), onPressed: _raise, icon: const Icon(Icons.report_problem_outlined), label: Text(l.hlRaise)),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s8, Kx.s16, 96),
          children: [
            if (_error != null) ErrorBanner(_error!, onRetry: _load),
            if (items == null && _error == null) const KxLoading(),
            if (items != null && items.isEmpty) EmptyNote(l.hlNoComplaints),
            for (final x in items ?? const <HostelComplaint>[])
              Card(
                key: Key('complaint-${x.id}'),
                child: ListTile(
                  title: Text(x.description),
                  subtitle: Text([categoryWord(l, x.category), if (x.createdAt != null) context.fmt.date(x.createdAt!), if ((x.resolution ?? '').isNotEmpty) x.resolution!].join(' · ')),
                  trailing: _statusPill(context, x.status),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _statusPill(BuildContext context, String status) {
    final l = context.l10n;
    final t = kxTone(context, switch (status) {
      'resolved' => KxTone.success,
      'in_progress' => KxTone.primary,
      _ => KxTone.warning,
    });
    final word = switch (status) {
      'resolved' => l.hlResolved,
      'in_progress' => l.hlInProgress,
      _ => l.hlOpen,
    };
    return ConstrainedBox(constraints: const BoxConstraints(maxWidth: 140), child: Pill(word, background: t.bg, foreground: t.fg));
  }
}

/// The word for a complaint's category.
String categoryWord(AppLocalizations l, String c) => switch (c) {
  'maintenance' => l.hlCatMaintenance,
  'food' => l.hlCatFood,
  'cleanliness' => l.hlCatCleanliness,
  'safety' => l.hlCatSafety,
  _ => l.hlCatOther,
};

class _ComplaintSheet extends StatefulWidget {
  const _ComplaintSheet({required this.api, required this.studentId});

  final StudentApi api;
  final String studentId;

  @override
  State<_ComplaintSheet> createState() => _ComplaintSheetState();
}

class _ComplaintSheetState extends State<_ComplaintSheet> {
  String _category = 'maintenance';
  final _text = TextEditingController();
  bool _busy = false;
  Object? _problem;

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final l = context.l10n;
    if (_text.text.trim().length < 3) return setState(() => _problem = l.hlDescribeShort);
    setState(() {
      _busy = true;
      _problem = null;
    });
    try {
      await widget.api.raiseHostelComplaint(widget.studentId, category: _category, description: _text.text.trim());
      if (mounted) Navigator.pop(context, true);
    } on ApiException catch (e) {
      if (mounted) {
        setState(() {
          _busy = false;
          _problem = e;
        });
      }
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
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(l.hlRaise, style: context.text.titleLarge),
            const SizedBox(height: Kx.s16),
            Text(l.hlCategory, style: context.text.labelLarge),
            const SizedBox(height: Kx.s8),
            Wrap(
              spacing: Kx.s8,
              runSpacing: Kx.s8,
              children: [
                for (final c in HostelComplaint.categories)
                  ChoiceChip(key: Key('cat-$c'), label: Text(categoryWord(l, c)), selected: _category == c, onSelected: (_) => setState(() => _category = c)),
              ],
            ),
            const SizedBox(height: Kx.s12),
            TextField(key: const Key('hlText'), controller: _text, maxLength: 1000, maxLines: 4, decoration: InputDecoration(labelText: l.hlDescribe)),
            if (_problem != null) Padding(padding: const EdgeInsets.only(top: Kx.s12), child: ErrorBanner(_problem!)),
            const SizedBox(height: Kx.s16),
            FilledButton(key: const Key('hlSend'), onPressed: _busy ? null : _send, style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(Kx.target)), child: Text(l.hsSend)),
          ],
        ),
      ),
    );
  }
}

/// The week's mess menu, today first.
class MessMenuScreen extends StatefulWidget {
  const MessMenuScreen({super.key, required this.api, this.now});

  final StudentApi api;

  /// For tests; defaults to the device clock.
  final DateTime Function()? now;

  static Future<void> open(BuildContext context, StudentApi api) => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => MessMenuScreen(api: api)));

  @override
  State<MessMenuScreen> createState() => _MessMenuScreenState();
}

class _MessMenuScreenState extends State<MessMenuScreen> {
  List<MenuMeal>? _menu;
  ApiException? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final m = await widget.api.messMenu();
      if (mounted) setState(() => _menu = m);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final menu = _menu;
    final today = (widget.now ?? DateTime.now)().weekday;
    final days = [for (var i = 0; i < 7; i++) (today - 1 + i) % 7 + 1];
    return Scaffold(
      appBar: AppBar(title: Text(l.hlMessMenu)),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s8, Kx.s16, Kx.s32),
          children: [
            if (_error != null) ErrorBanner(_error!, onRetry: _load),
            if (menu == null && _error == null) const KxLoading(),
            if (menu != null && menu.isEmpty) EmptyNote(l.hlNoMenu),
            if (menu != null && menu.isNotEmpty)
              for (final d in days)
                if (menu.any((m) => m.dayOfWeek == d)) _DayCard(day: d, today: d == today, meals: [for (final meal in MenuMeal.order) ...menu.where((m) => m.dayOfWeek == d && m.meal == meal)]),
          ],
        ),
      ),
    );
  }
}

class _DayCard extends StatelessWidget {
  const _DayCard({required this.day, required this.today, required this.meals});

  final int day;
  final bool today;
  final List<MenuMeal> meals;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final c = context.colors;
    return Card(
      key: Key('menuDay-$day'),
      color: today ? c.primaryContainer : null,
      child: Padding(
        padding: const EdgeInsets.all(Kx.s12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(today ? '${context.fmt.weekdayName(day)} · ${l.hlToday}' : context.fmt.weekdayName(day), style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w600)),
            const SizedBox(height: Kx.s8),
            for (final m in meals)
              Padding(
                padding: const EdgeInsets.only(bottom: Kx.s4),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    SizedBox(width: 96, child: Text(_mealWord(l, m.meal), style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant))),
                    Expanded(child: Text(m.items, style: context.text.bodyMedium)),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }

  static String _mealWord(AppLocalizations l, String m) => switch (m) {
    'breakfast' => l.hlBreakfast,
    'lunch' => l.hlLunch,
    'snacks' => l.hlSnacks,
    _ => l.hlDinner,
  };
}

/// The anti-ragging helplines and the hostel's committees, with a tap to call.
class HostelSafetyCard extends StatefulWidget {
  const HostelSafetyCard({super.key, required this.api, this.call});

  final StudentApi api;

  /// For tests; defaults to opening the phone dialler.
  final Future<void> Function(String number)? call;

  @override
  State<HostelSafetyCard> createState() => _HostelSafetyCardState();
}

class _HostelSafetyCardState extends State<HostelSafetyCard> {
  HostelSafety? _s;

  @override
  void initState() {
    super.initState();
    widget.api.hostelSafety().then((s) {
      if (mounted) setState(() => _s = s);
    }, onError: (_) {});
  }

  Future<void> _call(String number) async {
    final digits = number.replaceAll(RegExp(r'[^0-9+]'), '');
    if (widget.call != null) return widget.call!(digits);
    await launchUrl(Uri(scheme: 'tel', path: digits));
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final s = _s;
    if (s == null) return const SizedBox.shrink();
    return SectionCard(
      key: const Key('hlSafety'),
      icon: Icons.health_and_safety_outlined,
      title: l.hlSafety,
      child: Column(
        children: [
          _CallRow(label: l.hlNationalHelpline, number: s.nationalHelpline, onCall: _call),
          for (final x in s.committees.where((x) => x.helpline.isNotEmpty)) _CallRow(label: _purpose(l, x.purpose), number: x.helpline, onCall: _call),
        ],
      ),
    );
  }

  static String _purpose(AppLocalizations l, String p) => switch (p) {
    'anti_ragging' => l.hlPurposeAntiRagging,
    'anti_ragging_squad' => l.hlPurposeSquad,
    'mess' => l.hlPurposeMess,
    _ => l.hlPurposeDiscipline,
  };
}

class _CallRow extends StatelessWidget {
  const _CallRow({required this.label, required this.number, required this.onCall});

  final String label;
  final String number;
  final Future<void> Function(String) onCall;

  @override
  Widget build(BuildContext context) => ListTile(
    contentPadding: EdgeInsets.zero,
    title: Text(label),
    subtitle: Text(number),
    trailing: IconButton(tooltip: context.l10n.hlCall, icon: const Icon(Icons.call_outlined), onPressed: () => onCall(number)),
  );
}

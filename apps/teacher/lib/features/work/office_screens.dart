import 'package:flutter/material.dart';
import 'package:zynetix_ui/zynetix_ui.dart';

import '../../core/api.dart';
import '../../core/desk_models.dart';
import '../../core/format.dart';
import '../../core/hr_models.dart' show dayString;
import '../../core/l10n.dart';
import '../../widgets/async_body.dart';
import '../../widgets/common.dart';

/// "₹1,800" for 180000 paise.
String _rupees(int paise) {
  final r = (paise / 100).round().toString();
  if (r.length <= 3) return '₹$r';
  final last = r.substring(r.length - 3);
  var rest = r.substring(0, r.length - 3);
  final parts = <String>[];
  while (rest.length > 2) {
    parts.insert(0, rest.substring(rest.length - 2));
    rest = rest.substring(0, rest.length - 2);
  }
  if (rest.isNotEmpty) parts.insert(0, rest);
  return '₹${parts.join(',')},$last';
}

(Color, Color) _tone(BuildContext context, String status) {
  final c = context.colors;
  return switch (status) {
    'approved' || 'ordered' => (c.secondaryContainer, c.onSecondaryContainer),
    'rejected' => (c.errorContainer, c.onErrorContainer),
    'cancelled' => (c.surfaceContainerHighest, c.onSurfaceVariant),
    _ => (c.tertiaryContainer, c.onTertiaryContainer),
  };
}

// ── Indents ───────────────────────────────────────────────────────────────────────────────────

/// The teacher's indents and where each stands (head of department, then principal), and raising one.
class IndentsScreen extends StatefulWidget {
  const IndentsScreen({super.key, required this.api});

  final TeacherApi api;

  @override
  State<IndentsScreen> createState() => _IndentsScreenState();
}

class _IndentsScreenState extends State<IndentsScreen> {
  var _version = 0;

  String _status(AppLocalizations l, Indent i) => switch (i.status) {
    'approved' => l.indentApproved,
    'rejected' => l.indentRejected,
    'ordered' => l.indentOrdered,
    _ => i.step == 'hod' ? l.indentWithHod : l.indentWithPrincipal,
  };

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final f = Fmt.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(l.indentsTitle)),
      floatingActionButton: FloatingActionButton.extended(
        key: const Key('raiseIndent'),
        onPressed: () async {
          final done = await Navigator.of(context).push<bool>(MaterialPageRoute(fullscreenDialog: true, builder: (_) => RaiseIndentScreen(api: widget.api)));
          if (done == true && context.mounted) {
            ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(l.indentRaised)));
            setState(() => _version++);
          }
        },
        icon: const Icon(Icons.add_shopping_cart),
        label: Text(l.indentRaise),
      ),
      body: AsyncBody<List<Indent>>(
        key: ValueKey('indents-$_version'),
        load: widget.api.myIndents,
        isEmpty: (rows) => rows.isEmpty,
        empty: l.indentsEmpty,
        builder: (context, rows, reload) => ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s16, Kx.s16, 96),
          children: [
            for (final i in rows)
              Card(
                key: Key('indent-${i.id}'),
                child: Padding(
                  padding: const EdgeInsets.all(Kx.s12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(child: Text(i.number, style: context.text.titleSmall)),
                          Builder(builder: (context) {
                            final (bg, fg) = _tone(context, i.status);
                            return Pill(_status(l, i), background: bg, foreground: fg);
                          }),
                        ],
                      ),
                      if (i.reason.isNotEmpty) Text(i.reason),
                      for (final line in i.lines) Text('• ${line.item}: ${line.qty} ${line.unit}', style: context.text.bodyMedium),
                      if (i.neededBy != null) Text(l.indentNeededBy(f.shortDay(i.neededBy!)), style: context.text.bodySmall),
                      if (i.estimatedPaise > 0) Text(l.indentEstimate(_rupees(i.estimatedPaise)), style: context.text.bodySmall),
                      if ((i.decisionNote ?? '').isNotEmpty) Text(i.decisionNote!, style: context.text.bodySmall?.copyWith(color: context.colors.onSurfaceVariant)),
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

/// Raising an indent: items from the store with quantities, why, and when they are needed.
class RaiseIndentScreen extends StatefulWidget {
  const RaiseIndentScreen({super.key, required this.api, this.today});

  final TeacherApi api;
  final DateTime? today;

  @override
  State<RaiseIndentScreen> createState() => _RaiseIndentScreenState();
}

class _RaiseIndentScreenState extends State<RaiseIndentScreen> {
  List<StockItem>? _items;
  final _qty = <String, int>{};
  final _reason = TextEditingController();
  DateTime? _neededBy;
  String _filter = '';
  bool _busy = false;
  String? _problem;

  @override
  void initState() {
    super.initState();
    widget.api.stockItems().then((v) {
      if (mounted) setState(() => _items = [for (final i in v) if (i.active) i]);
    }, onError: (Object e) {
      if (mounted) setState(() => _problem = e is ApiException ? context.l10n.errorText(e) : '$e');
    });
  }

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final l = context.l10n;
    final lines = [for (final e in _qty.entries) if (e.value > 0) e];
    if (lines.isEmpty) return setState(() => _problem = l.indentPickItems);
    if (_reason.text.trim().length < 3) return setState(() => _problem = l.indentReasonNeeded);
    setState(() {
      _busy = true;
      _problem = null;
    });
    try {
      final items = {for (final i in _items!) i.id: i};
      await widget.api.raiseIndent(
        reason: _reason.text.trim(),
        neededBy: _neededBy == null ? null : dayString(_neededBy!),
        lines: [for (final e in lines) (itemId: e.key, qty: e.value, estUnitPaise: (items[e.key]?.lastPricePaise ?? 0) > 0 ? items[e.key]!.lastPricePaise : null)],
      );
      if (mounted) Navigator.pop(context, true);
    } on ApiException catch (e) {
      if (mounted) {
        setState(() {
          _busy = false;
          _problem = context.l10n.errorText(e);
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final f = Fmt.of(context);
    final c = context.colors;
    final items = _items;
    final today = DateUtils.dateOnly(widget.today ?? DateTime.now());
    final shown = items?.where((i) => _filter.isEmpty || '${i.name} ${i.category} ${i.sku}'.toLowerCase().contains(_filter.toLowerCase())).toList();
    final total = [for (final e in _qty.entries) (items?.where((i) => i.id == e.key).firstOrNull?.lastPricePaise ?? 0) * e.value].fold(0, (a, b) => a + b);
    return Scaffold(
      appBar: AppBar(title: Text(l.indentRaise)),
      body: items == null
          ? Center(child: _problem == null ? const CircularProgressIndicator() : Padding(padding: const EdgeInsets.all(Kx.s16), child: ErrorBanner(_problem!)))
          : ListView(
              padding: const EdgeInsets.all(Kx.s16),
              children: [
                TextField(key: const Key('indentReason'), controller: _reason, maxLength: 300, decoration: InputDecoration(labelText: l.indentReason)),
                ListTile(
                  key: const Key('indentNeededBy'),
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.event),
                  title: Text(l.indentNeededByLabel),
                  trailing: Text(_neededBy == null ? l.indentAnyTime : f.shortDay(_neededBy!)),
                  onTap: () async {
                    final d = await showDatePicker(context: context, initialDate: today.add(const Duration(days: 7)), firstDate: today, lastDate: today.add(const Duration(days: 365)));
                    if (d != null) setState(() => _neededBy = d);
                  },
                ),
                TextField(
                  key: const Key('indentFilter'),
                  decoration: InputDecoration(prefixIcon: const Icon(Icons.search), hintText: l.indentSearchItems),
                  onChanged: (v) => setState(() => _filter = v.trim()),
                ),
                const SizedBox(height: Kx.s8),
                if (shown!.isEmpty) Padding(padding: const EdgeInsets.all(Kx.s16), child: Text(l.indentNoItems)),
                for (final i in shown)
                  Card(
                    key: Key('item-${i.id}'),
                    child: ListTile(
                      title: Text(i.name),
                      subtitle: Text([if (i.category.isNotEmpty) i.category, l.indentInStock(i.onHand, i.unit), if (i.lastPricePaise > 0) l.indentLastPrice(_rupees(i.lastPricePaise))].join(' · ')),
                      trailing: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          IconButton(key: Key('less-${i.id}'), tooltip: l.indentLess, icon: const Icon(Icons.remove_circle_outline), onPressed: (_qty[i.id] ?? 0) == 0 ? null : () => setState(() => _qty[i.id] = (_qty[i.id] ?? 0) - 1)),
                          SizedBox(width: 28, child: Text('${_qty[i.id] ?? 0}', key: Key('qty-${i.id}'), textAlign: TextAlign.center, style: context.text.titleMedium)),
                          IconButton(key: Key('more-${i.id}'), tooltip: l.indentMore, icon: const Icon(Icons.add_circle_outline), onPressed: () => setState(() => _qty[i.id] = (_qty[i.id] ?? 0) + 1)),
                        ],
                      ),
                    ),
                  ),
                if (total > 0) Padding(padding: const EdgeInsets.only(top: Kx.s8), child: Text(l.indentEstimate(_rupees(total)), key: const Key('indentTotal'), style: context.text.titleSmall)),
                Text(l.indentFlowNote, style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant)),
                if (_problem != null) Padding(padding: const EdgeInsets.only(top: Kx.s12), child: ErrorBanner(_problem!)),
                const SizedBox(height: Kx.s16),
                FilledButton(key: const Key('sendIndent'), onPressed: _busy ? null : _send, child: Text(l.indentSend)),
              ],
            ),
    );
  }
}

// ── Rooms and halls ───────────────────────────────────────────────────────────────────────────

/// The teacher's room and hall bookings, and booking one.
class RoomBookingsScreen extends StatefulWidget {
  const RoomBookingsScreen({super.key, required this.api});

  final TeacherApi api;

  @override
  State<RoomBookingsScreen> createState() => _RoomBookingsScreenState();
}

class _RoomBookingsScreenState extends State<RoomBookingsScreen> {
  var _version = 0;

  String _status(AppLocalizations l, String s) => switch (s) {
    'approved' => l.bookingApproved,
    'rejected' => l.bookingRejected,
    'cancelled' => l.bookingCancelled,
    _ => l.bookingPending,
  };

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final f = Fmt.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(l.bookingsTitle)),
      floatingActionButton: FloatingActionButton.extended(
        key: const Key('bookRoom'),
        onPressed: () async {
          final done = await Navigator.of(context).push<bool>(MaterialPageRoute(fullscreenDialog: true, builder: (_) => BookRoomScreen(api: widget.api)));
          if (done == true && context.mounted) {
            ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(l.bookingSent)));
            setState(() => _version++);
          }
        },
        icon: const Icon(Icons.meeting_room_outlined),
        label: Text(l.bookingNew),
      ),
      body: AsyncBody<List<RoomBooking>>(
        key: ValueKey('bookings-$_version'),
        load: widget.api.myBookings,
        isEmpty: (rows) => rows.isEmpty,
        empty: l.bookingsEmpty,
        builder: (context, rows, reload) => ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s16, Kx.s16, 96),
          children: [
            for (final b in rows)
              Card(
                key: Key('booking-${b.id}'),
                child: ListTile(
                  leading: const Icon(Icons.meeting_room_outlined),
                  title: Text('${b.title} · ${b.room}'),
                  subtitle: Text([f.shortDay(b.onDate), '${b.startsAt}–${b.endsAt}', b.number, if ((b.decisionNote ?? '').isNotEmpty) b.decisionNote!].join(' · ')),
                  trailing: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Builder(builder: (context) {
                        final (bg, fg) = _tone(context, b.status);
                        return Pill(_status(l, b.status), background: bg, foreground: fg);
                      }),
                      if (b.status == 'pending' || b.status == 'approved')
                        InkWell(
                          key: Key('cancelBooking-${b.id}'),
                          onTap: () async {
                            final ok = await showDialog<bool>(
                              context: context,
                              builder: (ctx) => AlertDialog(
                                title: Text(l.bookingCancelTitle),
                                actions: [
                                  TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(l.cancel)),
                                  FilledButton(key: const Key('confirmCancelBooking'), onPressed: () => Navigator.pop(ctx, true), child: Text(l.bookingCancelAction)),
                                ],
                              ),
                            );
                            if (ok == true && context.mounted && await runOrSnack(context, () => widget.api.cancelBooking(b.id))) await reload();
                          },
                          child: Padding(padding: const EdgeInsets.only(top: Kx.s4), child: Text(l.bookingCancelAction, style: context.text.labelMedium?.copyWith(color: context.colors.error))),
                        ),
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

/// Booking a room or hall: the room, the day with what already holds it, the times and why.
class BookRoomScreen extends StatefulWidget {
  const BookRoomScreen({super.key, required this.api, this.today});

  final TeacherApi api;
  final DateTime? today;

  @override
  State<BookRoomScreen> createState() => _BookRoomScreenState();
}

class _BookRoomScreenState extends State<BookRoomScreen> {
  List<BookableRoom>? _rooms;
  String? _roomId;
  late final DateTime _today = DateUtils.dateOnly(widget.today ?? DateTime.now());
  late DateTime _date = _today.add(const Duration(days: 1));
  TimeOfDay _from = const TimeOfDay(hour: 14, minute: 0);
  TimeOfDay _to = const TimeOfDay(hour: 15, minute: 0);
  final _title = TextEditingController();
  final _purpose = TextEditingController();
  final _attendees = TextEditingController();
  RoomDay? _day;
  bool _busy = false;
  String? _problem;

  @override
  void initState() {
    super.initState();
    widget.api.bookableRooms().then((v) {
      if (!mounted) return;
      setState(() {
        _rooms = v;
        _roomId = v.firstOrNull?.id;
      });
      _loadDay();
    }, onError: (Object e) {
      if (mounted) setState(() => _problem = e is ApiException ? context.l10n.errorText(e) : '$e');
    });
  }

  @override
  void dispose() {
    _title.dispose();
    _purpose.dispose();
    _attendees.dispose();
    super.dispose();
  }

  String _hm(TimeOfDay t) => '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';

  Future<void> _loadDay() async {
    final id = _roomId;
    if (id == null) return;
    try {
      final d = await widget.api.roomDay(id, dayString(_date));
      if (mounted) setState(() => _day = d);
    } on ApiException {
      if (mounted) setState(() => _day = null);
    }
  }

  /// What already holds the room in the chosen time, if anything.
  RoomUse? get _clash {
    final from = _hm(_from), to = _hm(_to);
    return _day?.uses.where((u) => u.startsAt.compareTo(to) < 0 && from.compareTo(u.endsAt) < 0).firstOrNull;
  }

  Future<void> _send() async {
    final l = context.l10n;
    if (_title.text.trim().length < 2) return setState(() => _problem = l.bookingTitleNeeded);
    if (_hm(_to).compareTo(_hm(_from)) <= 0) return setState(() => _problem = l.bookingTimesOrder);
    final n = _attendees.text.trim().isEmpty ? null : int.tryParse(_attendees.text.trim());
    if (_attendees.text.trim().isNotEmpty && (n == null || n < 1)) return setState(() => _problem = l.bookingAttendeesNumber);
    final room = _rooms!.firstWhere((r) => r.id == _roomId);
    if (n != null && room.capacity != null && n > room.capacity!) return setState(() => _problem = l.bookingTooMany(room.name, room.capacity!));
    setState(() {
      _busy = true;
      _problem = null;
    });
    try {
      await widget.api.bookRoom(roomId: room.id, title: _title.text.trim(), purpose: _purpose.text.trim(), attendees: n, onDate: dayString(_date), startsAt: _hm(_from), endsAt: _hm(_to));
      if (mounted) Navigator.pop(context, true);
    } on ApiException catch (e) {
      if (mounted) {
        setState(() {
          _busy = false;
          _problem = context.l10n.errorText(e);
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final f = Fmt.of(context);
    final c = context.colors;
    final rooms = _rooms;
    final clash = _clash;
    return Scaffold(
      appBar: AppBar(title: Text(l.bookingNew)),
      body: rooms == null
          ? Center(child: _problem == null ? const CircularProgressIndicator() : Padding(padding: const EdgeInsets.all(Kx.s16), child: ErrorBanner(_problem!)))
          : rooms.isEmpty
          ? Center(child: Padding(padding: const EdgeInsets.all(Kx.s24), child: Text(l.bookingNoRooms, key: const Key('noRooms'), textAlign: TextAlign.center)))
          : ListView(
              padding: const EdgeInsets.all(Kx.s16),
              children: [
                DropdownButtonFormField<String>(
                  key: const Key('bookingRoom'),
                  initialValue: _roomId,
                  isExpanded: true,
                  decoration: InputDecoration(labelText: l.bookingRoom),
                  items: [
                    for (final r in rooms) DropdownMenuItem(value: r.id, child: Text(r.capacity == null ? r.name : l.bookingRoomSeats(r.name, r.capacity!), overflow: TextOverflow.ellipsis)),
                  ],
                  onChanged: (v) {
                    setState(() => _roomId = v);
                    _loadDay();
                  },
                ),
                ListTile(
                  key: const Key('bookingDate'),
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.event),
                  title: Text(l.bookingDay),
                  trailing: Text(f.shortDay(_date)),
                  onTap: () async {
                    final d = await showDatePicker(context: context, initialDate: _date, firstDate: _today, lastDate: _today.add(const Duration(days: 180)));
                    if (d == null) return;
                    setState(() => _date = d);
                    await _loadDay();
                  },
                ),
                Row(
                  children: [
                    Expanded(
                      child: ListTile(
                        key: const Key('bookingFrom'),
                        contentPadding: EdgeInsets.zero,
                        title: Text(l.bookingFrom),
                        subtitle: Text(_hm(_from)),
                        onTap: () async {
                          final t = await showTimePicker(context: context, initialTime: _from);
                          if (t != null) setState(() => _from = t);
                        },
                      ),
                    ),
                    Expanded(
                      child: ListTile(
                        key: const Key('bookingTo'),
                        contentPadding: EdgeInsets.zero,
                        title: Text(l.bookingTo),
                        subtitle: Text(_hm(_to)),
                        onTap: () async {
                          final t = await showTimePicker(context: context, initialTime: _to);
                          if (t != null) setState(() => _to = t);
                        },
                      ),
                    ),
                  ],
                ),
                if (_day != null) ...[
                  Text(l.bookingAlreadyHeld, style: context.text.labelLarge),
                  if (_day!.uses.isEmpty) Text(l.bookingFreeAllDay, key: const Key('roomFree'), style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant)),
                  for (final u in _day!.uses) Text('${u.startsAt}–${u.endsAt} · ${u.title}', style: context.text.bodyMedium),
                  if (clash != null)
                    Padding(
                      padding: const EdgeInsets.only(top: Kx.s8),
                      child: Text(l.bookingClash('${clash.startsAt}–${clash.endsAt}', clash.title), key: const Key('bookingClash'), style: context.text.bodyMedium?.copyWith(color: c.error)),
                    ),
                  const SizedBox(height: Kx.s8),
                ],
                TextField(key: const Key('bookingTitle'), controller: _title, maxLength: 160, decoration: InputDecoration(labelText: l.bookingTitleLabel)),
                TextField(key: const Key('bookingPurpose'), controller: _purpose, maxLength: 500, maxLines: 2, decoration: InputDecoration(labelText: l.bookingPurpose)),
                TextField(key: const Key('bookingAttendees'), controller: _attendees, keyboardType: TextInputType.number, decoration: InputDecoration(labelText: l.bookingAttendees)),
                if (_problem != null) Padding(padding: const EdgeInsets.only(top: Kx.s12), child: ErrorBanner(_problem!)),
                const SizedBox(height: Kx.s16),
                FilledButton(key: const Key('sendBooking'), onPressed: _busy || clash != null ? null : _send, child: Text(l.bookingSend)),
              ],
            ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/format.dart';
import '../../core/hr_models.dart';
import '../../core/l10n.dart';
import '../../widgets/common.dart';

String attendanceText(AppLocalizations l, String status) => switch (status) {
  'present' => l.attStatusPresent,
  'absent' => l.attStatusAbsent,
  'half_day' => l.attStatusHalfDay,
  'on_leave' => l.attStatusOnLeave,
  _ => status,
};

/// Check in and out for today, and this month's marks.
class CheckInScreen extends StatefulWidget {
  const CheckInScreen({super.key, required this.api});

  final TeacherApi api;

  @override
  State<CheckInScreen> createState() => _CheckInScreenState();
}

class _CheckInScreenState extends State<CheckInScreen> {
  MyAttendance? _data;
  ApiException? _error;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final d = await widget.api.myAttendance();
      if (mounted) setState(() => _data = d);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  Future<void> _toggle(bool checkOut) async {
    setState(() => _busy = true);
    try {
      await (checkOut ? widget.api.checkOut() : widget.api.checkIn());
      await _load();
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(context.l10n.errorText(e))));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final f = Fmt.of(context);
    final d = _data;
    final today = d?.today;
    final out = today?.checkOutAt;
    return Scaffold(
      body: RefreshIndicator(
        onRefresh: _load,
        child: CustomScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: [
            SliverAppBar.large(title: Text(l.checkInTitle)),
            if (_error != null)
              SliverPadding(padding: const EdgeInsets.all(Kx.s16), sliver: SliverToBoxAdapter(child: ErrorBanner.api(_error!, onRetry: _load))),
            if (d == null && _error == null)
              const SliverFillRemaining(hasScrollBody: false, child: Center(child: CircularProgressIndicator()))
            else if (d != null)
              SliverList.list(
                children: [
                  Padding(
                    padding: const EdgeInsets.all(Kx.s16),
                    child: Column(
                      children: [
                        Text(
                          today?.checkInAt == null
                              ? l.notCheckedIn
                              : out != null
                              ? l.checkedOutAt(f.time(out))
                              : l.checkedInAt(f.time(today!.checkInAt!)),
                          key: const Key('todayStatus'),
                          style: context.text.titleMedium,
                        ),
                        const SizedBox(height: Kx.s16),
                        if (out == null)
                          FilledButton.icon(
                            key: Key(today?.checkInAt == null ? 'checkIn' : 'checkOut'),
                            onPressed: _busy ? null : () => _toggle(today?.checkInAt != null),
                            icon: Icon(today?.checkInAt == null ? Icons.login : Icons.logout),
                            label: Text(today?.checkInAt == null ? l.checkInButton : l.checkOutButton),
                          ),
                      ],
                    ),
                  ),
                  KxSectionHeader(l.attendanceMonth),
                  for (final day in d.days.reversed)
                    ListTile(
                      key: Key('day-${day.date}'),
                      title: Text(f.shortDay(parseDay(day.date))),
                      subtitle: day.checkInAt == null ? null : Text('${f.time(day.checkInAt!)}${day.checkOutAt == null ? '' : ' – ${f.time(day.checkOutAt!)}'}'),
                      trailing: Text(attendanceText(l, day.status)),
                    ),
                ],
              ),
          ],
        ),
      ),
    );
  }
}

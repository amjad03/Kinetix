import 'package:flutter/material.dart';
import 'package:zynetix_ui/zynetix_ui.dart';

import '../../core/api.dart';
import '../../core/boarding.dart';
import '../../core/format.dart';
import '../../core/models.dart';
import '../../l10n/l10n.dart';
import '../../widgets/common.dart';
import '../fees/payment_gateway.dart';

/// The child's hostel bed and recent night roll calls (an absence is highlighted; the server also
/// sends a notification that opens this screen), plus the canteen wallet with online top-up.
class BoardingScreen extends StatefulWidget {
  const BoardingScreen({super.key, required this.api, required this.child});

  final ParentApi api;
  final Child child;

  static Future<void> open(BuildContext context, ParentApi api, Child child) =>
      Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => BoardingScreen(api: api, child: child)));

  @override
  State<BoardingScreen> createState() => _BoardingScreenState();
}

class _BoardingScreenState extends State<BoardingScreen> {
  BoardingView? _boarding;
  WalletView? _wallet;
  List<CanteenDish> _menu = const [];
  ApiException? _error;
  String? _busy;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final (b, w) = await (widget.api.boarding(widget.child.id), widget.api.wallet(widget.child.id)).wait;
      if (!mounted) return;
      setState(() {
        _boarding = b;
        _wallet = w;
        _error = null;
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    }
    try {
      final menu = await widget.api.canteenMenu();
      if (mounted) setState(() => _menu = menu);
    } on ApiException {
      // The menu is a nice-to-have; the wallet still shows without it.
    }
  }

  /// Asks the warden for an out-pass: reason, where to, and how many days away.
  Future<void> _askOutPass() async {
    final l = context.l10n;
    final reason = TextEditingController();
    final destination = TextEditingController();
    var days = 1;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, set) => AlertDialog(
          title: Text(l.outPassAsk),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(key: const Key('outPassReason'), controller: reason, decoration: InputDecoration(labelText: l.outPassReason)),
              const SizedBox(height: Kx.s12),
              TextField(key: const Key('outPassDestination'), controller: destination, decoration: InputDecoration(labelText: l.outPassDestination)),
              const SizedBox(height: Kx.s12),
              DropdownButtonFormField<int>(
                key: const Key('outPassDays'),
                initialValue: days,
                decoration: InputDecoration(labelText: l.outPassDays),
                items: [for (var d = 1; d <= 7; d++) DropdownMenuItem(value: d, child: Text('$d'))],
                onChanged: (v) => set(() => days = v ?? 1),
              ),
            ],
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(l.cancel)),
            FilledButton(key: const Key('outPassSend'), onPressed: () => Navigator.pop(ctx, reason.text.trim().isNotEmpty), child: Text(l.send)),
          ],
        ),
      ),
    );
    if (ok != true || !mounted) return;
    try {
      final back = DateTime.now().add(Duration(days: days));
      await widget.api.requestOutPass(widget.child.id, reason: reason.text.trim(), destination: destination.text.trim(), expectedBackAt: DateTime(back.year, back.month, back.day, 18));
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(l.outPassSent)));
      await _load();
    } on ApiException catch (e) {
      if (mounted) await _problem(l.outPassAsk, e.message);
    }
  }

  String _passStatus(AppLocalizations l, String status) => switch (status) {
    'requested' => l.outPassRequested,
    'approved' => l.outPassApproved,
    'issued' => l.outPassIssued,
    'out' => l.outPassOut,
    'returned' => l.outPassReturned,
    'rejected' => l.outPassRejected,
    _ => l.outPassCancelled,
  };

  Future<void> _problem(String title, String message) => showDialog<void>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text(title),
      content: Text(message),
      actions: [FilledButton(onPressed: () => Navigator.pop(ctx), child: Text(context.l10n.ok))],
    ),
  );

  /// Amount → checkout → the gateway → confirm with the server → new balance.
  Future<void> _topUp(WalletView wallet) async {
    final l = context.l10n;
    final paise = await showDialog<int>(context: context, builder: (_) => const _AmountDialog());
    if (paise == null || !mounted) return;
    var confirming = false;
    try {
      setState(() => _busy = l.startingPayment);
      final checkout = await widget.api.walletCheckout(widget.child.id, paise);
      if (!mounted) return;
      setState(() => _busy = null);
      final result = await PaymentGateway.forProvider(checkout.provider).pay(context, checkout);
      if (!mounted) return;
      switch (result) {
        case PaymentCancelled():
          ScaffoldMessenger.of(context)
            ..hideCurrentSnackBar()
            ..showSnackBar(SnackBar(content: Text(l.paymentCancelled)));
        case PaymentFailed failed:
          await _problem(l.paymentFailedTitle, failed.describe(l));
        case PaymentInWallet(:final walletName):
          final app = walletName ?? l.yourWalletApp;
          await _problem(l.finishInWallet(app), l.walletBody(app));
          await _load();
        case PaymentSucceeded(:final providerPaymentId, :final signature):
          confirming = true;
          setState(() => _busy = l.confirmingPayment);
          await widget.api.confirmWalletTopUp(checkout.paymentId, providerPaymentId: providerPaymentId, signature: signature);
          if (!mounted) return;
          setState(() => _busy = null);
          await _load();
          if (mounted) {
            ScaffoldMessenger.of(context)
              ..hideCurrentSnackBar()
              ..showSnackBar(SnackBar(content: Text(l.walletAdded(Fmt.rupees(paise)))));
          }
      }
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _busy = null);
      final reason = describeError(l, e);
      if (confirming) {
        await _problem(l.couldNotConfirmTitle, l.couldNotConfirmBody(reason.endsWith('.') || reason.endsWith('।') ? reason : '$reason.'));
      } else {
        await _problem(e.status == 503 ? l.onlineNotAvailableTitle : l.paymentFailedTitle, reason);
      }
      await _load();
    }
  }

  String _mealName(AppLocalizations l, String meal) => switch (meal) {
    'breakfast' => l.mealBreakfast,
    'lunch' => l.mealLunch,
    'snacks' => l.mealSnacks,
    'dinner' => l.mealDinner,
    _ => meal,
  };

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final b = _boarding;
    final w = _wallet;
    return Stack(
      children: [
        Scaffold(
          appBar: AppBar(title: Text(l.boardingTitle(widget.child.firstName))),
          body: RefreshIndicator(
            onRefresh: _load,
            child: ListView(
              padding: const EdgeInsets.all(Kx.s16),
              children: [
                if (_error != null) ErrorBanner(_error!, onRetry: _load),
                if (b != null) ...[
                  Text(l.hostel, style: context.text.titleMedium),
                  const SizedBox(height: Kx.s8),
                  KxCard(
                    key: const Key('hostelCard'),
                    child: b.resident
                        ? Text(l.hostelBedLine(b.block ?? '', b.room ?? '', b.bed ?? ''), style: context.text.bodyLarge)
                        : Text(l.notInHostel, style: context.text.bodyLarge),
                  ),
                  if (b.resident) ...[
                    const SizedBox(height: Kx.s16),
                    Text(l.nightRoll, style: context.text.titleMedium),
                    const SizedBox(height: Kx.s8),
                    KxCard(
                      key: const Key('nightRoll'),
                      child: b.nights.isEmpty
                          ? Text(l.noNights, style: context.text.bodyMedium)
                          : Column(
                              children: [
                                for (final n in b.nights)
                                  ListTile(
                                    key: Key('night-${n.night}'),
                                    dense: true,
                                    contentPadding: EdgeInsets.zero,
                                    leading: Icon(
                                      n.absent ? Icons.warning_amber_rounded : Icons.check_circle_outline,
                                      color: n.absent ? context.colors.error : context.colors.primary,
                                    ),
                                    title: Text(context.fmt.messageDay(DateTime.parse(n.night), DateTime.now())),
                                    trailing: Text(
                                      switch (n.status) {
                                        'absent' => l.nightAbsent,
                                        'leave' => l.nightLeave,
                                        _ => l.nightPresent,
                                      },
                                      style: context.text.labelLarge?.copyWith(color: n.absent ? context.colors.error : null),
                                    ),
                                  ),
                              ],
                            ),
                    ),
                  ],
                ],
                if (b != null && b.resident) ...[
                  const SizedBox(height: Kx.s16),
                  Row(
                    children: [
                      Expanded(child: Text(l.outPasses, style: context.text.titleMedium)),
                      TextButton.icon(key: const Key('askOutPass'), onPressed: _askOutPass, icon: const Icon(Icons.add), label: Text(l.outPassAsk)),
                    ],
                  ),
                  const SizedBox(height: Kx.s8),
                  KxCard(
                    key: const Key('outPasses'),
                    child: b.passes.isEmpty
                        ? Text(l.outPassNone, style: context.text.bodyMedium)
                        : Column(
                            children: [
                              for (final p in b.passes)
                                ListTile(
                                  key: Key('pass-${p.id}'),
                                  dense: true,
                                  contentPadding: EdgeInsets.zero,
                                  leading: const Icon(Icons.badge_outlined),
                                  title: Text(p.destination.isEmpty ? p.reason : '${p.reason} · ${p.destination}'),
                                  subtitle: Text(l.outPassBack(context.fmt.messageDay(p.expectedBackAt, DateTime.now()))),
                                  trailing: Text(_passStatus(l, p.status), style: context.text.labelLarge),
                                ),
                            ],
                          ),
                  ),
                ],
                if (w != null) ...[
                  const SizedBox(height: Kx.s24),
                  Text(l.canteenWallet, style: context.text.titleMedium),
                  const SizedBox(height: Kx.s8),
                  KxCard(
                    key: const Key('walletCard'),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(l.walletBalance, style: context.text.labelLarge?.copyWith(color: context.colors.onSurfaceVariant)),
                        Text(Fmt.rupees(w.balancePaise), key: const Key('walletBalance'), style: context.text.displaySmall),
                        const SizedBox(height: Kx.s12),
                        if (PaymentGateway.available(w.onlinePayments))
                          FilledButton.icon(
                            key: const Key('walletTopUp'),
                            onPressed: _busy == null ? () => _topUp(w) : null,
                            icon: const Icon(Icons.add),
                            label: Text(l.addMoney),
                          )
                        else
                          Text(PaymentGateway.unavailableReason(l, w.onlinePayments) ?? '', style: context.text.bodyMedium),
                      ],
                    ),
                  ),
                  if (_menu.isNotEmpty) ...[
                    const SizedBox(height: Kx.s16),
                    Text(l.canteenMenu, style: context.text.titleMedium),
                    const SizedBox(height: Kx.s8),
                    KxCard(
                      key: const Key('canteenMenu'),
                      child: Column(
                        children: [
                          for (final d in _menu)
                            ListTile(
                              dense: true,
                              contentPadding: EdgeInsets.zero,
                              leading: const Icon(Icons.lunch_dining_outlined),
                              title: Text(d.name),
                              subtitle: d.available ? null : Text(l.dishSoldOut),
                              trailing: Text(Fmt.rupees(d.pricePaise)),
                            ),
                        ],
                      ),
                    ),
                  ],
                  const SizedBox(height: Kx.s16),
                  Text(l.recentMeals, style: context.text.titleMedium),
                  const SizedBox(height: Kx.s8),
                  KxCard(
                    key: const Key('mealList'),
                    child: w.meals.isEmpty
                        ? Text(l.noMeals, style: context.text.bodyMedium)
                        : Column(
                            children: [
                              for (final m in w.meals)
                                ListTile(
                                  dense: true,
                                  contentPadding: EdgeInsets.zero,
                                  leading: const Icon(Icons.restaurant_outlined),
                                  title: Text(_mealName(l, m.meal)),
                                  trailing: Text(context.fmt.messageDay(DateTime.parse(m.date), DateTime.now())),
                                ),
                            ],
                          ),
                  ),
                ],
                if (b == null && w == null && _error == null) const Center(child: Padding(padding: EdgeInsets.all(Kx.s32), child: CircularProgressIndicator())),
              ],
            ),
          ),
        ),
        if (_busy != null) ...[
          const ModalBarrier(dismissible: false, color: Colors.black38),
          Center(
            child: Card(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: Kx.s24, vertical: Kx.s20),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const SizedBox.square(dimension: 24, child: CircularProgressIndicator(strokeWidth: 3)),
                    const SizedBox(width: Kx.s16),
                    Text(_busy!, style: context.text.bodyLarge),
                  ],
                ),
              ),
            ),
          ),
        ],
      ],
    );
  }
}

/// "How much to add": a rupee amount of at least ₹1.
class _AmountDialog extends StatefulWidget {
  const _AmountDialog();

  @override
  State<_AmountDialog> createState() => _AmountDialogState();
}

class _AmountDialogState extends State<_AmountDialog> {
  final _amount = TextEditingController();
  String? _error;

  @override
  void dispose() {
    _amount.dispose();
    super.dispose();
  }

  void _submit() {
    final l = context.l10n;
    final text = _amount.text;
    final paise = Fmt.parseRupees(text);
    final err = text.trim().isEmpty ? l.enterAmount : (paise == null ? l.enterAmountRupees : (paise < 100 ? l.smallestPayment : null));
    if (err != null) return setState(() => _error = err);
    Navigator.pop(context, paise);
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return AlertDialog(
      title: Text(l.addMoney),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Wrap(
            spacing: Kx.s8,
            children: [
              for (final r in [100, 500, 1000])
                ActionChip(key: Key('preset-$r'), label: Text(Fmt.rupees(r * 100)), onPressed: () => Navigator.pop(context, r * 100)),
            ],
          ),
          const SizedBox(height: Kx.s12),
          TextField(
            key: const Key('walletAmount'),
            controller: _amount,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: InputDecoration(labelText: l.amount, prefixText: '₹', errorText: _error),
            onSubmitted: (_) => _submit(),
          ),
        ],
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: Text(l.cancel)),
        FilledButton(key: const Key('walletAmountOk'), onPressed: _submit, child: Text(l.addMoney)),
      ],
    );
  }
}

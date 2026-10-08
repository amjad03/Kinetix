import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/campus_services.dart';
import '../../core/format.dart';
import '../../l10n/l10n.dart';
import '../../widgets/common.dart';
import 'wallet_gateway.dart';

/// The student's hostel nights (their own roll call), the canteen wallet with online top-up, and recent meals.
class WalletScreen extends StatefulWidget {
  const WalletScreen({super.key, required this.api, required this.studentId});

  final StudentApi api;
  final String studentId;

  static Future<void> open(BuildContext context, StudentApi api, String studentId) =>
      Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => WalletScreen(api: api, studentId: studentId)));

  @override
  State<WalletScreen> createState() => _WalletScreenState();
}

class _WalletScreenState extends State<WalletScreen> {
  HostelView? _hostel;
  WalletView? _wallet;
  ApiException? _error;
  String? _busy;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final (h, w) = await (widget.api.hostel(widget.studentId), widget.api.wallet(widget.studentId)).wait;
      if (mounted) {
        setState(() {
          _hostel = h;
          _wallet = w;
          _error = null;
        });
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  Future<void> _problem(String title, String message) => showDialog<void>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text(title),
      content: Text(message),
      actions: [FilledButton(onPressed: () => Navigator.pop(ctx), child: Text(context.l10n.ok))],
    ),
  );

  /// Amount → checkout → the gateway → confirm with the server → new balance.
  Future<void> _topUp() async {
    final l = context.l10n;
    final paise = await showDialog<int>(context: context, builder: (_) => const _AmountDialog());
    if (paise == null || !mounted) return;
    var confirming = false;
    try {
      setState(() => _busy = l.walletStarting);
      final checkout = await widget.api.walletCheckout(widget.studentId, paise);
      if (!mounted) return;
      setState(() => _busy = null);
      final result = await PaymentGateway.forProvider(checkout.provider).pay(context, checkout);
      if (!mounted) return;
      switch (result) {
        case PaymentCancelled():
          ScaffoldMessenger.of(context)
            ..hideCurrentSnackBar()
            ..showSnackBar(SnackBar(content: Text(l.walletCancelled)));
        case PaymentFailed failed:
          await _problem(l.walletFailedTitle, failed.describe(l));
        case PaymentInWallet(:final walletName):
          await _problem(l.walletFinishIn(walletName ?? '—'), l.walletInWalletBody);
          await _load();
        case PaymentSucceeded(:final providerPaymentId, :final signature):
          confirming = true;
          setState(() => _busy = l.walletConfirming);
          await widget.api.confirmWalletTopUp(checkout.topupId, providerPaymentId: providerPaymentId, signature: signature);
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
      await _problem(confirming ? l.walletCouldNotConfirm : l.walletFailedTitle, context.errorText(e));
      await _load();
    }
  }

  String _meal(AppLocalizations l, String meal) => switch (meal) {
    'breakfast' => l.walletBreakfast,
    'lunch' => l.walletLunch,
    'snacks' => l.walletSnacks,
    'dinner' => l.walletDinner,
    _ => meal,
  };

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final h = _hostel;
    final w = _wallet;
    return Stack(
      children: [
        Scaffold(
          appBar: AppBar(title: Text(l.walletTitle)),
          body: RefreshIndicator(
            onRefresh: _load,
            child: ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.all(Kx.s16),
              children: [
                if (_error != null) ErrorBanner(_error!, onRetry: _load),
                if (h == null && w == null && _error == null) const KxLoading(),
                if (h != null) ...[
                  Text(l.walletHostel, style: context.text.titleMedium),
                  const SizedBox(height: Kx.s8),
                  KxCard(key: const Key('hostelCard'), child: Text(h.resident ? l.walletBedLine(h.block ?? '', h.room ?? '', h.bed ?? '') : l.walletNotInHostel, style: context.text.bodyLarge)),
                  if (h.resident) ...[
                    const SizedBox(height: Kx.s16),
                    Text(l.walletNights, style: context.text.titleMedium),
                    const SizedBox(height: Kx.s8),
                    KxCard(
                      key: const Key('nightRoll'),
                      child: h.nights.isEmpty
                          ? Text(l.walletNoNights, style: context.text.bodyMedium)
                          : Column(
                              children: [
                                for (final n in h.nights)
                                  ListTile(
                                    dense: true,
                                    contentPadding: EdgeInsets.zero,
                                    leading: Icon(n.status == 'absent' ? Icons.warning_amber_rounded : Icons.check_circle_outline, color: n.status == 'absent' ? context.colors.error : context.colors.primary),
                                    title: Text(context.fmt.shortDay(DateTime.parse(n.night))),
                                    trailing: Text(switch (n.status) {
                                      'absent' => l.walletAbsent,
                                      'leave' => l.walletLeave,
                                      _ => l.walletPresent,
                                    }),
                                  ),
                              ],
                            ),
                    ),
                  ],
                ],
                if (w != null) ...[
                  const SizedBox(height: Kx.s24),
                  Text(l.walletCanteen, style: context.text.titleMedium),
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
                          FilledButton.icon(key: const Key('walletTopUp'), onPressed: _busy == null ? _topUp : null, icon: const Icon(Icons.add), label: Text(l.walletAddMoney))
                        else
                          Text(PaymentGateway.unavailableReason(l, w.onlinePayments) ?? '', style: context.text.bodyMedium),
                      ],
                    ),
                  ),
                  const SizedBox(height: Kx.s16),
                  Text(l.walletMeals, style: context.text.titleMedium),
                  const SizedBox(height: Kx.s8),
                  KxCard(
                    key: const Key('mealList'),
                    child: w.meals.isEmpty
                        ? Text(l.walletNoMeals, style: context.text.bodyMedium)
                        : Column(
                            children: [
                              for (final m in w.meals)
                                ListTile(dense: true, contentPadding: EdgeInsets.zero, leading: const Icon(Icons.restaurant_outlined), title: Text(_meal(l, m.meal)), trailing: Text(context.fmt.shortDay(DateTime.parse(m.date)))),
                            ],
                          ),
                  ),
                ],
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

/// "How much to add": a preset or a rupee amount of at least ₹1.
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
    final paise = Fmt.parseRupees(_amount.text);
    final err = _amount.text.trim().isEmpty ? l.walletEnterAmount : (paise == null ? l.walletEnterRupees : (paise < 100 ? l.walletMinAmount : null));
    if (err != null) return setState(() => _error = err);
    Navigator.pop(context, paise);
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return AlertDialog(
      title: Text(l.walletAddMoney),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Wrap(spacing: Kx.s8, children: [for (final r in [100, 500, 1000]) ActionChip(key: Key('preset-$r'), label: Text(Fmt.rupees(r * 100)), onPressed: () => Navigator.pop(context, r * 100))]),
          const SizedBox(height: Kx.s12),
          TextField(
            key: const Key('walletAmount'),
            controller: _amount,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: InputDecoration(labelText: l.walletAmount, prefixText: '₹', errorText: _error),
            onSubmitted: (_) => _submit(),
          ),
        ],
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: Text(l.cancel)),
        FilledButton(key: const Key('walletAmountOk'), onPressed: _submit, child: Text(l.walletAddMoney)),
      ],
    );
  }
}

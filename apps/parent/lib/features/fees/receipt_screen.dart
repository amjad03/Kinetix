import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/format.dart';
import '../../core/models.dart';
import '../../l10n/l10n.dart';
import '../../widgets/common.dart';
import 'payment_gateway.dart';

/// A numbered fee receipt: after paying, from the payment history, or from a "Payment received"
/// update. The receipt itself is a light, paper-like card in both themes so it prints and reads
/// like the office's own.
class ReceiptScreen extends StatefulWidget {
  const ReceiptScreen({super.key, required this.api, required this.paymentId, this.receipt, this.justPaid = false});

  final ParentApi api;
  final String paymentId;

  /// Already loaded (straight after paying); otherwise fetched.
  final FeeReceipt? receipt;

  /// Opened right after a successful payment: says so at the top.
  final bool justPaid;

  static Future<void> open(BuildContext context, ParentApi api, {required String paymentId, FeeReceipt? receipt, bool justPaid = false}) =>
      Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => ReceiptScreen(api: api, paymentId: paymentId, receipt: receipt, justPaid: justPaid),
        ),
      );

  /// The receipt as plain text, for copying into a message or an email.
  static String plainText(Fmt f, FeeReceipt r) {
    final l = f.l;
    return [
      r.institution,
      '${l.feeReceipt} ${r.receiptNo}',
      '${l.dateLabel}: ${f.dateTime(r.paidAt)}',
      '${l.studentLabel}: ${r.studentName}${r.rollNo.isEmpty ? '' : ' (${l.rollNo(r.rollNo)})'}',
      if (r.className.isNotEmpty) '${l.classLabel}: ${r.className}',
      '${l.feeLabel}: ${r.feeTitle} (${Fmt.rupees(r.feeAmountPaise)})',
      '${l.amountPaid}: ${Fmt.rupees(r.amountPaise)}',
      '${l.paidBy}: ${l.paymentMethod(r.method)}',
      if (r.reference != null && r.reference!.isNotEmpty) '${l.reference}: ${r.reference}',
      '${l.balanceLeft}: ${Fmt.rupees(r.balancePaise)}',
      if (isDemo(r)) l.demoNoMoneyMoved,
    ].join('\n');
  }

  static bool isDemo(FeeReceipt r) => r.reference?.startsWith('pay_demo_') ?? false;

  @override
  State<ReceiptScreen> createState() => _ReceiptScreenState();
}

class _ReceiptScreenState extends State<ReceiptScreen> {
  late FeeReceipt? _receipt = widget.receipt;
  ApiException? _error;

  @override
  void initState() {
    super.initState();
    if (_receipt == null) _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final r = await widget.api.receipt(widget.paymentId);
      if (mounted) setState(() => _receipt = r);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  Future<void> _copy(FeeReceipt r) async {
    final copied = context.l10n.receiptCopied;
    await Clipboard.setData(ClipboardData(text: ReceiptScreen.plainText(context.fmt, r)));
    if (!mounted) return;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(copied)));
  }

  @override
  Widget build(BuildContext context) {
    final r = _receipt;
    final c = context.colors;
    final l = context.l10n;
    return Scaffold(
      appBar: AppBar(
        title: Text(l.receipt),
        actions: [
          if (r != null)
            IconButton(
              key: const Key('copyReceipt'),
              tooltip: l.copyReceipt,
              onPressed: () => _copy(r),
              icon: const Icon(Icons.copy_all_outlined),
            ),
        ],
      ),
      body: r == null
          ? (_error != null
                ? Padding(
                    padding: const EdgeInsets.all(Kx.s16),
                    child: ErrorBanner(_error!.status == 404 ? l.receiptNotFound : _error!, onRetry: _load),
                  )
                : const Center(child: CircularProgressIndicator()))
          : ListView(
              padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s8, Kx.s16, Kx.s32),
              children: [
                if (widget.justPaid) ...[
                  Row(
                    children: [
                      CircleAvatar(
                        radius: 24,
                        backgroundColor: Tone.goodContainer(context),
                        child: Icon(Icons.check_rounded, color: Tone.good(context), size: 30),
                      ),
                      const SizedBox(width: Kx.s16),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(l.paymentSuccessful, key: const Key('paymentSuccessful'), style: context.text.titleLarge),
                            Text(
                              l.paidFor(Fmt.rupees(r.amountPaise), r.studentName.split(' ').first),
                              style: context.text.bodyLarge?.copyWith(color: c.onSurfaceVariant),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: Kx.s16),
                ],
                if (ReceiptScreen.isDemo(r)) ...[const DemoBanner(), const SizedBox(height: Kx.s16)],
                Theme(data: KinetixTheme.light(), child: _Paper(r)),
                const SizedBox(height: Kx.s16),
                OutlinedButton.icon(
                  onPressed: () => _copy(r),
                  icon: const Icon(Icons.copy_all_outlined),
                  label: Text(l.copyReceipt),
                  style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(Kx.target)),
                ),
                if (widget.justPaid) ...[
                  const SizedBox(height: Kx.s8),
                  FilledButton(
                    key: const Key('receiptDone'),
                    onPressed: () => Navigator.pop(context),
                    style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(Kx.target)),
                    child: Text(l.done),
                  ),
                ],
              ],
            ),
    );
  }
}

class _Paper extends StatelessWidget {
  const _Paper(this.r);

  final FeeReceipt r;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final l = context.l10n;
    Widget row(String label, String value, {Key? key, bool strong = false}) => Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 112,
            child: Text(label, style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant)),
          ),
          Expanded(
            child: SelectableText(
              value,
              key: key,
              style: (strong ? context.text.titleMedium : context.text.bodyLarge)?.copyWith(color: c.onSurface),
            ),
          ),
        ],
      ),
    );

    return Container(
      key: const Key('receipt'),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: Kx.radiusLg,
        border: Border.all(color: c.outlineVariant),
      ),
      padding: const EdgeInsets.all(Kx.s20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(r.institution, style: context.text.titleLarge?.copyWith(color: c.onSurface)),
          const SizedBox(height: 2),
          Text(l.feeReceipt, style: context.text.titleSmall?.copyWith(color: c.primary)),
          const SizedBox(height: Kx.s12),
          row(l.receiptNoLabel, r.receiptNo, key: const Key('receiptNo')),
          row(l.dateLabel, context.fmt.dateTime(r.paidAt)),
          const Divider(height: Kx.s24),
          row(l.studentLabel, r.rollNo.isEmpty ? r.studentName : '${r.studentName}\n${l.rollNo(r.rollNo)}'),
          if (r.className.isNotEmpty) row(l.classLabel, r.className),
          row(l.feeLabel, '${r.feeTitle}\n${Fmt.rupees(r.feeAmountPaise)}'),
          row(l.paidBy, l.paymentMethod(r.method)),
          if (r.reference != null && r.reference!.isNotEmpty) row(l.reference, r.reference!),
          const Divider(height: Kx.s24),
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Expanded(
                child: Text(l.amountPaid, style: context.text.titleMedium?.copyWith(color: c.onSurface)),
              ),
              Text(
                Fmt.rupees(r.amountPaise),
                key: const Key('receiptAmount'),
                style: context.text.headlineMedium?.copyWith(color: c.onSurface, fontWeight: FontWeight.w500),
              ),
            ],
          ),
          const SizedBox(height: Kx.s8),
          Row(
            children: [
              Expanded(
                child: Text(l.balanceLeft, style: context.text.bodyLarge?.copyWith(color: c.onSurfaceVariant)),
              ),
              Text(
                r.balancePaise == 0 ? l.nilFullyPaid : Fmt.rupees(r.balancePaise),
                key: const Key('receiptBalance'),
                style: context.text.bodyLarge?.copyWith(color: r.balancePaise == 0 ? const Color(0xFF137333) : c.onSurface),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/format.dart';
import '../../core/models.dart';
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
  static String plainText(FeeReceipt r) => [
    r.institution,
    'Fee receipt ${r.receiptNo}',
    'Date: ${Fmt.dateTime(r.paidAt)}',
    'Student: ${r.studentName}${r.rollNo.isEmpty ? '' : ' (Roll no. ${r.rollNo})'}',
    if (r.className.isNotEmpty) 'Class: ${r.className}',
    'Fee: ${r.feeTitle} (${Fmt.rupees(r.feeAmountPaise)})',
    'Amount paid: ${Fmt.rupees(r.amountPaise)}',
    'Paid by: ${r.method.label}',
    if (r.reference != null && r.reference!.isNotEmpty) 'Reference: ${r.reference}',
    'Balance left: ${Fmt.rupees(r.balancePaise)}',
    if (isDemo(r)) 'Demo payment: no money moved.',
  ].join('\n');

  static bool isDemo(FeeReceipt r) => r.reference?.startsWith('pay_demo_') ?? false;

  @override
  State<ReceiptScreen> createState() => _ReceiptScreenState();
}

class _ReceiptScreenState extends State<ReceiptScreen> {
  late FeeReceipt? _receipt = widget.receipt;
  String? _error;

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
      if (mounted) setState(() => _error = e.status == 404 ? 'This receipt was not found.' : e.message);
    }
  }

  Future<void> _copy(FeeReceipt r) async {
    await Clipboard.setData(ClipboardData(text: ReceiptScreen.plainText(r)));
    if (!mounted) return;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(const SnackBar(content: Text('Receipt copied. Paste it into a message or email.')));
  }

  @override
  Widget build(BuildContext context) {
    final r = _receipt;
    final c = context.colors;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Receipt'),
        actions: [
          if (r != null)
            IconButton(
              key: const Key('copyReceipt'),
              tooltip: 'Copy receipt',
              onPressed: () => _copy(r),
              icon: const Icon(Icons.copy_all_outlined),
            ),
        ],
      ),
      body: r == null
          ? (_error != null
                ? Padding(
                    padding: const EdgeInsets.all(Kx.s16),
                    child: ErrorBanner(_error!, onRetry: _load),
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
                            Text('Payment successful', key: const Key('paymentSuccessful'), style: context.text.titleLarge),
                            Text(
                              '${Fmt.rupees(r.amountPaise)} paid for ${r.studentName.split(' ').first}',
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
                  label: const Text('Copy receipt'),
                  style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(Kx.target)),
                ),
                if (widget.justPaid) ...[
                  const SizedBox(height: Kx.s8),
                  FilledButton(
                    key: const Key('receiptDone'),
                    onPressed: () => Navigator.pop(context),
                    style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(Kx.target)),
                    child: const Text('Done'),
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
          Text('Fee receipt', style: context.text.titleSmall?.copyWith(color: c.primary)),
          const SizedBox(height: Kx.s12),
          row('Receipt no.', r.receiptNo, key: const Key('receiptNo')),
          row('Date', Fmt.dateTime(r.paidAt)),
          const Divider(height: Kx.s24),
          row('Student', r.rollNo.isEmpty ? r.studentName : '${r.studentName}\nRoll no. ${r.rollNo}'),
          if (r.className.isNotEmpty) row('Class', r.className),
          row('Fee', '${r.feeTitle}\n${Fmt.rupees(r.feeAmountPaise)}'),
          row('Paid by', r.method.label),
          if (r.reference != null && r.reference!.isNotEmpty) row('Reference', r.reference!),
          const Divider(height: Kx.s24),
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Expanded(
                child: Text('Amount paid', style: context.text.titleMedium?.copyWith(color: c.onSurface)),
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
                child: Text('Balance left', style: context.text.bodyLarge?.copyWith(color: c.onSurfaceVariant)),
              ),
              Text(
                r.balancePaise == 0 ? 'Nil · fully paid' : Fmt.rupees(r.balancePaise),
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

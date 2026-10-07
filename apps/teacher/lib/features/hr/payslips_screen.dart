import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/files.dart';
import '../../core/hr_models.dart';
import '../../core/l10n.dart';
import '../../widgets/common.dart';

/// "₹1,73,625" (whole rupees) or "₹1,250.50" from paise, Indian grouping.
String rupeesText(int paise) {
  final neg = paise < 0;
  final p = paise.abs();
  var whole = (p ~/ 100).toString();
  if (whole.length > 3) {
    final head = whole.substring(0, whole.length - 3);
    final groups = RegExp(r'\d{1,2}(?=(\d{2})*$)').allMatches(head).map((m) => m.group(0)).join(',');
    whole = '$groups,${whole.substring(whole.length - 3)}';
  }
  final frac = p % 100;
  return '${neg ? '-' : ''}₹$whole${frac == 0 ? '' : '.${frac.toString().padLeft(2, '0')}'}';
}

/// "October 2026" from "2026-10".
String payslipMonth(String ym) {
  const en = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return '${en[int.parse(ym.substring(5, 7)) - 1]} ${ym.substring(0, 4)}';
}

/// The caller's payslips from locked payroll runs.
class PayslipsScreen extends StatefulWidget {
  const PayslipsScreen({super.key, required this.api, this.openFile = openWithSystem});

  final TeacherApi api;
  final OpenFile openFile;

  @override
  State<PayslipsScreen> createState() => _PayslipsScreenState();
}

class _PayslipsScreenState extends State<PayslipsScreen> {
  List<PayslipInfo>? _slips;
  ApiException? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final s = await widget.api.myPayslips();
      if (mounted) setState(() => _slips = s);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final slips = _slips;
    return Scaffold(
      body: RefreshIndicator(
        onRefresh: _load,
        child: CustomScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: [
            SliverAppBar.large(title: Text(l.payslipsTitle)),
            if (_error != null)
              SliverPadding(padding: const EdgeInsets.all(Kx.s16), sliver: SliverToBoxAdapter(child: ErrorBanner.api(_error!, onRetry: _load))),
            if (slips == null && _error == null)
              const SliverFillRemaining(hasScrollBody: false, child: Center(child: CircularProgressIndicator()))
            else if (slips != null && slips.isEmpty)
              SliverFillRemaining(hasScrollBody: false, child: KxEmptyState(key: const Key('payslipsEmpty'), icon: Icons.receipt_long_outlined, message: l.payslipsEmpty))
            else if (slips != null)
              SliverList.list(
                children: [
                  for (final s in slips)
                    ListTile(
                      key: Key('payslip-${s.month}'),
                      leading: const Icon(Icons.receipt_long_outlined),
                      title: Text(payslipMonth(s.month)),
                      subtitle: Text('${l.payslipNet}: ${rupeesText(s.netPaise)}'),
                      trailing: const Icon(Icons.chevron_right),
                      onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => PayslipDetailScreen(api: widget.api, payslip: s, openFile: widget.openFile))),
                    ),
                ],
              ),
          ],
        ),
      ),
    );
  }
}

class PayslipDetailScreen extends StatefulWidget {
  const PayslipDetailScreen({super.key, required this.api, required this.payslip, this.openFile = openWithSystem});

  final TeacherApi api;
  final PayslipInfo payslip;
  final OpenFile openFile;

  @override
  State<PayslipDetailScreen> createState() => _PayslipDetailScreenState();
}

class _PayslipDetailScreenState extends State<PayslipDetailScreen> {
  bool _busy = false;

  Future<void> _pdf() async {
    final l = context.l10n;
    final messenger = ScaffoldMessenger.of(context);
    setState(() => _busy = true);
    try {
      final bytes = await widget.api.payslipPdf(widget.payslip.id);
      if (!await widget.openFile(bytes, 'payslip-${widget.payslip.month}.pdf', 'application/pdf')) {
        messenger.showSnackBar(SnackBar(content: Text(l.couldNotOpenFile)));
      }
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(l.errorText(e))));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final s = widget.payslip;
    Widget line(String a, int paise, {bool bold = false, Key? key}) => ListTile(
      key: key,
      dense: true,
      title: Text(a, style: bold ? context.text.titleSmall : null),
      trailing: Text(rupeesText(paise), style: bold ? context.text.titleSmall : null),
    );
    return Scaffold(
      appBar: AppBar(title: Text(payslipMonth(s.month))),
      body: ListView(
        children: [
          line(l.payslipNet, s.netPaise, bold: true, key: const Key('net')),
          ListTile(dense: true, title: Text(l.payslipDays(daysText(s.paidDays), daysText(s.lopDays)))),
          KxSectionHeader(l.payslipEarnings),
          for (final e in s.earnings) line(e.name, e.amountPaise),
          line(l.payslipGross, s.grossPaise, bold: true),
          KxSectionHeader(l.payslipDeductions),
          for (final d in s.deductions) line(d.name, d.amountPaise),
          line(l.payslipDeductions, s.deductionsPaise, bold: true),
          Padding(
            padding: const EdgeInsets.all(Kx.s16),
            child: OutlinedButton.icon(key: const Key('openPdf'), onPressed: _busy ? null : _pdf, icon: const Icon(Icons.picture_as_pdf_outlined), label: Text(l.payslipOpenPdf)),
          ),
        ],
      ),
    );
  }
}

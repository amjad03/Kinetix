import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/hr_models.dart';
import '../../core/l10n.dart';
import '../../widgets/common.dart';
import 'payslips_screen.dart';

String loanStatusText(AppLocalizations l, String s) => switch (s) {
  'approved' => l.loanStatusApproved,
  'rejected' => l.loanStatusRejected,
  'cancelled' => l.loanStatusCancelled,
  'closed' => l.loanStatusClosed,
  _ => l.loanStatusPending,
};

/// The caller's salary advances and loans, and a form to ask for one. The principal approves; instalments come off the payslip.
class LoansScreen extends StatefulWidget {
  const LoansScreen({super.key, required this.api, this.now});

  final TeacherApi api;
  final DateTime? now;

  @override
  State<LoansScreen> createState() => _LoansScreenState();
}

class _LoansScreenState extends State<LoansScreen> {
  List<LoanInfo>? _loans;
  ApiException? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final s = await widget.api.myLoans();
      if (mounted) setState(() => _loans = s);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  Future<void> _request() async {
    final sent = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _LoanForm(api: widget.api, now: widget.now ?? DateTime.now()),
    );
    if (sent == true && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(context.l10n.loanSent)));
      await _load();
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final loans = _loans;
    return Scaffold(
      floatingActionButton: FloatingActionButton.extended(key: const Key('requestLoan'), onPressed: _request, icon: const Icon(Icons.add), label: Text(l.loanRequest)),
      body: RefreshIndicator(
        onRefresh: _load,
        child: CustomScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: [
            SliverAppBar.large(title: Text(l.loansTitle)),
            if (_error != null) SliverPadding(padding: const EdgeInsets.all(Kx.s16), sliver: SliverToBoxAdapter(child: ErrorBanner.api(_error!, onRetry: _load))),
            if (loans == null && _error == null)
              const SliverFillRemaining(hasScrollBody: false, child: Center(child: CircularProgressIndicator()))
            else if (loans != null && loans.isEmpty)
              SliverFillRemaining(hasScrollBody: false, child: KxEmptyState(key: const Key('loansEmpty'), icon: Icons.account_balance_wallet_outlined, message: l.loansEmpty))
            else if (loans != null)
              SliverList.list(
                children: [
                  for (final x in loans)
                    ListTile(
                      key: Key('loan-${x.id}'),
                      leading: const Icon(Icons.account_balance_wallet_outlined),
                      title: Text('${x.kind == 'advance' ? l.loanKindAdvance : l.loanKindLoan} · ${rupeesText(x.amountPaise)}'),
                      subtitle: Text('${x.loanNo} · ${l.loanEmi(rupeesText(x.emiPaise), x.installments)}\n${loanStatusText(l, x.status)}${x.status == 'approved' ? ' · ${l.loanOutstanding(rupeesText(x.outstandingPaise))}' : ''}'),
                      isThreeLine: true,
                    ),
                  const SizedBox(height: 88),
                ],
              ),
          ],
        ),
      ),
    );
  }
}

class _LoanForm extends StatefulWidget {
  const _LoanForm({required this.api, required this.now});

  final TeacherApi api;
  final DateTime now;

  @override
  State<_LoanForm> createState() => _LoanFormState();
}

class _LoanFormState extends State<_LoanForm> {
  String _kind = 'advance';
  final _amount = TextEditingController();
  final _installments = TextEditingController(text: '3');
  final _purpose = TextEditingController();
  late String _month;
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    final next = DateTime(widget.now.year, widget.now.month + 1);
    _month = '${next.year}-${next.month.toString().padLeft(2, '0')}';
  }

  @override
  void dispose() {
    _amount.dispose();
    _installments.dispose();
    _purpose.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final l = context.l10n;
    final rupees = double.tryParse(_amount.text.replaceAll(',', '').trim());
    final n = int.tryParse(_installments.text.trim());
    if (rupees == null || rupees <= 0 || n == null || n < 1 || _purpose.text.trim().length < 3) {
      setState(() => _error = l.loanInvalid);
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await widget.api.requestLoan(kind: _kind, amountPaise: (rupees * 100).round(), installments: n, startMonth: _month, purpose: _purpose.text.trim());
      if (mounted) Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = l.errorText(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final months = [for (var i = 1; i <= 3; i++) DateTime(widget.now.year, widget.now.month + i)].map((d) => '${d.year}-${d.month.toString().padLeft(2, '0')}').toList();
    return Padding(
      padding: EdgeInsets.fromLTRB(Kx.s16, 0, Kx.s16, Kx.s16 + MediaQuery.viewInsetsOf(context).bottom),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(l.loanRequest, style: context.text.titleLarge),
          const SizedBox(height: Kx.s16),
          SegmentedButton<String>(
            segments: [ButtonSegment(value: 'advance', label: Text(l.loanKindAdvance)), ButtonSegment(value: 'loan', label: Text(l.loanKindLoan))],
            selected: {_kind},
            onSelectionChanged: (s) => setState(() => _kind = s.first),
          ),
          const SizedBox(height: Kx.s12),
          TextField(key: const Key('loanAmount'), controller: _amount, keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: InputDecoration(labelText: l.loanAmount)),
          const SizedBox(height: Kx.s12),
          TextField(key: const Key('loanInstallments'), controller: _installments, keyboardType: TextInputType.number, decoration: InputDecoration(labelText: l.loanInstallments)),
          const SizedBox(height: Kx.s12),
          DropdownButtonFormField<String>(
            initialValue: _month,
            decoration: InputDecoration(labelText: l.loanStartMonth),
            items: [for (final m in months) DropdownMenuItem(value: m, child: Text(payslipMonth(m)))],
            onChanged: (v) => setState(() => _month = v ?? _month),
          ),
          const SizedBox(height: Kx.s12),
          TextField(key: const Key('loanPurpose'), controller: _purpose, decoration: InputDecoration(labelText: l.loanPurpose)),
          if (_error != null) Padding(padding: const EdgeInsets.only(top: Kx.s12), child: Text(_error!, style: TextStyle(color: context.colors.error))),
          const SizedBox(height: Kx.s16),
          FilledButton(key: const Key('submitLoan'), onPressed: _busy ? null : _submit, child: Text(l.loanRequest)),
        ],
      ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:zynetix_ui/zynetix_ui.dart';

import '../../core/api.dart';
import '../../core/hr_models.dart';
import '../../core/l10n.dart';
import '../../core/models.dart';
import '../../widgets/common.dart';
import 'leave_screen.dart' show pickLeaveDocument;
import 'payslips_screen.dart';

/// Picks a bill or proof (PDF or photo); tests pass their own.
typedef PickTaxFile = Future<ChatUpload?> Function(BuildContext context);

const taxSections = ['80C', '80CCD1B', '80D', '80D_PARENTS', '80D_SENIOR_PARENTS', '80E', '80G', '80TTA', '24B'];
const claimCategories = ['travel', 'conference', 'books', 'telephone', 'medical', 'fuel', 'other'];

String taxSectionText(AppLocalizations l, String s) => switch (s) {
  '80C' => l.taxSec80c,
  '80CCD1B' => l.taxSec80ccd1b,
  '80D' => l.taxSec80d,
  '80D_PARENTS' => l.taxSec80dParents,
  '80D_SENIOR_PARENTS' => l.taxSec80dSenior,
  '80E' => l.taxSec80e,
  '80G' => l.taxSec80g,
  '80TTA' => l.taxSec80tta,
  _ => l.taxSec24b,
};

String claimCategoryText(AppLocalizations l, String c) => switch (c) {
  'travel' => l.claimCatTravel,
  'conference' => l.claimCatConference,
  'books' => l.claimCatBooks,
  'telephone' => l.claimCatTelephone,
  'medical' => l.claimCatMedical,
  'fuel' => l.claimCatFuel,
  _ => l.claimCatOther,
};

String claimStatusText(AppLocalizations l, String s) => switch (s) {
  'approved' => l.claimStatusApproved,
  'paid' => l.claimStatusPaid,
  'rejected' => l.claimStatusRejected,
  'cancelled' => l.claimStatusCancelled,
  _ => l.claimStatusSubmitted,
};

String taxStatusText(AppLocalizations l, String s) => switch (s) {
  'submitted' => l.taxStatusSubmitted,
  'approved' => l.taxStatusApproved,
  'proofs_submitted' => l.taxStatusProofs,
  'verified' => l.taxStatusVerified,
  'rejected' => l.taxStatusRejected,
  _ => l.taxStatusDraft,
};

int? _paise(String v) {
  final n = double.tryParse(v.replaceAll(',', '').trim());
  return n == null || n < 0 ? null : (n * 100).round();
}

/// Profile → Work → Tax and claims: my investment declaration (regime, rent, investments, proofs) and my
/// reimbursement claims with their bills. HR approves both; payroll deducts TDS and pays the claims.
class TaxClaimsScreen extends StatefulWidget {
  const TaxClaimsScreen({super.key, required this.api, this.pickFile = pickLeaveDocument, this.now});

  final TeacherApi api;
  final PickTaxFile pickFile;
  final DateTime? now;

  @override
  State<TaxClaimsScreen> createState() => _TaxClaimsScreenState();
}

class _TaxClaimsScreenState extends State<TaxClaimsScreen> {
  int? _fy;
  TaxDeclarationInfo? _decl;
  List<ClaimInfo>? _claims;
  ApiException? _error;
  bool _busy = false;
  String _regime = 'new';
  final _rent = TextEditingController(text: '0');
  final _months = TextEditingController(text: '0');
  final _pan = TextEditingController();
  final List<({String section, TextEditingController label, TextEditingController amount})> _items = [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    for (final c in [
      _rent,
      _months,
      _pan,
      for (final i in _items) ...[i.label, i.amount],
    ]) {
      c.dispose();
    }
    super.dispose();
  }

  void _fill(TaxDeclarationInfo? d) {
    _decl = d;
    _regime = d?.regime ?? 'new';
    _rent.text = d == null ? '0' : (d.rentMonthlyPaise ~/ 100).toString();
    _months.text = (d?.rentMonths ?? 0).toString();
    _pan.text = d?.landlordPan ?? '';
    _items
      ..clear()
      ..addAll([
        for (final i in d?.items ?? const <TaxItemInfo>[]) (section: i.section, label: TextEditingController(text: i.label), amount: TextEditingController(text: (i.declaredPaise ~/ 100).toString())),
      ]);
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final (fy, d) = await widget.api.myTaxDeclaration();
      final claims = await widget.api.myClaims();
      if (!mounted) return;
      setState(() {
        _fy = fy;
        _fill(d);
        _claims = claims;
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  Future<void> _run(Future<void> Function() fn, String done) async {
    setState(() => _busy = true);
    try {
      await fn();
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(done)));
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _save() async {
    final l = context.l10n;
    final items = <TaxItemInfo>[];
    for (final i in _items) {
      final p = _paise(i.amount.text);
      if (p == null || p == 0) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(l.taxAmountError)));
        return;
      }
      items.add(TaxItemInfo(section: i.section, label: i.label.text.trim(), declaredPaise: p));
    }
    await _run(() async {
      final d = await widget.api.saveTaxDeclaration(
        fy: _fy!,
        regime: _regime,
        rentMonthlyPaise: _paise(_rent.text) ?? 0,
        rentMonths: int.tryParse(_months.text) ?? 0,
        landlordPan: _pan.text.trim().isEmpty ? null : _pan.text.trim().toUpperCase(),
        items: items,
        expectedVersion: _decl?.version,
      );
      setState(() => _fill(d));
    }, l.taxSaved);
  }

  Future<void> _submit({bool proofs = false}) async {
    final l = context.l10n;
    await _run(() async {
      final d = await widget.api.submitTaxDeclaration(_fy!, proofs: proofs);
      setState(() => _fill(d));
    }, proofs ? l.taxProofsSent : l.taxSent);
  }

  Future<void> _proof(TaxItemInfo item) async {
    final file = await widget.pickFile(context);
    if (file == null || !mounted) return;
    await _run(() => widget.api.attachTaxProof(item.id!, file), context.l10n.taxProofAttached);
    await _load();
  }

  Future<void> _claim() async {
    final sent = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _ClaimForm(api: widget.api, pickFile: widget.pickFile, now: widget.now ?? DateTime.now()),
    );
    if (sent == true && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(context.l10n.claimSent)));
      await _load();
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final d = _decl;
    final editable = d == null || d.editable;
    final loading = _fy == null && _error == null;
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: AppBar(
          title: Text(l.taxClaimsTitle),
          bottom: TabBar(
            tabs: [
              Tab(key: const Key('tabDeclaration'), text: l.taxDeclarationTab),
              Tab(key: const Key('tabClaims'), text: l.claimsTab),
            ],
          ),
        ),
        body: _error != null
            ? Padding(
                padding: const EdgeInsets.all(Kx.s16),
                child: ErrorBanner.api(_error!, onRetry: _load),
              )
            : loading
            ? const Center(child: CircularProgressIndicator())
            : TabBarView(
                children: [
                  SingleChildScrollView(
                    padding: const EdgeInsets.all(Kx.s16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Row(
                          children: [
                            Expanded(child: Text(l.taxDeclarationFor(d?.fyLabel ?? '$_fy-${(_fy! + 1) % 100}'), style: Theme.of(context).textTheme.titleMedium)),
                            if (d != null) Chip(key: const Key('taxStatus'), label: Text(taxStatusText(l, d.status))),
                          ],
                        ),
                        if (d != null && d.decisionNote.isNotEmpty)
                          Padding(
                            padding: const EdgeInsets.only(top: Kx.s8),
                            child: Text(d.decisionNote),
                          ),
                        if (d != null)
                          Padding(
                            padding: const EdgeInsets.symmetric(vertical: Kx.s12),
                            child: Text(l.taxEstimate(rupeesText(d.oldTaxPaise), rupeesText(d.newTaxPaise)), key: const Key('taxEstimate')),
                          ),
                        SegmentedButton<String>(
                          key: const Key('regime'),
                          segments: [
                            ButtonSegment(value: 'new', label: Text(l.taxRegimeNew)),
                            ButtonSegment(value: 'old', label: Text(l.taxRegimeOld)),
                          ],
                          selected: {_regime},
                          onSelectionChanged: editable ? (v) => setState(() => _regime = v.first) : null,
                        ),
                        const SizedBox(height: Kx.s12),
                        Row(
                          children: [
                            Expanded(
                              child: TextField(
                                key: const Key('rent'),
                                enabled: editable,
                                controller: _rent,
                                keyboardType: TextInputType.number,
                                decoration: InputDecoration(labelText: l.taxRent),
                              ),
                            ),
                            const SizedBox(width: Kx.s12),
                            SizedBox(
                              width: 96,
                              child: TextField(
                                enabled: editable,
                                controller: _months,
                                keyboardType: TextInputType.number,
                                decoration: InputDecoration(labelText: l.taxRentMonths),
                              ),
                            ),
                          ],
                        ),
                        TextField(
                          enabled: editable,
                          controller: _pan,
                          textCapitalization: TextCapitalization.characters,
                          decoration: InputDecoration(labelText: l.taxLandlordPan, helperText: l.taxLandlordPanHelp),
                        ),
                        const SizedBox(height: Kx.s12),
                        for (final (k, it) in _items.indexed)
                          Card(
                            key: Key('taxItem-$k'),
                            child: Padding(
                              padding: const EdgeInsets.all(Kx.s12),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.stretch,
                                children: [
                                  DropdownButtonFormField<String>(
                                    initialValue: it.section,
                                    isExpanded: true,
                                    decoration: InputDecoration(labelText: l.taxSection),
                                    items: [
                                      for (final s in taxSections)
                                        DropdownMenuItem(
                                          value: s,
                                          child: Text(taxSectionText(l, s), overflow: TextOverflow.ellipsis),
                                        ),
                                    ],
                                    onChanged: editable ? (v) => setState(() => _items[k] = (section: v!, label: it.label, amount: it.amount)) : null,
                                  ),
                                  TextField(
                                    enabled: editable,
                                    controller: it.label,
                                    decoration: InputDecoration(labelText: l.taxWhat),
                                  ),
                                  TextField(
                                    key: Key('taxAmount-$k'),
                                    enabled: editable,
                                    controller: it.amount,
                                    keyboardType: TextInputType.number,
                                    decoration: InputDecoration(labelText: l.taxAmount),
                                  ),
                                  if (d != null && k < d.items.length && d.items[k].id != null && !editable)
                                    Row(
                                      children: [
                                        Expanded(child: Text(taxProofText(l, d.items[k].proofStatus))),
                                        if (d.status == 'approved')
                                          TextButton.icon(key: Key('proof-$k'), onPressed: _busy ? null : () => _proof(d.items[k]), icon: const Icon(Icons.attach_file), label: Text(l.taxAttachProof)),
                                      ],
                                    ),
                                  if (editable)
                                    Align(
                                      alignment: Alignment.centerRight,
                                      child: TextButton(onPressed: () => setState(() => _items.removeAt(k)), child: Text(l.taxRemove)),
                                    ),
                                ],
                              ),
                            ),
                          ),
                        if (editable)
                          TextButton.icon(
                            key: const Key('addTaxItem'),
                            onPressed: () => setState(() => _items.add((section: '80C', label: TextEditingController(), amount: TextEditingController()))),
                            icon: const Icon(Icons.add),
                            label: Text(l.taxAddItem),
                          ),
                        const SizedBox(height: Kx.s12),
                        Wrap(
                          spacing: Kx.s8,
                          runSpacing: Kx.s8,
                          alignment: WrapAlignment.end,
                          children: [
                            if (editable) OutlinedButton(key: const Key('saveTax'), onPressed: _busy ? null : _save, child: Text(l.taxSaveDraft)),
                            if (editable && d != null) FilledButton(key: const Key('submitTax'), onPressed: _busy ? null : _submit, child: Text(l.taxSubmit)),
                            if (d?.status == 'approved') FilledButton(key: const Key('submitProofs'), onPressed: _busy ? null : () => _submit(proofs: true), child: Text(l.taxSubmitProofs)),
                          ],
                        ),
                      ],
                    ),
                  ),
                  Scaffold(
                    floatingActionButton: FloatingActionButton.extended(key: const Key('newClaim'), onPressed: _claim, icon: const Icon(Icons.add), label: Text(l.claimNew)),
                    body: (_claims ?? const []).isEmpty
                        ? KxEmptyState(key: const Key('claimsEmpty'), icon: Icons.receipt_outlined, message: l.claimsEmpty)
                        : ListView(
                            children: [
                              for (final c in _claims!)
                                ListTile(
                                  key: Key('claim-${c.id}'),
                                  leading: const Icon(Icons.receipt_outlined),
                                  title: Text('${claimCategoryText(l, c.category)} · ${rupeesText(c.approvedPaise ?? c.amountPaise)}'),
                                  subtitle: Text(
                                    '${c.claimNo} · ${c.spentOn}\n${claimStatusText(l, c.status)}${c.payMonth != null ? ' · ${c.payMonth}' : ''}${c.decisionNote.isNotEmpty ? ' · ${c.decisionNote}' : ''}',
                                  ),
                                  isThreeLine: true,
                                ),
                              const SizedBox(height: 88),
                            ],
                          ),
                  ),
                ],
              ),
      ),
    );
  }
}

String taxProofText(AppLocalizations l, String s) => switch (s) {
  'submitted' => l.taxProofSubmitted,
  'accepted' => l.taxProofAccepted,
  'rejected' => l.taxProofRejected,
  _ => l.taxProofNone,
};

class _ClaimForm extends StatefulWidget {
  const _ClaimForm({required this.api, required this.pickFile, required this.now});

  final TeacherApi api;
  final PickTaxFile pickFile;
  final DateTime now;

  @override
  State<_ClaimForm> createState() => _ClaimFormState();
}

class _ClaimFormState extends State<_ClaimForm> {
  String _category = 'travel';
  late DateTime _on = widget.now;
  final _amount = TextEditingController();
  final _what = TextEditingController();
  ChatUpload? _bill;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _amount.dispose();
    _what.dispose();
    super.dispose();
  }

  String get _day => '${_on.year}-${_on.month.toString().padLeft(2, '0')}-${_on.day.toString().padLeft(2, '0')}';

  Future<void> _send() async {
    final l = context.l10n;
    final p = _paise(_amount.text);
    if (p == null || p < 100 || _what.text.trim().length < 3) return setState(() => _error = l.claimFormError);
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final c = await widget.api.submitClaim(category: _category, spentOn: _day, amountPaise: p, description: _what.text.trim());
      if (_bill != null) await widget.api.attachClaimBill(c.id, _bill!);
      if (mounted) Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return Padding(
      padding: EdgeInsets.fromLTRB(Kx.s16, 0, Kx.s16, MediaQuery.viewInsetsOf(context).bottom + Kx.s16),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(l.claimNew, style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: Kx.s12),
          DropdownButtonFormField<String>(
            key: const Key('claimCategory'),
            initialValue: _category,
            isExpanded: true,
            decoration: InputDecoration(labelText: l.claimCategory, helperText: l.claimTaxFreeHelp, helperMaxLines: 3),
            items: [for (final c in claimCategories) DropdownMenuItem(value: c, child: Text(claimCategoryText(l, c)))],
            onChanged: (v) => setState(() => _category = v!),
          ),
          ListTile(
            contentPadding: EdgeInsets.zero,
            title: Text(l.claimBillDate),
            trailing: Text(_day),
            onTap: () async {
              final d = await showDatePicker(context: context, initialDate: _on, firstDate: DateTime(widget.now.year - 1, 4), lastDate: widget.now);
              if (d != null) setState(() => _on = d);
            },
          ),
          TextField(
            key: const Key('claimAmount'),
            controller: _amount,
            keyboardType: TextInputType.number,
            decoration: InputDecoration(labelText: l.taxAmount),
          ),
          TextField(
            key: const Key('claimWhat'),
            controller: _what,
            decoration: InputDecoration(labelText: l.claimWhat),
          ),
          const SizedBox(height: Kx.s8),
          OutlinedButton.icon(
            key: const Key('claimBill'),
            onPressed: () async {
              final f = await widget.pickFile(context);
              if (f != null) setState(() => _bill = f);
            },
            icon: const Icon(Icons.attach_file),
            label: Text(_bill?.name ?? l.claimAttachBill),
          ),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.only(top: Kx.s8),
              child: Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
            ),
          const SizedBox(height: Kx.s12),
          FilledButton(key: const Key('sendClaim'), onPressed: _busy ? null : _send, child: Text(l.claimSend)),
        ],
      ),
    );
  }
}

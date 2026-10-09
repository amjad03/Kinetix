import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/files.dart';
import '../../core/growth.dart';
import '../../core/models.dart';
import '../../l10n/l10n.dart';
import '../../widgets/common.dart';

/// A guardian's data rights under the DPDP Act, for themselves and for each child: download what the school
/// holds, ask for a correction or erasure, follow requests and find the grievance officer.
class DpdpScreen extends StatefulWidget {
  const DpdpScreen({super.key, required this.api, this.children = const [], this.openFile = openWithSystem});

  final ParentApi api;

  /// The guardian's children; a request can be about one of them.
  final List<Child> children;
  final OpenFile openFile;

  static Future<void> open(BuildContext context, ParentApi api, List<Child> children) =>
      Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => DpdpScreen(api: api, children: children)));

  @override
  State<DpdpScreen> createState() => _DpdpScreenState();
}

class _DpdpScreenState extends State<DpdpScreen> {
  DpdpOfficer? _officer;
  List<DpdpRequest>? _requests;
  DataExport? _export;
  ApiException? _error;
  String _field = 'fullName';

  /// The child a request is about; null for the guardian's own details.
  Child? _about;
  final _value = TextEditingController();
  final _why = TextEditingController();
  bool _busy = false;
  String? _notice;
  List<String> _retention = const [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _value.dispose();
    _why.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final o = await widget.api.dpdpOfficer();
      final r = await widget.api.dpdpRequests();
      if (mounted) {
        setState(() {
          _officer = o;
          _requests = r;
        });
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  Future<void> _run(Future<void> Function() job) async {
    setState(() {
      _busy = true;
      _notice = null;
      _retention = const [];
    });
    try {
      await job();
    } on ApiException catch (e) {
      if (mounted) setState(() => _notice = context.errorText(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _showExport() => _run(() async {
    final e = await widget.api.dpdpExport();
    if (mounted) setState(() => _export = e);
  });

  Future<void> _openPdf() => _run(() async {
    final l = context.l10n;
    final bytes = await widget.api.dpdpExportPdf();
    final ok = await widget.openFile(bytes, 'my-data.pdf', 'application/pdf');
    if (!ok && mounted) setState(() => _notice = l.fileOpenFailed);
  });

  Future<void> _correct() async {
    final l = context.l10n;
    final v = _value.text.trim();
    if (v.isEmpty) {
      setState(() => _notice = l.dpdpNeedValue);
      return;
    }
    await _run(() async {
      final about = _about;
      if (about == null) {
        await widget.api.dpdpRequest(kind: 'correction', field: _field, value: v);
      } else {
        await widget.api.dpdpRequest(kind: 'correction', details: '${l.dpdpAboutChild}: ${about.fullName} (${about.rollNo}). ${_fieldName(l)}: $v');
      }
      _value.clear();
      await _load();
      if (mounted) setState(() => _notice = l.dpdpRequestSent);
    });
  }

  Future<void> _erase() async {
    final l = context.l10n;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        content: Text(l.dpdpEraseConfirm),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(l.cancel)),
          FilledButton(key: const Key('confirmErase'), onPressed: () => Navigator.pop(ctx, true), child: Text(l.dpdpEraseSend)),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    await _run(() async {
      final about = _about;
      final why = _why.text.trim();
      final r = await widget.api.dpdpRequest(kind: 'erasure', details: about == null ? why : '${l.dpdpAboutChild}: ${about.fullName} (${about.rollNo}). $why'.trim());
      _why.clear();
      await _load();
      if (mounted) {
        setState(() {
          _notice = l.dpdpRequestSent;
          _retention = r.retentionReasons;
        });
      }
    });
  }

  String _fieldName(AppLocalizations l) => switch (_field) {
    'email' => l.dpdpFieldEmail,
    'phone' => l.dpdpFieldPhone,
    _ => l.dpdpFieldName,
  };

  String _kind(AppLocalizations l, String k) => k == 'erasure' ? l.dpdpKindErasure : l.dpdpKindCorrection;

  String _status(AppLocalizations l, String s) => switch (s) {
    'completed' => l.dpdpStatusDone,
    'rejected' => l.dpdpStatusDeclined,
    'blocked' => l.dpdpStatusBlocked,
    _ => l.dpdpStatusPending,
  };

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final o = _officer;
    return Scaffold(
      appBar: AppBar(title: Text(l.dpdpTitle)),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(Kx.s16),
          children: [
            if (_error != null) ErrorBanner(_error!, onRetry: _load),
            if (o == null && _error == null) const KxLoading(),
            if (o != null)
              Card(
                key: const Key('dpdpOfficer'),
                child: ListTile(
                  leading: const Icon(Icons.support_agent_outlined),
                  title: Text(l.dpdpOfficerTitle),
                  subtitle: Text(o.named ? [o.name!, ?o.email, ?o.phone, o.response].join('\n') : l.dpdpOfficerNone),
                ),
              ),
            const SizedBox(height: Kx.s16),
            Text(l.dpdpExportTitle, style: context.text.titleMedium),
            Text(l.dpdpExportBody),
            const SizedBox(height: Kx.s8),
            Wrap(
              spacing: Kx.s8,
              children: [
                OutlinedButton(key: const Key('dpdpShowExport'), onPressed: _busy ? null : _showExport, child: Text(l.dpdpExportAction)),
                OutlinedButton(key: const Key('dpdpExportPdf'), onPressed: _busy ? null : _openPdf, child: Text(l.dpdpExportPdf)),
              ],
            ),
            if (_export != null)
              Padding(
                padding: const EdgeInsets.only(top: Kx.s8),
                child: Column(
                  key: const Key('dpdpExportSummary'),
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [for (final e in _export!.sections.entries) Text('${e.key}: ${e.value} ${l.dpdpRecords}')],
                ),
              ),
            const SizedBox(height: Kx.s24),
            if (widget.children.isNotEmpty) ...[
              DropdownButtonFormField<Child?>(
                key: const Key('dpdpAbout'),
                initialValue: _about,
                decoration: InputDecoration(labelText: l.dpdpAbout),
                items: [
                  DropdownMenuItem<Child?>(value: null, child: Text(l.dpdpAboutMe)),
                  for (final c in widget.children) DropdownMenuItem<Child?>(value: c, child: Text(c.fullName)),
                ],
                onChanged: (v) => setState(() => _about = v),
              ),
              const SizedBox(height: Kx.s16),
            ],
            Text(l.dpdpCorrectTitle, style: context.text.titleMedium),
            const SizedBox(height: Kx.s8),
            DropdownButtonFormField<String>(
              key: const Key('dpdpField'),
              initialValue: _field,
              decoration: InputDecoration(labelText: l.dpdpField),
              items: [
                DropdownMenuItem(value: 'fullName', child: Text(l.dpdpFieldName)),
                DropdownMenuItem(value: 'email', child: Text(l.dpdpFieldEmail)),
                DropdownMenuItem(value: 'phone', child: Text(l.dpdpFieldPhone)),
              ],
              onChanged: (v) => setState(() => _field = v ?? 'fullName'),
            ),
            const SizedBox(height: Kx.s8),
            TextField(key: const Key('dpdpValue'), controller: _value, decoration: InputDecoration(labelText: l.dpdpNewValue)),
            const SizedBox(height: Kx.s8),
            FilledButton(key: const Key('dpdpCorrect'), onPressed: _busy ? null : _correct, child: Text(l.dpdpCorrectSend)),
            const SizedBox(height: Kx.s24),
            Text(l.dpdpEraseTitle, style: context.text.titleMedium),
            Text(l.dpdpEraseBody),
            const SizedBox(height: Kx.s8),
            TextField(key: const Key('dpdpWhy'), controller: _why, maxLength: 1000, decoration: InputDecoration(labelText: l.dpdpEraseDetails)),
            OutlinedButton(key: const Key('dpdpErase'), onPressed: _busy ? null : _erase, child: Text(l.dpdpEraseSend)),
            if (_notice != null) Padding(padding: const EdgeInsets.only(top: Kx.s12), child: Text(_notice!, key: const Key('dpdpNotice'))),
            if (_retention.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: Kx.s8),
                child: Column(
                  key: const Key('dpdpRetention'),
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [Text(l.dpdpRetentionNotice), for (final r in _retention) Text('• $r')],
                ),
              ),
            const SizedBox(height: Kx.s24),
            Text(l.dpdpRequestsTitle, style: context.text.titleMedium),
            if (_requests != null && _requests!.isEmpty) Padding(padding: const EdgeInsets.only(top: Kx.s8), child: Text(l.dpdpRequestsNone)),
            for (final r in _requests ?? const <DpdpRequest>[])
              ListTile(
                key: Key('dpdpRequest-${r.id}'),
                contentPadding: EdgeInsets.zero,
                title: Text('${_kind(l, r.kind)} · ${_status(l, r.status)}'),
                subtitle: Text([if (r.details.isNotEmpty) r.details, ?r.resolutionNote].join('\n')),
              ),
          ],
        ),
      ),
    );
  }
}

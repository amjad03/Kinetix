import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/campus_services.dart';
import '../../core/files.dart';
import '../../l10n/l10n.dart';
import '../../widgets/common.dart';

/// Certificates: the ones the student asked for and where each stands (an issued one downloads
/// as a PDF with its verification QR), and a form to ask for another.
class CertificatesScreen extends StatefulWidget {
  const CertificatesScreen({super.key, required this.api, required this.studentId, this.openFile = openWithSystem});

  final StudentApi api;
  final String studentId;
  final OpenFile openFile;

  static Future<void> open(BuildContext context, StudentApi api, String studentId) =>
      Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => CertificatesScreen(api: api, studentId: studentId)));

  @override
  State<CertificatesScreen> createState() => _CertificatesScreenState();
}

class _CertificatesScreenState extends State<CertificatesScreen> {
  List<CertificateRequest>? _items;
  ApiException? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final r = await widget.api.myCertificates();
      if (mounted) setState(() => _items = r);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  Future<void> _request() async {
    final messenger = ScaffoldMessenger.of(context);
    final l = context.l10n;
    final List<CertificateTemplate> templates;
    try {
      templates = await widget.api.certificateTemplates();
    } on ApiException catch (e) {
      if (mounted) messenger.showSnackBar(SnackBar(content: Text(context.errorText(e))));
      return;
    }
    if (!mounted) return;
    if (templates.isEmpty) {
      messenger.showSnackBar(SnackBar(content: Text(l.certificateNoTemplates)));
      return;
    }
    final sent = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _RequestSheet(api: widget.api, studentId: widget.studentId, templates: templates),
    );
    if (sent == true) {
      messenger.showSnackBar(SnackBar(content: Text(l.certificateSent)));
      await _load();
    }
  }

  Future<void> _download(CertificateRequest r) async {
    final l = context.l10n;
    final messenger = ScaffoldMessenger.of(context);
    try {
      final bytes = await widget.api.certificatePdf(r.id);
      final ok = await widget.openFile(bytes, '${r.serialNo ?? r.id}.pdf', 'application/pdf');
      if (!ok) messenger.showSnackBar(SnackBar(content: Text(l.fileOpenFailed)));
    } on ApiException catch (e) {
      if (mounted) messenger.showSnackBar(SnackBar(content: Text(context.errorText(e))));
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final items = _items;
    return Scaffold(
      appBar: AppBar(title: Text(l.certificatesTitle)),
      floatingActionButton: FloatingActionButton.extended(key: const Key('requestCertificate'), onPressed: _request, icon: const Icon(Icons.add), label: Text(l.certificateRequestAction)),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s8, Kx.s16, 96),
          children: [
            if (_error != null) ErrorBanner(_error!, onRetry: _load),
            if (items == null && _error == null) const KxLoading(),
            if (items != null && items.isEmpty) KxEmptyState(icon: Icons.workspace_premium_outlined, message: l.certificateNone),
            if (items != null)
              for (final r in items) ...[_CertificateCard(request: r, onDownload: () => _download(r)), const SizedBox(height: Kx.s12)],
          ],
        ),
      ),
    );
  }
}

String certificateStatusText(AppLocalizations l, String status) => switch (status) {
  'requested' => l.certificateRequested,
  'approved' => l.certificateApproved,
  'rejected' => l.certificateRejected,
  'issued' => l.certificateIssued,
  _ => l.certificateRevoked,
};

class _CertificateCard extends StatelessWidget {
  const _CertificateCard({required this.request, required this.onDownload});

  final CertificateRequest request;
  final VoidCallback onDownload;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final tone = switch (request.status) {
      'issued' => KxTone.success,
      'rejected' || 'revoked' => KxTone.danger,
      'approved' => KxTone.primary,
      _ => KxTone.warning,
    };
    final t = kxTone(context, tone);
    return KxCard(
      key: Key('cert-${request.id}'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(child: Text(request.name, style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w600), maxLines: 2, overflow: TextOverflow.ellipsis)),
              const SizedBox(width: Kx.s8),
              Flexible(child: Pill(certificateStatusText(l, request.status), background: t.bg, foreground: t.fg)),
            ],
          ),
          if (request.serialNo != null) Text(l.certificateSerial(request.serialNo!), style: context.text.bodySmall?.copyWith(color: context.colors.onSurfaceVariant)),
          if (request.purpose.isNotEmpty) Text(request.purpose, style: context.text.bodyMedium?.copyWith(color: context.colors.onSurfaceVariant)),
          if (request.decisionNote != null && request.decisionNote!.isNotEmpty) Text(request.decisionNote!, style: context.text.bodyMedium),
          if (request.canDownload)
            Padding(
              padding: const EdgeInsets.only(top: Kx.s8),
              child: FilledButton.tonalIcon(
                key: Key('download-${request.id}'),
                onPressed: onDownload,
                style: FilledButton.styleFrom(minimumSize: const Size(Kx.target, Kx.target)),
                icon: const Icon(Icons.download_outlined),
                label: Text(l.certificateDownload),
              ),
            ),
        ],
      ),
    );
  }
}

class _RequestSheet extends StatefulWidget {
  const _RequestSheet({required this.api, required this.studentId, required this.templates});

  final StudentApi api;
  final String studentId;
  final List<CertificateTemplate> templates;

  @override
  State<_RequestSheet> createState() => _RequestSheetState();
}

class _RequestSheetState extends State<_RequestSheet> {
  late CertificateTemplate _template = widget.templates.first;
  final _purpose = TextEditingController();
  final _fields = <String, TextEditingController>{};
  bool _missing = false;
  String? _problem;
  bool _busy = false;

  TextEditingController _field(String key) => _fields.putIfAbsent(key, TextEditingController.new);

  @override
  void dispose() {
    _purpose.dispose();
    for (final c in _fields.values) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _send() async {
    if (_template.fields.any((f) => f.required && _field(f.key).text.trim().isEmpty)) return setState(() => _missing = true);
    setState(() {
      _busy = true;
      _missing = false;
      _problem = null;
    });
    try {
      await widget.api.requestCertificate(
        widget.studentId,
        templateId: _template.id,
        purpose: _purpose.text.trim(),
        fields: {for (final f in _template.fields) if (_field(f.key).text.trim().isNotEmpty) f.key: _field(f.key).text.trim()},
      );
      if (mounted) Navigator.pop(context, true);
    } on ApiException catch (e) {
      if (mounted) {
        setState(() {
          _busy = false;
          _problem = context.errorText(e);
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return Padding(
      padding: EdgeInsets.fromLTRB(Kx.s16, 0, Kx.s16, MediaQuery.viewInsetsOf(context).bottom + Kx.s16),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(l.certificateRequestAction, style: context.text.titleLarge),
            const SizedBox(height: Kx.s16),
            DropdownButtonFormField<CertificateTemplate>(
              key: const Key('certTemplate'),
              initialValue: _template,
              isExpanded: true,
              decoration: InputDecoration(labelText: l.certificateChoose),
              items: [for (final t in widget.templates) DropdownMenuItem(value: t, child: Text(t.name, overflow: TextOverflow.ellipsis))],
              onChanged: (t) => setState(() => _template = t ?? _template),
            ),
            const SizedBox(height: Kx.s12),
            for (final f in _template.fields) ...[
              TextField(
                key: Key('certField-${f.key}'),
                controller: _field(f.key),
                decoration: InputDecoration(labelText: f.label, errorText: _missing && f.required && _field(f.key).text.trim().isEmpty ? l.certificateRequiredField : null),
              ),
              const SizedBox(height: Kx.s12),
            ],
            TextField(key: const Key('certPurpose'), controller: _purpose, maxLength: 300, decoration: InputDecoration(labelText: l.certificatePurpose)),
            if (_problem != null) Padding(padding: const EdgeInsets.only(top: Kx.s8), child: ErrorBanner(_problem!)),
            const SizedBox(height: Kx.s8),
            SizedBox(
              width: double.infinity,
              child: FilledButton(key: const Key('sendCertificate'), onPressed: _busy ? null : _send, style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(Kx.target)), child: Text(l.send)),
            ),
          ],
        ),
      ),
    );
  }
}

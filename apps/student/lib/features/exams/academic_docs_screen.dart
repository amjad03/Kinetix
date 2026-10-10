import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/academic_docs.dart';
import '../../core/api.dart';
import '../../core/files.dart';
import '../../l10n/l10n.dart';
import '../../widgets/common.dart';

/// The title of the screen and of the link to it, in the app language.
String academicDocsTitle(BuildContext context) => context.l10n.acadDocTitle;

/// Asks the exam office for a transcript, provisional certificate or consolidated grade card and downloads it once issued.
class AcademicDocsScreen extends StatefulWidget {
  const AcademicDocsScreen({super.key, required this.api, required this.studentId, this.openFile = openWithSystem});

  final StudentApi api;
  final String studentId;
  final OpenFile openFile;

  static Future<void> open(BuildContext context, StudentApi api, String studentId) =>
      Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => AcademicDocsScreen(api: api, studentId: studentId)));

  @override
  State<AcademicDocsScreen> createState() => _AcademicDocsScreenState();
}

class _AcademicDocsScreenState extends State<AcademicDocsScreen> {
  List<AcademicDocRequest>? _rows;
  String? _error;
  String _kind = academicDocKinds.first;
  final _purpose = TextEditingController();

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _purpose.dispose();
    super.dispose();
  }

  String _w(String key) {
    final l = context.l10n;
    return switch (key) {
      'title' => l.acadDocTitle,
      'transcript' => l.acadDocTranscript,
      'provisional_certificate' => l.acadDocProvisional,
      'grade_card' => l.acadDocGradeCard,
      'request' => l.acadDocRequest,
      'purpose' => l.acadDocPurpose,
      'sent' => l.acadDocSent,
      'download' => l.acadDocDownload,
      'none' => l.acadDocNone,
      'requested' => l.acadDocRequested,
      'approved' => l.acadDocApproved,
      'rejected' => l.acadDocRejected,
      'issued' => l.acadDocIssued,
      'cannotOpen' => l.acadDocCannotOpen,
      _ => key,
    };
  }

  Future<void> _load() async {
    try {
      final rows = await widget.api.academicDocRequests(widget.studentId);
      if (mounted) setState(() { _rows = rows; _error = null; });
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = context.errorText(e));
    }
  }

  Future<void> _request() async {
    final messenger = ScaffoldMessenger.of(context);
    try {
      await widget.api.requestAcademicDoc(widget.studentId, _kind, _purpose.text.trim());
      _purpose.clear();
      messenger.showSnackBar(SnackBar(content: Text(_w('sent'))));
      await _load();
    } on ApiException catch (e) {
      if (mounted) messenger.showSnackBar(SnackBar(content: Text(context.errorText(e))));
    }
  }

  Future<void> _download(AcademicDocRequest r) async {
    final messenger = ScaffoldMessenger.of(context);
    try {
      final bytes = await widget.api.academicDocPdf(r.id);
      final ok = await widget.openFile(bytes, '${r.kind}-${r.serialNo ?? r.id}.pdf', 'application/pdf');
      if (!ok && mounted) messenger.showSnackBar(SnackBar(content: Text(_w('cannotOpen'))));
    } on ApiException catch (e) {
      if (mounted) messenger.showSnackBar(SnackBar(content: Text(context.errorText(e))));
    }
  }

  @override
  Widget build(BuildContext context) {
    final rows = _rows;
    return Scaffold(
      appBar: AppBar(title: Text(_w('title'))),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(Kx.s16),
          children: [
            if (_error != null) ErrorBanner(_error!, onRetry: _load),
            KxCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  DropdownButtonFormField<String>(
                    key: const Key('docKind'),
                    initialValue: _kind,
                    items: [for (final k in academicDocKinds) DropdownMenuItem(value: k, child: Text(_w(k)))],
                    onChanged: (v) => setState(() => _kind = v ?? _kind),
                  ),
                  const SizedBox(height: Kx.s12),
                  TextField(key: const Key('docPurpose'), controller: _purpose, decoration: InputDecoration(labelText: _w('purpose'))),
                  const SizedBox(height: Kx.s12),
                  FilledButton(key: const Key('docRequest'), onPressed: _request, child: Text(_w('request'))),
                ],
              ),
            ),
            const SizedBox(height: Kx.s16),
            if (rows == null && _error == null) const KxLoading(),
            if (rows != null && rows.isEmpty) Text(_w('none'), key: const Key('noDocs')),
            for (final r in rows ?? const <AcademicDocRequest>[]) ...[
              KxCard(
                child: ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text(_w(r.kind)),
                  subtitle: Text([_w(r.status), if (r.serialNo != null) r.serialNo!].join(' · ')),
                  trailing: r.canDownload ? TextButton(key: Key('docDownload-${r.id}'), onPressed: () => _download(r), child: Text(_w('download'))) : null,
                ),
              ),
              const SizedBox(height: Kx.s12),
            ],
          ],
        ),
      ),
    );
  }
}

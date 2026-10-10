import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/evidence_models.dart';
import '../../core/l10n.dart';
import '../../widgets/common.dart';

/// A photo of a certificate or paper from the gallery, with its file name; null if cancelled.
typedef PickEvidenceImage = Future<({Uint8List bytes, String name})?> Function();

Future<({Uint8List bytes, String name})?> pickEvidenceImage() async {
  final x = await ImagePicker().pickImage(source: ImageSource.gallery, maxWidth: 2000, maxHeight: 2000);
  if (x == null) return null;
  return (bytes: await x.readAsBytes(), name: x.name);
}

String evidenceKindLabel(AppLocalizations l, String kind) => switch (kind) {
  'publication' => l.evidenceKindPublication,
  'fdp' => l.evidenceKindFdp,
  'award' => l.evidenceKindAward,
  'patent' => l.evidenceKindPatent,
  'book' => l.evidenceKindBook,
  _ => l.evidenceKindOther,
};

/// The teacher's own publications, development programmes, awards and patents that the ERP does not hold, for accreditation reports.
class MyEvidenceScreen extends StatefulWidget {
  const MyEvidenceScreen({super.key, required this.api, this.pickImage = pickEvidenceImage});

  final TeacherApi api;
  final PickEvidenceImage pickImage;

  @override
  State<MyEvidenceScreen> createState() => _MyEvidenceScreenState();
}

class _MyEvidenceScreenState extends State<MyEvidenceScreen> {
  List<EvidenceInfo>? _items;
  ApiException? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final r = await widget.api.myEvidence();
      if (mounted) setState(() => _items = r);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  Future<void> _add() async {
    final done = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _AddEvidenceSheet(api: widget.api, pickImage: widget.pickImage),
    );
    if (done == true) await _load();
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final items = _items;
    return Scaffold(
      floatingActionButton: FloatingActionButton.extended(key: const Key('addEvidence'), onPressed: _add, icon: const Icon(Icons.add), label: Text(l.evidenceAdd)),
      body: RefreshIndicator(
        onRefresh: _load,
        child: CustomScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: [
            SliverAppBar.large(title: Text(l.evidenceTitle)),
            if (_error != null) SliverPadding(padding: const EdgeInsets.all(Kx.s16), sliver: SliverToBoxAdapter(child: ErrorBanner.api(_error!, onRetry: _load))),
            if (items == null && _error == null)
              const SliverFillRemaining(hasScrollBody: false, child: Center(child: CircularProgressIndicator()))
            else if (items != null && items.isEmpty)
              SliverFillRemaining(hasScrollBody: false, child: KxEmptyState(key: const Key('evidenceEmpty'), icon: Icons.workspace_premium_outlined, message: l.evidenceEmpty))
            else if (items != null)
              SliverList.list(
                children: [
                  for (final e in items)
                    ListTile(
                      key: Key('evidence-${e.id}'),
                      leading: Icon(e.verified ? Icons.verified_outlined : Icons.hourglass_empty),
                      title: Text(e.title),
                      subtitle: Text([evidenceKindLabel(l, e.kind), if (e.year != null) '${e.year}', if (e.venue.isNotEmpty) e.venue].join(' · ')),
                      trailing: Text(e.verified ? l.evidenceVerified : l.evidencePending),
                    ),
                ],
              ),
          ],
        ),
      ),
    );
  }
}

class _AddEvidenceSheet extends StatefulWidget {
  const _AddEvidenceSheet({required this.api, required this.pickImage});

  final TeacherApi api;
  final PickEvidenceImage pickImage;

  @override
  State<_AddEvidenceSheet> createState() => _AddEvidenceSheetState();
}

class _AddEvidenceSheetState extends State<_AddEvidenceSheet> {
  final _title = TextEditingController();
  final _year = TextEditingController();
  final _venue = TextEditingController();
  String _kind = 'publication';
  ({Uint8List bytes, String name})? _photo;
  bool _busy = false;
  String? _problem;

  @override
  void dispose() {
    _title.dispose();
    _year.dispose();
    _venue.dispose();
    super.dispose();
  }

  Future<void> _attach() async {
    final p = await widget.pickImage();
    if (p == null || !mounted) return;
    if (imageContentType(p.bytes) == null) return setState(() => _problem = context.l10n.evidenceBadImage);
    setState(() {
      _photo = p;
      _problem = null;
    });
  }

  Future<void> _save() async {
    final l = context.l10n;
    final title = _title.text.trim();
    if (title.length < 2) return setState(() => _problem = l.evidenceTitleNeeded);
    final year = _year.text.trim().isEmpty ? null : int.tryParse(_year.text.trim());
    if (_year.text.trim().isNotEmpty && year == null) return setState(() => _problem = l.evidenceYearBad);
    setState(() {
      _busy = true;
      _problem = null;
    });
    try {
      await widget.api.addMyEvidence(
        kind: _kind,
        title: title,
        year: year,
        venue: _venue.text.trim(),
        fileName: _photo?.name,
        fileBytes: _photo?.bytes,
        contentType: _photo == null ? null : imageContentType(_photo!.bytes),
      );
      if (mounted) Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      if (mounted) setState(() => _problem = l.errorText(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return Padding(
      padding: EdgeInsets.fromLTRB(Kx.s16, Kx.s16, Kx.s16, MediaQuery.of(context).viewInsets.bottom + Kx.s16),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(l.evidenceAdd, style: context.text.titleMedium),
            const SizedBox(height: Kx.s12),
            DropdownButtonFormField<String>(
              key: const Key('evidenceKind'),
              initialValue: _kind,
              isExpanded: true,
              decoration: InputDecoration(labelText: l.evidenceKindLabel),
              items: [for (final k in evidenceKinds) DropdownMenuItem(value: k, child: Text(evidenceKindLabel(l, k)))],
              onChanged: (v) => setState(() => _kind = v ?? _kind),
            ),
            TextField(key: const Key('evidenceTitleField'), controller: _title, decoration: InputDecoration(labelText: l.evidenceTitleField)),
            TextField(key: const Key('evidenceYear'), controller: _year, keyboardType: TextInputType.number, decoration: InputDecoration(labelText: l.evidenceYear)),
            TextField(key: const Key('evidenceVenue'), controller: _venue, decoration: InputDecoration(labelText: l.evidenceVenue)),
            const SizedBox(height: Kx.s12),
            OutlinedButton(key: const Key('evidenceAttach'), onPressed: _busy ? null : _attach, child: Text(_photo == null ? l.evidenceAttach : l.evidenceAttached(_photo!.name), textAlign: TextAlign.center)),
            if (_problem != null) Padding(padding: const EdgeInsets.only(top: Kx.s8), child: Text(_problem!, key: const Key('evidenceProblem'), style: TextStyle(color: Theme.of(context).colorScheme.error))),
            const SizedBox(height: Kx.s12),
            FilledButton(key: const Key('evidenceSave'), onPressed: _busy ? null : _save, child: Text(l.evidenceSave)),
          ],
        ),
      ),
    );
  }
}

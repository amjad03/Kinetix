import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/academic_docs.dart';
import '../../core/api.dart';
import '../../core/files.dart';
import '../../l10n/l10n.dart';
import '../../widgets/common.dart';

/// Words on this screen, in the three app languages.
const _words = <String, Map<String, String>>{
  'en': {
    'title': 'Transcripts and certificates',
    'transcript': 'Academic transcript',
    'provisional_certificate': 'Provisional certificate',
    'grade_card': 'Consolidated grade card',
    'request': 'Request',
    'purpose': 'Purpose (optional)',
    'sent': 'Request sent to the exam office.',
    'download': 'Download',
    'none': 'No requests yet.',
    'requested': 'Waiting for approval',
    'approved': 'Approved, being issued',
    'rejected': 'Not approved',
    'issued': 'Ready',
    'cannotOpen': 'No app on this phone can open the file.',
  },
  'hi': {
    'title': 'ट्रांसक्रिप्ट और प्रमाणपत्र',
    'transcript': 'शैक्षणिक ट्रांसक्रिप्ट',
    'provisional_certificate': 'अनंतिम प्रमाणपत्र',
    'grade_card': 'समेकित ग्रेड कार्ड',
    'request': 'अनुरोध करें',
    'purpose': 'उद्देश्य (वैकल्पिक)',
    'sent': 'अनुरोध परीक्षा कार्यालय को भेज दिया गया।',
    'download': 'डाउनलोड',
    'none': 'अभी कोई अनुरोध नहीं।',
    'requested': 'स्वीकृति की प्रतीक्षा',
    'approved': 'स्वीकृत, जारी हो रहा है',
    'rejected': 'स्वीकृत नहीं हुआ',
    'issued': 'तैयार',
    'cannotOpen': 'इस फ़ोन पर कोई ऐप फ़ाइल नहीं खोल सकता।',
  },
  'kn': {
    'title': 'ಟ್ರಾನ್ಸ್‌ಕ್ರಿಪ್ಟ್ ಮತ್ತು ಪ್ರಮಾಣಪತ್ರಗಳು',
    'transcript': 'ಶೈಕ್ಷಣಿಕ ಟ್ರಾನ್ಸ್‌ಕ್ರಿಪ್ಟ್',
    'provisional_certificate': 'ತಾತ್ಕಾಲಿಕ ಪ್ರಮಾಣಪತ್ರ',
    'grade_card': 'ಸಂಯೋಜಿತ ಗ್ರೇಡ್ ಕಾರ್ಡ್',
    'request': 'ವಿನಂತಿಸಿ',
    'purpose': 'ಉದ್ದೇಶ (ಐಚ್ಛಿಕ)',
    'sent': 'ವಿನಂತಿಯನ್ನು ಪರೀಕ್ಷಾ ಕಚೇರಿಗೆ ಕಳುಹಿಸಲಾಗಿದೆ.',
    'download': 'ಡೌನ್‌ಲೋಡ್',
    'none': 'ಇನ್ನೂ ವಿನಂತಿಗಳಿಲ್ಲ.',
    'requested': 'ಅನುಮೋದನೆಗಾಗಿ ಕಾಯುತ್ತಿದೆ',
    'approved': 'ಅನುಮೋದಿತ, ನೀಡಲಾಗುತ್ತಿದೆ',
    'rejected': 'ಅನುಮೋದಿಸಲಾಗಿಲ್ಲ',
    'issued': 'ಸಿದ್ಧ',
    'cannotOpen': 'ಈ ಫೋನ್‌ನಲ್ಲಿ ಫೈಲ್ ತೆರೆಯಬಲ್ಲ ಆ್ಯಪ್ ಇಲ್ಲ.',
  },
};

/// The title of the screen and of the link to it, in the app language.
String academicDocsTitle(BuildContext context) => (_words[Localizations.localeOf(context).languageCode] ?? _words['en']!)['title']!;

/// Asks the exam office for a transcript, provisional certificate or consolidated grade card and downloads it once issued.
class AcademicDocsScreen extends StatefulWidget {
  const AcademicDocsScreen({super.key, required this.api, required this.childId, this.openFile = openWithSystem});

  final ParentApi api;
  final String childId;
  final OpenFile openFile;

  static Future<void> open(BuildContext context, ParentApi api, String childId) =>
      Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => AcademicDocsScreen(api: api, childId: childId)));

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
    final code = Localizations.localeOf(context).languageCode;
    return (_words[code] ?? _words['en']!)[key] ?? _words['en']![key] ?? key;
  }

  Future<void> _load() async {
    try {
      final rows = await widget.api.academicDocRequests(widget.childId);
      if (mounted) setState(() { _rows = rows; _error = null; });
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = context.errorText(e));
    }
  }

  Future<void> _request() async {
    final messenger = ScaffoldMessenger.of(context);
    try {
      await widget.api.requestAcademicDoc(widget.childId, _kind, _purpose.text.trim());
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

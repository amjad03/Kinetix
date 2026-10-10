/// Requests for a transcript, provisional certificate or consolidated grade card
/// (services/api src/academic-docs/academic-docs.controller.ts).
library;

/// The documents a student can ask for, as the Cloud API names them.
const academicDocKinds = ['transcript', 'provisional_certificate', 'grade_card'];

class AcademicDocRequest {
  const AcademicDocRequest({required this.id, required this.kind, required this.title, required this.status, required this.purpose, this.serialNo});

  factory AcademicDocRequest.fromJson(Map<String, dynamic> j) => AcademicDocRequest(
    id: '${j['id']}',
    kind: '${j['kind']}',
    title: '${j['title'] ?? ''}',
    status: '${j['status']}',
    purpose: '${j['purpose'] ?? ''}',
    serialNo: j['serialNo'] as String?,
  );

  final String id, kind, title, status, purpose;
  final String? serialNo;

  /// Only an issued document has a file to download.
  bool get canDownload => status == 'issued';
}

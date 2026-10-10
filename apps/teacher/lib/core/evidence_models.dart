// A teacher's own accreditation evidence (publication, development programme, award, patent …).

const evidenceKinds = ['publication', 'fdp', 'award', 'patent', 'book', 'other'];

class EvidenceInfo {
  const EvidenceInfo({required this.id, required this.kind, required this.title, this.year, this.venue = '', this.url, this.fileName, this.verified = false});

  factory EvidenceInfo.fromJson(Map<String, dynamic> j) => EvidenceInfo(
    id: j['id'] as String,
    kind: j['kind'] as String,
    title: j['title'] as String,
    year: (j['year'] as num?)?.toInt(),
    venue: (j['venue'] as String?) ?? '',
    url: j['url'] as String?,
    fileName: j['fileName'] as String?,
    verified: j['verified'] == true,
  );

  final String id;
  final String kind;
  final String title;
  final int? year;
  final String venue;
  final String? url;
  final String? fileName;
  final bool verified;
}

/// The content type of a picked image from its first bytes, or null when it is not a PNG or JPEG.
String? imageContentType(List<int> bytes) {
  if (bytes.length > 3 && bytes[0] == 0x89 && bytes[1] == 0x50 && bytes[2] == 0x4e && bytes[3] == 0x47) return 'image/png';
  if (bytes.length > 2 && bytes[0] == 0xff && bytes[1] == 0xd8 && bytes[2] == 0xff) return 'image/jpeg';
  return null;
}

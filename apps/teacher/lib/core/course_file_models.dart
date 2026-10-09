/// Course files (GET /v1/course-files): the class and subject pairs a teacher can build a file for, and the versions built so far.
library;

class CourseFileOption {
  const CourseFileOption({required this.sectionId, required this.section, required this.subjectId, required this.subject, required this.code});

  factory CourseFileOption.fromJson(Map<String, dynamic> j) => CourseFileOption(
    sectionId: j['sectionId'] as String,
    section: j['section'] as String,
    subjectId: j['subjectId'] as String,
    subject: j['subject'] as String,
    code: (j['code'] as String?) ?? '',
  );

  final String sectionId, section, subjectId, subject, code;
}

class CourseFileVersion {
  const CourseFileVersion({required this.id, required this.sectionId, required this.subjectId, required this.version, required this.generatedAt, this.reviewedAt, this.reviewRemark});

  factory CourseFileVersion.fromJson(Map<String, dynamic> j) => CourseFileVersion(
    id: j['id'] as String,
    sectionId: j['sectionId'] as String,
    subjectId: j['subjectId'] as String,
    version: (j['version'] as num).toInt(),
    generatedAt: DateTime.parse(j['generatedAt'] as String),
    reviewedAt: j['reviewedAt'] == null ? null : DateTime.parse(j['reviewedAt'] as String),
    reviewRemark: j['reviewRemark'] as String?,
  );

  final String id, sectionId, subjectId;
  final int version;
  final DateTime generatedAt;
  final DateTime? reviewedAt;
  final String? reviewRemark;
}

// Scholarships (GET /v1/finance/scholarship-schemes, /v1/finance/scholarships, POST /v1/finance/scholarships/apply).

class ScholarshipScheme {
  const ScholarshipScheme({required this.id, required this.name, required this.percent, required this.value, this.minPercentage, this.maxIncomePaise});

  factory ScholarshipScheme.fromJson(Map<String, dynamic> j) => ScholarshipScheme(
    id: j['id'] as String,
    name: j['name'] as String,
    percent: j['kind'] == 'percent',
    value: (j['value'] as num).toInt(),
    minPercentage: (j['minPercentage'] as num?)?.toDouble(),
    maxIncomePaise: (j['maxIncomePaise'] as num?)?.toInt(),
  );

  final String id;
  final String name;

  /// true: `value` is a percentage off; false: `value` is paise off.
  final bool percent;
  final int value;
  final double? minPercentage;

  /// Families must declare an income at or below this; null = no income test.
  final int? maxIncomePaise;
}

enum ScholarshipStatus { pending, approved, rejected, cancelled }

class ScholarshipApplication {
  const ScholarshipApplication({required this.id, required this.scheme, required this.status, this.awardedPaise = 0, this.decisionNote});

  factory ScholarshipApplication.fromJson(Map<String, dynamic> j) => ScholarshipApplication(
    id: j['id'] as String,
    scheme: j['scheme'] as String? ?? '',
    status: ScholarshipStatus.values.asNameMap()[j['status']] ?? ScholarshipStatus.pending,
    awardedPaise: (j['awardedPaise'] as num?)?.toInt() ?? 0,
    decisionNote: j['decisionNote'] as String?,
  );

  final String id;
  final String scheme;
  final ScholarshipStatus status;

  /// What was taken off the fee dues on approval.
  final int awardedPaise;
  final String? decisionNote;
}

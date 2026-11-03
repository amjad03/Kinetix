/// Hostel life for a resident: the gate QR (`GET /v1/hostel/students/:id/gate-qr`), room complaints
/// (`GET|POST /v1/hostel/complaints`), the week's mess menu (`GET /v1/hostel/mess/menu`) and the safety helplines
/// (`GET /v1/hostel/safety`).
library;

/// The resident's gate QR: shown at the hostel gate going out and coming in.
class GateQr {
  const GateQr({required this.code});

  factory GateQr.fromJson(Map<String, dynamic> j) => GateQr(code: '${j['code']}');

  /// `HG1:<token>`; it stops working when the bed is vacated.
  final String code;
}

/// A complaint about the room or the hostel and where it stands.
class HostelComplaint {
  const HostelComplaint({required this.id, required this.category, required this.description, required this.status, this.resolution, this.createdAt, this.resolvedAt});

  factory HostelComplaint.fromJson(Map<String, dynamic> j) => HostelComplaint(
    id: '${j['id']}',
    category: '${j['category'] ?? 'other'}',
    description: '${j['description'] ?? ''}',
    status: '${j['status'] ?? 'open'}',
    resolution: j['resolution'] as String?,
    createdAt: j['createdAt'] == null ? null : DateTime.parse('${j['createdAt']}').toLocal(),
    resolvedAt: j['resolvedAt'] == null ? null : DateTime.parse('${j['resolvedAt']}').toLocal(),
  );

  final String id;

  /// maintenance, food, cleanliness, safety or other.
  final String category;
  final String description;

  /// open, in_progress or resolved.
  final String status;
  final String? resolution;
  final DateTime? createdAt;
  final DateTime? resolvedAt;

  static const categories = ['maintenance', 'food', 'cleanliness', 'safety', 'other'];
}

/// One meal on one day of the week's mess menu.
class MenuMeal {
  const MenuMeal({required this.dayOfWeek, required this.meal, required this.items});

  factory MenuMeal.fromJson(Map<String, dynamic> j) => MenuMeal(dayOfWeek: (j['dayOfWeek'] as num).toInt(), meal: '${j['meal']}', items: '${j['items'] ?? ''}');

  /// 1 = Monday … 7 = Sunday.
  final int dayOfWeek;

  /// breakfast, lunch, snacks or dinner.
  final String meal;
  final String items;

  static const order = ['breakfast', 'lunch', 'snacks', 'dinner'];
}

/// The helplines a resident should know: the national anti-ragging helpline and the hostel's committees.
class HostelSafety {
  const HostelSafety({required this.nationalHelpline, required this.nationalEmail, this.committees = const []});

  factory HostelSafety.fromJson(Map<String, dynamic> j) => HostelSafety(
    nationalHelpline: '${j['nationalHelpline'] ?? '1800-180-5522'}',
    nationalEmail: '${j['nationalEmail'] ?? ''}',
    committees: [for (final c in (j['committees'] as List? ?? const [])) SafetyContact.fromJson((c as Map).cast<String, dynamic>())],
  );

  final String nationalHelpline;
  final String nationalEmail;
  final List<SafetyContact> committees;
}

class SafetyContact {
  const SafetyContact({required this.purpose, required this.name, this.helpline = ''});

  factory SafetyContact.fromJson(Map<String, dynamic> j) => SafetyContact(purpose: '${j['purpose']}', name: '${j['name'] ?? ''}', helpline: '${j['helpline'] ?? ''}');

  /// anti_ragging, anti_ragging_squad, mess or discipline.
  final String purpose;
  final String name;
  final String helpline;
}

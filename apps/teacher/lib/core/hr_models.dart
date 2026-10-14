/// HR contracts of the staff endpoints (packages/shared/src/hr.ts): leave, attendance, payslips.
/// Amounts are integer paise; dates are YYYY-MM-DD.
library;

DateTime parseDay(String s) => DateTime.utc(int.parse(s.substring(0, 4)), int.parse(s.substring(5, 7)), int.parse(s.substring(8, 10)));

String dayString(DateTime d) => '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

/// Working days in [from, to] (inclusive): no weekly off (Sunday by default) and no holiday.
/// Half-day requests count 0.5 and need a single working day. The server decides; this is the preview.
double leaveDays(DateTime from, DateTime to, {bool halfDay = false, Set<int> weeklyOffs = const {DateTime.sunday}, Set<String> holidays = const {}}) {
  var n = 0;
  for (var d = DateTime.utc(from.year, from.month, from.day); !d.isAfter(to); d = d.add(const Duration(days: 1))) {
    if (!weeklyOffs.contains(d.weekday) && !holidays.contains(dayString(d))) n++;
  }
  return halfDay && n > 0 ? 0.5 : n.toDouble();
}

/// "1", "0.5", "12.5".
String daysText(num d) => d == d.roundToDouble() ? d.round().toString() : d.toString();

class LeaveTypeInfo {
  const LeaveTypeInfo({
    required this.id,
    required this.code,
    required this.name,
    required this.paid,
    this.minNoticeDays = 0,
    this.requiresDocument = false,
    this.maxPerRequest,
    this.halfDayAllowed = true,
  });

  factory LeaveTypeInfo.fromJson(Map<String, dynamic> j) => LeaveTypeInfo(
    id: j['id'] as String,
    code: j['code'] as String,
    name: j['name'] as String,
    paid: j['paid'] as bool,
    minNoticeDays: (j['minNoticeDays'] as num?)?.toInt() ?? 0,
    requiresDocument: j['requiresDocument'] == true,
    maxPerRequest: (j['maxPerRequest'] as num?)?.toDouble(),
    halfDayAllowed: j['halfDayAllowed'] != false,
  );

  final String id, code, name;
  final bool paid;

  /// Days ahead the leave must be asked for (0: no notice needed).
  final int minNoticeDays;

  /// A supporting document (a medical certificate, an order) is needed for longer leave.
  final bool requiresDocument;

  /// The most days one request may take; null for no limit.
  final double? maxPerRequest;
  final bool halfDayAllowed;
}

/// The longest leave of a type that needs a document which may be approved without one (services/api hr/leave.service.ts).
const documentAfterDays = 2;

class LeaveBalanceInfo {
  const LeaveBalanceInfo({required this.type, required this.opening, required this.accrued, required this.used, required this.pending, required this.available});

  factory LeaveBalanceInfo.fromJson(Map<String, dynamic> j) => LeaveBalanceInfo(
    type: LeaveTypeInfo.fromJson(j['leaveType'] as Map<String, dynamic>),
    opening: (j['opening'] as num).toDouble(),
    accrued: (j['accrued'] as num).toDouble(),
    used: (j['used'] as num).toDouble(),
    pending: (j['pending'] as num).toDouble(),
    available: (j['available'] as num).toDouble(),
  );

  final LeaveTypeInfo type;
  final double opening, accrued, used, pending, available;
}

enum LeaveStatus { pending, recommended, approved, rejected, cancelled }

class LeaveRequestInfo {
  const LeaveRequestInfo({
    required this.id,
    required this.userId,
    required this.userName,
    required this.type,
    required this.fromDate,
    required this.toDate,
    required this.halfDay,
    required this.days,
    required this.reason,
    required this.status,
    this.decisionNote,
    this.hasDocument = false,
    this.documentName,
    this.delegateName,
  });

  factory LeaveRequestInfo.fromJson(Map<String, dynamic> j) => LeaveRequestInfo(
    hasDocument: j['hasDocument'] == true,
    documentName: j['documentName'] as String?,
    delegateName: (j['delegate'] as Map?)?['fullName'] as String?,
    id: j['id'] as String,
    userId: (j['user'] as Map)['id'] as String,
    userName: (j['user'] as Map)['fullName'] as String,
    type: LeaveTypeInfo.fromJson(j['leaveType'] as Map<String, dynamic>),
    fromDate: parseDay(j['fromDate'] as String),
    toDate: parseDay(j['toDate'] as String),
    halfDay: j['halfDay'] as bool,
    days: (j['days'] as num).toDouble(),
    reason: (j['reason'] as String?) ?? '',
    status: LeaveStatus.values.byName(j['status'] as String),
    decisionNote: j['decisionNote'] as String?,
  );

  final String id, userId, userName, reason;
  final LeaveTypeInfo type;
  final DateTime fromDate, toDate;
  final bool halfDay;
  final double days;
  final LeaveStatus status;
  final String? decisionNote;

  /// A supporting document is attached ([documentName]).
  final bool hasDocument;
  final String? documentName;

  /// The colleague who approves in the applicant's place while they are away.
  final String? delegateName;
}

class AttendanceDayInfo {
  const AttendanceDayInfo({required this.date, required this.status, this.checkInAt, this.checkOutAt});

  factory AttendanceDayInfo.fromJson(Map<String, dynamic> j) => AttendanceDayInfo(
    date: j['date'] as String,
    status: j['status'] as String,
    checkInAt: j['checkInAt'] == null ? null : DateTime.parse(j['checkInAt'] as String).toLocal(),
    checkOutAt: j['checkOutAt'] == null ? null : DateTime.parse(j['checkOutAt'] as String).toLocal(),
  );

  final String date;

  /// present, absent, half_day or on_leave.
  final String status;
  final DateTime? checkInAt, checkOutAt;
}

class MyAttendance {
  const MyAttendance({required this.today, required this.month, required this.days});

  factory MyAttendance.fromJson(Map<String, dynamic> j) => MyAttendance(
    today: j['today'] == null ? null : AttendanceDayInfo.fromJson(j['today'] as Map<String, dynamic>),
    month: j['month'] as String,
    days: [for (final d in (j['days'] as List)) AttendanceDayInfo.fromJson(d as Map<String, dynamic>)],
  );

  final AttendanceDayInfo? today;
  final String month;
  final List<AttendanceDayInfo> days;
}

class PayslipLineInfo {
  const PayslipLineInfo({required this.name, required this.amountPaise});

  final String name;
  final int amountPaise;
}

/// A salary advance or staff loan; approved ones are recovered through payroll.
class LoanInfo {
  const LoanInfo({required this.id, required this.loanNo, required this.kind, required this.amountPaise, required this.installments, required this.emiPaise, required this.startMonth, required this.purpose, required this.status, required this.outstandingPaise});

  factory LoanInfo.fromJson(Map<String, dynamic> j) => LoanInfo(
    id: j['id'] as String,
    loanNo: j['loanNo'] as String,
    kind: j['kind'] as String,
    amountPaise: (j['amountPaise'] as num).toInt(),
    installments: (j['installments'] as num).toInt(),
    emiPaise: (j['emiPaise'] as num).toInt(),
    startMonth: j['startMonth'] as String,
    purpose: j['purpose'] as String? ?? '',
    status: j['status'] as String,
    outstandingPaise: (j['outstandingPaise'] as num).toInt(),
  );

  final String id;
  final String loanNo;
  /// advance | loan
  final String kind;
  final int amountPaise;
  final int installments;
  final int emiPaise;
  final String startMonth;
  final String purpose;
  /// pending | approved | rejected | cancelled | closed
  final String status;
  final int outstandingPaise;
}

class PayslipInfo {
  const PayslipInfo({
    required this.id,
    required this.month,
    required this.lopDays,
    required this.paidDays,
    required this.earnings,
    required this.deductions,
    required this.grossPaise,
    required this.deductionsPaise,
    required this.netPaise,
  });

  factory PayslipInfo.fromJson(Map<String, dynamic> j) {
    List<PayslipLineInfo> lines(String k) => [
      for (final e in (j[k] as List)) PayslipLineInfo(name: (e as Map)['name'] as String, amountPaise: (e['amountPaise'] as num).toInt()),
    ];
    return PayslipInfo(
      id: j['id'] as String,
      month: j['month'] as String,
      lopDays: (j['lopDays'] as num).toDouble(),
      paidDays: (j['paidDays'] as num).toDouble(),
      earnings: lines('earnings'),
      deductions: lines('deductions'),
      grossPaise: (j['grossPaise'] as num).toInt(),
      deductionsPaise: (j['deductionsPaise'] as num).toInt(),
      netPaise: (j['netPaise'] as num).toInt(),
    );
  }

  final String id, month;
  final double lopDays, paidDays;
  final List<PayslipLineInfo> earnings, deductions;
  final int grossPaise, deductionsPaise, netPaise;
}

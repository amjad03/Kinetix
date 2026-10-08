/// Hostel nights and the canteen wallet, as the Cloud API sends them
/// (`GET /v1/hostel/students/:id`, `GET /v1/canteen/students/:id`).
library;

import 'models.dart';

/// One night's roll call: present, absent, or leave (out on a gate pass).
class NightMark {
  const NightMark({required this.night, required this.status});

  factory NightMark.fromJson(Map<String, dynamic> j) => NightMark(night: j['night'] as String, status: j['status'] as String);

  final String night;
  final String status;

  bool get absent => status == 'absent';
}

class BoardingView {
  const BoardingView({required this.resident, this.block, this.room, this.bed, this.nights = const []});

  factory BoardingView.fromJson(Map<String, dynamic> j) {
    final bed = (j['bed'] as Map?)?.cast<String, dynamic>();
    return BoardingView(
      resident: j['resident'] as bool? ?? false,
      block: bed?['block'] as String?,
      room: bed?['room'] as String?,
      bed: bed?['bed'] as String?,
      nights: [for (final n in (j['nights'] as List? ?? const [])) NightMark.fromJson((n as Map).cast<String, dynamic>())],
    );
  }

  final bool resident;
  final String? block;
  final String? room;
  final String? bed;
  final List<NightMark> nights;
}

class MealMark {
  const MealMark({required this.date, required this.meal});

  factory MealMark.fromJson(Map<String, dynamic> j) => MealMark(date: j['date'] as String, meal: j['meal'] as String);

  final String date;
  final String meal;
}

class WalletTxn {
  const WalletTxn({required this.deltaPaise, required this.kind, required this.createdAt});

  factory WalletTxn.fromJson(Map<String, dynamic> j) =>
      WalletTxn(deltaPaise: (j['deltaPaise'] as num).toInt(), kind: j['kind'] as String, createdAt: DateTime.parse(j['createdAt'] as String));

  final int deltaPaise;

  /// topup or order.
  final String kind;
  final DateTime createdAt;
}

class WalletView {
  const WalletView({required this.balancePaise, this.txns = const [], this.meals = const [], this.onlinePayments});

  factory WalletView.fromJson(Map<String, dynamic> j) => WalletView(
    balancePaise: (j['balancePaise'] as num).toInt(),
    txns: [for (final t in (j['txns'] as List? ?? const [])) WalletTxn.fromJson((t as Map).cast<String, dynamic>())],
    meals: [for (final m in (j['meals'] as List? ?? const [])) MealMark.fromJson((m as Map).cast<String, dynamic>())],
    onlinePayments: switch (j['onlinePayments']) {
      'razorpay' => OnlinePayments.razorpay,
      'demo' => OnlinePayments.demo,
      _ => null,
    },
  );

  final int balancePaise;
  final List<WalletTxn> txns;
  final List<MealMark> meals;

  /// How the institution takes online payments; null when it does not.
  final OnlinePayments? onlinePayments;
}

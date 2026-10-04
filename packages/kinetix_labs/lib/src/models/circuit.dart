/// How the resistors are connected.
enum Arrangement { series, parallel }

/// A cell (ideal, no internal resistance), a plug key, an ammeter in the main line and a
/// voltmeter across the resistor combination, as in the CBSE Class 10 Ohm's law activity.
class Circuit {
  const Circuit({required this.voltage, required this.resistors, this.arrangement = Arrangement.series, this.keyClosed = true})
      : assert(resistors.length >= 1);

  final double voltage;
  final List<double> resistors;
  final Arrangement arrangement;
  final bool keyClosed;

  /// R = R1 + R2 + R3 in series; 1/R = 1/R1 + 1/R2 + 1/R3 in parallel.
  double get equivalentResistance => arrangement == Arrangement.series
      ? resistors.fold(0.0, (s, r) => s + r)
      : 1 / resistors.fold(0.0, (s, r) => s + 1 / r);

  /// Ammeter reading, I = V / R.
  double get current => keyClosed ? voltage / equivalentResistance : 0;

  /// Voltmeter reading across the combination.
  double get voltmeterReading => keyClosed ? voltage : 0;

  /// Current through each resistor.
  List<double> get resistorCurrents => [
        for (final r in resistors) arrangement == Arrangement.series ? current : (keyClosed ? voltage / r : 0),
      ];

  /// Potential difference across each resistor.
  List<double> get resistorVoltages => [
        for (final r in resistors) arrangement == Arrangement.series ? current * r : voltmeterReading,
      ];

  /// P = VI.
  double get power => voltmeterReading * current;

  Circuit copyWith({double? voltage, List<double>? resistors, Arrangement? arrangement, bool? keyClosed}) => Circuit(
        voltage: voltage ?? this.voltage,
        resistors: resistors ?? this.resistors,
        arrangement: arrangement ?? this.arrangement,
        keyClosed: keyClosed ?? this.keyClosed,
      );
}

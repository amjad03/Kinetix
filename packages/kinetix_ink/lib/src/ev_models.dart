import 'dart:math' as math;

// The electric-vehicle panels' figures: the charging circuits (AC through the onboard charger,
// DC fast charging off board) with a CC-CV charge of the pack, and the power flow between the
// battery, inverter, motor and wheels in each driving mode, with the losses of every stage and
// the range at a steady speed. Plain Dart; ev_painting.dart draws them. JSON is tolerant.

double _d(Object? v, double fallback) => v is num && v.isFinite ? v.toDouble() : fallback;
String _s(Object? v, String fallback) => v is String ? v : fallback;
bool _b(Object? v, bool fallback) => v is bool ? v : fallback;

// --- Charging -------------------------------------------------------------------------------------

/// A lithium-ion cell's open-circuit voltage at state of charge [soc] (0..1): 3.0 V empty, 4.2 V
/// full, steep at both ends like an NMC cell.
double cellOcv(double soc) {
  final s = soc.clamp(0.0, 1.0);
  return 3.0 + 0.95 * s + 0.25 * (1 - math.exp(-12 * s));
}

/// One sample of a CC-CV charge: time (minutes), state of charge, cell terminal voltage and
/// current (as a C-rate: 1C fills the cell in an hour).
typedef ChargePoint = ({double minutes, double soc, double volts, double cRate});

/// Charges a cell from [socStart] by constant current at [cRate] until the terminal voltage
/// reaches [vMax], then at constant voltage until the current falls to [cutoff]. [resistance]
/// is the cell's resistance in volts per C (the voltage rise at 1C). One point every [dtMin]
/// minutes.
List<ChargePoint> ccCvCharge({double socStart = 0.1, double cRate = 1, double vMax = 4.2, double cutoff = 0.05, double resistance = 0.08, double dtMin = 0.25}) {
  final out = <ChargePoint>[];
  var soc = socStart.clamp(0.0, 0.999), t = 0.0;
  const maxMinutes = 24 * 60.0;
  while (t <= maxMinutes) {
    final ocv = cellOcv(soc);
    // CC while the voltage stays below vMax, then CV: the current that holds the terminal at vMax.
    var c = cRate;
    var v = ocv + c * resistance;
    if (v >= vMax) {
      c = math.max(0, (vMax - ocv) / resistance);
      v = vMax;
    }
    out.add((minutes: t, soc: soc, volts: v, cRate: c));
    if (c <= cutoff || soc >= 1) break;
    soc = math.min(1, soc + c * dtMin / 60);
    t += dtMin;
  }
  return out;
}

/// What the charging panel shows.
enum EvChargeView { ac, dc }

/// The charging circuit panel: AC (Level 1 / 2, through the onboard charger) or DC fast charging
/// (off-board), the pack and charger sizes, and the CC-CV curve of the charge they give.
class EvChargingPanel {
  const EvChargingPanel({this.title = '', this.view = EvChargeView.ac, this.packKwh = 30, this.packVolts = 350, this.chargerKw = 7.4, this.socStart = 0.2, this.maxC = 2, this.connectors = true});

  final String title;
  final EvChargeView view;
  final double packKwh, packVolts, chargerKw, socStart;

  /// The highest C-rate the pack accepts (the BMS limit).
  final double maxC;

  /// Whether the connector table shows.
  final bool connectors;

  /// The charging rate: the charger's power over the pack's energy, capped by the pack.
  double get cRate => math.min(maxC, chargerKw / packKwh);

  /// The CC-CV charge from [socStart].
  List<ChargePoint> get curve => ccCvCharge(socStart: socStart, cRate: cRate, dtMin: cRate > 0.5 ? 0.25 : 1);

  /// Minutes to reach [soc] (null if the charge never gets there).
  double? minutesTo(double soc) {
    for (final p in curve) {
      if (p.soc >= soc) return p.minutes;
    }
    return null;
  }

  /// The charging current at the start (A), from the pack voltage.
  double get startAmps => chargerKw * 1000 / packVolts;

  String get heading => title.isNotEmpty ? title : (view == EvChargeView.ac ? 'AC charging: onboard charger' : 'DC fast charging: off-board charger');

  EvChargingPanel copyWith({String? title, EvChargeView? view, double? packKwh, double? packVolts, double? chargerKw, double? socStart, double? maxC, bool? connectors}) => EvChargingPanel(
    title: title ?? this.title,
    view: view ?? this.view,
    packKwh: packKwh ?? this.packKwh,
    packVolts: packVolts ?? this.packVolts,
    chargerKw: chargerKw ?? this.chargerKw,
    socStart: socStart ?? this.socStart,
    maxC: maxC ?? this.maxC,
    connectors: connectors ?? this.connectors,
  );

  Map<String, Object?> toJson() => {'title': title, 'view': view.name, 'kwh': packKwh, 'v': packVolts, 'kw': chargerKw, 'soc0': socStart, 'maxC': maxC, 'conn': connectors};

  factory EvChargingPanel.fromJson(Map<String, Object?> j) => EvChargingPanel(
    title: _s(j['title'], ''),
    view: EvChargeView.values.asNameMap()[j['view']] ?? EvChargeView.ac,
    packKwh: math.max(1, _d(j['kwh'], 30)),
    packVolts: math.max(12, _d(j['v'], 350)),
    chargerKw: math.max(0.5, _d(j['kw'], 7.4)),
    socStart: _d(j['soc0'], 0.2).clamp(0.0, 0.95).toDouble(),
    maxC: math.max(0.1, _d(j['maxC'], 2)),
    connectors: _b(j['conn'], true),
  );
}

/// The connectors in the table: name, AC/DC, typical power and where it is used.
const evConnectors = [
  ('Type 2 (IEC 62196-2)', 'AC', '3.7–22 kW (1- or 3-phase)', 'Most cars in India and Europe; home and public AC'),
  ('CCS2 (Combo 2)', 'AC + DC', 'up to 350 kW DC', 'Type 2 with two DC pins below; most new Indian cars'),
  ('CHAdeMO', 'DC', '50–100 kW (400 kW spec)', 'Japanese standard; older Nissan, Mitsubishi'),
  ('Bharat AC-001', 'AC', '3.3 kW × 3 outlets (230 V, 15 A)', 'Indian low-power AC for 2/3-wheelers and small cars'),
  ('Bharat DC-001', 'DC', '15 kW (48–72 V or up to 200 V)', 'Indian low-voltage DC (GB/T connector); fleets'),
  ('Type 6 / LEVAC', 'AC', 'up to 3 kW', 'Light EVs (scooters, e-rickshaws), IS 17017-2-6'),
];

// --- Power flow -------------------------------------------------------------------------------------

/// The driving modes of the power-flow panel.
enum EvMode { driving, regen, charging, idle }

/// One stage's power in and out (W; positive in the battery → wheels direction).
typedef PowerStage = ({String name, double input, double output});

/// The power flow in an EV: a vehicle with mass [massKg], wheel radius [wheelR] (m), gear
/// ratio [gear], running at [speedKmh] with motor torque [torqueNm] (negative in regenerative
/// braking); stage efficiencies; auxiliary load [auxW]; [chargerKw] in the charging mode.
class EvPowerFlow {
  const EvPowerFlow({
    this.title = '',
    this.mode = EvMode.driving,
    this.speedKmh = 60,
    this.torqueNm = 60,
    this.massKg = 1500,
    this.wheelR = 0.3,
    this.gear = 9,
    this.effInverter = 0.97,
    this.effMotor = 0.93,
    this.effGear = 0.97,
    this.effCharger = 0.92,
    this.auxW = 500,
    this.chargerKw = 7.4,
    this.packKwh = 30,
    this.crr = 0.01,
    this.cdA = 0.7,
  });

  final String title;
  final EvMode mode;
  final double speedKmh, torqueNm, massKg, wheelR, gear;
  final double effInverter, effMotor, effGear, effCharger;
  final double auxW, chargerKw, packKwh;

  /// Rolling resistance coefficient and drag area Cd·A (m²) for the road load and range.
  final double crr, cdA;

  double get speed => speedKmh / 3.6;

  /// Motor speed, rad/s and rpm.
  double get motorRadS => speed / wheelR * gear;
  double get motorRpm => motorRadS * 60 / (2 * math.pi);

  /// The motor torque in this mode: positive when driving, negative in regen, none otherwise.
  double get torque => switch (mode) {
    EvMode.driving => torqueNm.abs(),
    EvMode.regen => -torqueNm.abs(),
    _ => 0,
  };

  /// The road load at [kmh] on the level: rolling resistance plus air drag (N).
  double roadForce(double kmh) {
    final v = kmh / 3.6;
    return massKg * 9.81 * crr + 0.5 * 1.2 * cdA * v * v;
  }

  /// The motor torque that holds [speedKmh] steady on the level.
  double get cruiseTorque => roadForce(speedKmh) * wheelR / gear / effGear;

  /// The stages from battery to wheels with the power into and out of each (W). Driving: the
  /// battery feeds the inverter, motor and gear; regen: the wheels drive them backwards and the
  /// battery takes in what is left; charging: the grid feeds the charger and the battery; the
  /// auxiliaries (12 V, cooling, cabin) draw [auxW] from the battery throughout.
  ({double battery, double aux, List<PowerStage> stages, double wheels, double grid}) get flow {
    final shaft = torque * motorRadS; // motor shaft power (W), signed
    switch (mode) {
      case EvMode.driving:
        final ac = shaft / effMotor, dc = ac / effInverter, wheels = shaft * effGear;
        return (
          battery: dc + auxW,
          aux: auxW,
          stages: [(name: 'Inverter', input: dc, output: ac), (name: 'Motor', input: ac, output: shaft), (name: 'Gearbox', input: shaft, output: wheels)],
          wheels: wheels,
          grid: 0,
        );
      case EvMode.regen:
        // Power flows from the wheels back: each stage's input is on the wheel side.
        final wheels = shaft / effGear, ac = shaft * effMotor, dc = ac * effInverter;
        return (
          battery: dc + auxW,
          aux: auxW,
          stages: [(name: 'Inverter', input: ac, output: dc), (name: 'Motor', input: shaft, output: ac), (name: 'Gearbox', input: wheels, output: shaft)],
          wheels: wheels,
          grid: 0,
        );
      case EvMode.charging:
        final grid = chargerKw * 1000, intoPack = grid * effCharger;
        return (battery: -(intoPack - auxW), aux: auxW, stages: [(name: 'Charger', input: grid, output: intoPack)], wheels: 0, grid: grid);
      case EvMode.idle:
        return (battery: auxW, aux: auxW, stages: const [], wheels: 0, grid: 0);
    }
  }

  /// The losses of every stage (W, always ≥ 0).
  double get losses => flow.stages.fold(0.0, (s, st) => s + (st.input.abs() - st.output.abs()).abs());

  /// Battery power at a steady [kmh] on the level (W).
  double cruiseBatteryW(double kmh) {
    final v = kmh / 3.6;
    final wheels = roadForce(kmh) * v;
    return wheels / (effGear * effMotor * effInverter) + auxW;
  }

  /// Energy use at a steady [kmh], Wh/km.
  double whPerKm(double kmh) => kmh <= 0 ? double.infinity : cruiseBatteryW(kmh) / kmh;

  /// Range at a steady [kmh] on a full pack (90% usable), km.
  double rangeKm(double kmh) => packKwh * 900 / whPerKm(kmh);

  String get heading => title.isNotEmpty ? title : 'EV power flow';

  EvPowerFlow copyWith({
    String? title,
    EvMode? mode,
    double? speedKmh,
    double? torqueNm,
    double? massKg,
    double? wheelR,
    double? gear,
    double? effInverter,
    double? effMotor,
    double? effGear,
    double? effCharger,
    double? auxW,
    double? chargerKw,
    double? packKwh,
  }) => EvPowerFlow(
    title: title ?? this.title,
    mode: mode ?? this.mode,
    speedKmh: speedKmh ?? this.speedKmh,
    torqueNm: torqueNm ?? this.torqueNm,
    massKg: massKg ?? this.massKg,
    wheelR: wheelR ?? this.wheelR,
    gear: gear ?? this.gear,
    effInverter: effInverter ?? this.effInverter,
    effMotor: effMotor ?? this.effMotor,
    effGear: effGear ?? this.effGear,
    effCharger: effCharger ?? this.effCharger,
    auxW: auxW ?? this.auxW,
    chargerKw: chargerKw ?? this.chargerKw,
    packKwh: packKwh ?? this.packKwh,
    crr: crr,
    cdA: cdA,
  );

  Map<String, Object?> toJson() => {
    'title': title,
    'mode': mode.name,
    'kmh': speedKmh,
    'nm': torqueNm,
    'kg': massKg,
    'r': wheelR,
    'g': gear,
    'ei': effInverter,
    'em': effMotor,
    'eg': effGear,
    'ec': effCharger,
    'aux': auxW,
    'kw': chargerKw,
    'kwh': packKwh,
    'crr': crr,
    'cda': cdA,
  };

  factory EvPowerFlow.fromJson(Map<String, Object?> j) {
    double eff(Object? v, double f) => _d(v, f).clamp(0.5, 1.0).toDouble();
    return EvPowerFlow(
      title: _s(j['title'], ''),
      mode: EvMode.values.asNameMap()[j['mode']] ?? EvMode.driving,
      speedKmh: _d(j['kmh'], 60).clamp(0, 250).toDouble(),
      torqueNm: _d(j['nm'], 60).clamp(-500, 500).toDouble(),
      massKg: math.max(100, _d(j['kg'], 1500)),
      wheelR: _d(j['r'], 0.3).clamp(0.1, 1.0).toDouble(),
      gear: math.max(1, _d(j['g'], 9)),
      effInverter: eff(j['ei'], 0.97),
      effMotor: eff(j['em'], 0.93),
      effGear: eff(j['eg'], 0.97),
      effCharger: eff(j['ec'], 0.92),
      auxW: math.max(0, _d(j['aux'], 500)),
      chargerKw: math.max(0, _d(j['kw'], 7.4)),
      packKwh: math.max(1, _d(j['kwh'], 30)),
      crr: _d(j['crr'], 0.01),
      cdA: _d(j['cda'], 0.7),
    );
  }
}

import 'dart:convert';
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_ink/kinetix_ink.dart';

/// The chemical engineering and EV panels' models, checked against the textbook formulas.
void main() {
  group('McCabe–Thiele', () {
    // Benzene–toluene, α = 2.5, saturated liquid feed: the usual textbook example.
    const base = McCabeThiele(alpha: 2.5, zF: 0.5, xD: 0.95, xW: 0.05, q: 1, reflux: 1.65);

    test('minimum reflux from the pinch and Fenske minimum stages', () {
      expect(base.pinch.dx, closeTo(0.5, 1e-12));
      expect(base.pinch.dy, closeTo(1.25 / 1.75, 1e-12));
      expect(base.minReflux, closeTo(1.1, 1e-9));
      expect(base.minStages, closeTo(math.log(19 * 19) / math.log(2.5), 1e-12));
      expect(base.minStages, closeTo(6.43, 0.01));
    });

    test('at total reflux the stepping gives the Fenske number of stages', () {
      final st = base.copyWith(reflux: 1e5).step();
      expect(st.stages, 7);
      expect(st.stages - 1 + st.fraction, closeTo(base.minStages, 0.25));
    });

    test('at 1.5 Rmin: about twice the minimum stages, feed near the middle; more reflux, fewer stages', () {
      final st = base.step();
      expect(base.feasible, isTrue);
      expect(st.stages, inInclusiveRange(11, 16));
      expect(st.feedStage, inInclusiveRange(4, st.stages - 2));
      final more = base.copyWith(reflux: 3).step();
      expect(more.stages, lessThan(st.stages));
      expect(more.stages, greaterThanOrEqualTo(7));
      // Every step's top corner is on the equilibrium curve.
      for (var i = 1; i < st.corners.length; i += 2) {
        expect(base.yEq(st.corners[i].dx), closeTo(st.corners[i].dy, 1e-9));
      }
    });

    test('below minimum reflux there is no column; a vapour feed puts the lines crossing at y = zF', () {
      final pinched = base.copyWith(reflux: 1.0);
      expect(pinched.feasible, isFalse);
      expect(pinched.step().stages, 0);
      final vapour = base.copyWith(q: 0, reflux: 3);
      expect(vapour.intersection.dy, closeTo(0.5, 1e-9));
      expect(vapour.minReflux, greaterThan(base.minReflux));
      expect(vapour.yBottom(0.05), closeTo(0.05, 1e-12));
    });
  });

  group('Heat exchanger', () {
    test('LMTD formula and its limit at equal ends', () {
      expect(lmtd(70, 70), 70);
      expect(lmtd(50, 40), closeTo(10 / math.log(1.25), 1e-12));
      expect(lmtd(50, 40), closeTo(44.814, 1e-3));
      expect(lmtd(80, 10), closeTo(70 / math.log(8), 1e-12));
      expect(lmtd(10, -5).isNaN, isTrue);
    });

    test('counter- and co-current: energy balance, ends, LMTD, area and the profiles', () {
      const hx = HeatExchanger(thIn: 100, thOut: 60, tcIn: 20, ch: 1.5, cc: 2, u: 400);
      expect(hx.duty, closeTo(60, 1e-12));
      expect(hx.tcOut, closeTo(50, 1e-12));
      expect(hx.ends, (50.0, 40.0));
      expect(hx.lmtdValue, closeTo(44.814, 1e-3));
      expect(hx.area, closeTo(60e3 / (400 * hx.lmtdValue), 1e-9));
      final co = hx.copyWith(counter: false);
      expect(co.ends, (80.0, 10.0));
      expect(co.lmtdValue, closeTo(33.66, 0.01));
      expect(co.area, greaterThan(hx.area));
      // Profiles end at the given temperatures.
      expect(hx.at(0).$1, closeTo(100, 1e-9));
      expect(hx.at(0).$2, closeTo(50, 1e-9));
      expect(hx.at(1).$1, closeTo(60, 1e-9));
      expect(hx.at(1).$2, closeTo(20, 1e-9));
      expect(co.at(0).$2, closeTo(20, 1e-9));
      expect(co.at(1).$2, closeTo(50, 1e-9));
      // A temperature cross is not possible in co-current.
      expect(hx.copyWith(thOut: 40, counter: false).feasible, isFalse);
    });
  });

  group('CSTR vs PFR', () {
    test('first-order conversion and space time formulas', () {
      expect(cstrConversion(0.2, 10), closeTo(2 / 3, 1e-12));
      expect(pfrConversion(0.2, 10), closeTo(1 - math.exp(-2), 1e-12));
      expect(cstrSpaceTime(0.2, 2 / 3), closeTo(10, 1e-9));
      expect(pfrSpaceTime(0.2, 1 - math.exp(-2)), closeTo(10, 1e-9));
      expect(cstrSeriesConversion(0.2, 10, 1), closeTo(cstrConversion(0.2, 10), 1e-12));
      expect(cstrSeriesConversion(0.2, 10, 500), closeTo(pfrConversion(0.2, 10), 1e-3));
    });

    test('the CSTR needs more volume, less with more tanks; Levenspiel areas match', () {
      const r = ReactorCompare(k: 0.2, target: 0.8);
      expect(r.tauPfr, closeTo(-math.log(0.2) / 0.2, 1e-12));
      expect(r.tauCstr, closeTo(0.8 / (0.2 * 0.2), 1e-12));
      expect(r.tauCstr / r.tauPfr, closeTo(20 / (5 * math.log(5)), 1e-9));
      // Rectangle area X·CA0/(−rA) at the exit.
      expect(r.target * r.levenspiel(r.target), closeTo(r.tauCstr, 1e-9));
      final three = r.copyWith(tanks: 3);
      expect(three.tauCstr, lessThan(r.tauCstr));
      expect(three.tauCstr, greaterThan(r.tauPfr));
      expect(cstrSeriesConversion(0.2, three.tauCstr, 3), closeTo(0.8, 1e-9));
    });
  });

  group('PFD', () {
    test('samples serialise, stream numbers and tags count on, instruments make signal lines', () {
      for (final s in PfdSample.values) {
        final d = PfdDiagram.sample(s);
        final back = PfdDiagram.fromJson(jsonDecode(jsonEncode(d.toJson())) as Map<String, dynamic>);
        expect(jsonEncode(back.toJson()), jsonEncode(d.toJson()), reason: s.name);
      }
      final d = PfdDiagram.sample(PfdSample.distillation);
      expect(d.nextStreamNumber, 10);
      expect(d.nextTag(PfdUnitType.pump), 'P-103');
      expect(d.nextTag(PfdUnitType.instrument), '104');
      final added = d.add(PfdUnitType.pump, const Offset(333, 471));
      final p = added.units.last;
      expect(p.pos, const Offset(340, 480));
      expect(p.tag, 'P-103');
      final joined = added.connect(p.id, 'c1');
      expect(joined.streams.last.number, 10);
      expect(joined.streams.last.signal, isFalse);
      final signal = added.connect('fic', p.id);
      expect(signal.streams.last.signal, isTrue);
      expect(signal.tableStreams.length, 9);
      expect(added.connect(p.id, p.id).streams.length, added.streams.length);
    });

    test('routes start and end on the units, are right-angled, and can be picked', () {
      final d = PfdDiagram.sample(PfdSample.ammonia);
      for (final s in d.streams) {
        final pts = d.path(s);
        expect(pts.length, greaterThanOrEqualTo(2));
        for (var i = 1; i < pts.length; i++) {
          final dx = (pts[i].dx - pts[i - 1].dx).abs(), dy = (pts[i].dy - pts[i - 1].dy).abs();
          expect(dx < 1e-6 || dy < 1e-6, isTrue, reason: 'stream ${s.number} leg $i');
        }
        if (d.unitById(s.from) case final u?) expect(u.rect.inflate(0.01).contains(pts.first), isTrue);
        if (d.unitById(s.to) case final u?) expect(u.rect.inflate(0.01).contains(pts.last), isTrue);
      }
      final s3 = d.streams.firstWhere((s) => s.number == 3);
      final pts = d.path(s3);
      expect(d.streamAt(Offset.lerp(pts.first, pts[1], 0.5)!)?.number, 3);
      expect(d.unitAt(d.unitById('r1')!.pos)?.id, 'r1');
      final moved = d.move('r1', const Offset(611, 289));
      expect(moved.unitById('r1')!.pos, const Offset(620, 280));
      final gone = d.removeUnit('r1');
      expect(gone.streams.any((s) => s.from == 'r1' || s.to == 'r1'), isFalse);
    });
  });

  group('EV', () {
    test('CC-CV: constant current until the voltage limit, then constant voltage and falling current', () {
      final c = ccCvCharge(socStart: 0.1, cRate: 1);
      expect(c.first.cRate, 1);
      expect(c.first.volts, lessThan(4.2));
      final cv = c.indexWhere((p) => p.cRate < 1);
      expect(cv, greaterThan(0));
      for (final p in c.take(cv)) {
        expect(p.cRate, 1);
        expect(p.volts, lessThanOrEqualTo(4.2 + 1e-9));
      }
      for (var i = cv; i < c.length; i++) {
        expect(c[i].volts, closeTo(4.2, 1e-9));
        if (i > cv) expect(c[i].cRate, lessThanOrEqualTo(c[i - 1].cRate + 1e-12));
      }
      for (var i = 1; i < c.length; i++) {
        expect(c[i].soc, greaterThanOrEqualTo(c[i - 1].soc));
      }
      expect(c.last.cRate, lessThanOrEqualTo(0.05));
      expect(c.last.soc, greaterThan(0.95));
      // At 1C, 10% → full takes longer than the 54 minutes of pure CC, CV adds a tail.
      expect(c.last.minutes, greaterThan(54));
      expect(cellOcv(0), closeTo(3.0, 1e-12));
      expect(cellOcv(1), closeTo(4.2, 1e-4));
    });

    test('charging panel: C-rate from charger power, capped by the BMS; faster with a DC charger', () {
      const ac = EvChargingPanel(packKwh: 30, chargerKw: 7.4, socStart: 0.2);
      expect(ac.cRate, closeTo(7.4 / 30, 1e-12));
      const dc = EvChargingPanel(view: EvChargeView.dc, packKwh: 30, chargerKw: 120, socStart: 0.2, maxC: 2);
      expect(dc.cRate, 2);
      expect(dc.minutesTo(0.8)!, lessThan(ac.minutesTo(0.8)!));
      expect(ac.minutesTo(0.8)!, closeTo(0.6 * 60 / ac.cRate, 10));
    });

    test('power flow: energy balance in every mode, losses never negative', () {
      for (final mode in EvMode.values) {
        final m = EvPowerFlow(mode: mode, speedKmh: 72, torqueNm: 80);
        final f = m.flow;
        for (final s in f.stages) {
          expect(s.input.abs(), greaterThanOrEqualTo(s.output.abs() - 1e-9), reason: '${mode.name} ${s.name}');
        }
        switch (mode) {
          case EvMode.driving:
            // Battery out = wheels + losses + auxiliaries.
            expect(f.battery, closeTo(f.wheels + m.losses + f.aux, 1e-6));
            expect(f.wheels, greaterThan(0));
            expect(m.motorRadS, closeTo(20 / 0.3 * 9, 1e-9));
          case EvMode.regen:
            // Braking power at the wheels = into the battery (net of aux) + losses.
            expect(-f.wheels, closeTo(-(f.battery - f.aux) + m.losses, 1e-6));
            expect(f.battery, lessThan(f.aux));
          case EvMode.charging:
            expect(f.grid, closeTo(-(f.battery) + f.aux + m.losses, 1e-6));
          case EvMode.idle:
            expect(f.battery, f.aux);
            expect(m.losses, 0);
        }
      }
    });

    test('range: Wh/km rises with speed, range falls; cruise torque balances the road load', () {
      const m = EvPowerFlow(packKwh: 30, massKg: 1500);
      expect(m.whPerKm(100), greaterThan(m.whPerKm(50)));
      expect(m.rangeKm(100), lessThan(m.rangeKm(50)));
      expect(m.rangeKm(60), inInclusiveRange(150, 400));
      final cruise = m.copyWith(torqueNm: m.cruiseTorque);
      expect(cruise.flow.wheels / (cruise.speedKmh / 3.6), closeTo(cruise.roadForce(cruise.speedKmh), 1e-6));
      expect(cruise.flow.battery, closeTo(cruise.cruiseBatteryW(cruise.speedKmh), 1e-6));
    });
  });

  test('every new panel saves, loads and paints', () {
    final panels = {
      KitKind.pfd: PfdDiagram.sample(PfdSample.distillation).toJson(),
      KitKind.unitOp: const UnitOpPanel().toJson(),
      KitKind.evCharging: const EvChargingPanel(view: EvChargeView.dc, chargerKw: 60).toJson(),
      KitKind.evPowerFlow: const EvPowerFlow(mode: EvMode.regen).toJson(),
    };
    for (final MapEntry(key: kind, value: data) in panels.entries) {
      final k = KitElement.sized(kind: kind, data: data, color: const Color(0xFF006B58));
      final back = decodeElement(jsonDecode(jsonEncode(encodeElement(k))) as Map<String, dynamic>, k.id)! as KitElement;
      expect(back.kind, kind);
      expect(jsonEncode(back.data), jsonEncode(k.data));
    }
    void paint(void Function(Canvas c) f) {
      final rec = ui.PictureRecorder();
      f(Canvas(rec));
      rec.endRecording().dispose();
    }

    for (final s in PfdSample.values) {
      paint((c) => paintPfd(c, PfdDiagram.sample(s), KitElement.naturalSizeOf(KitKind.pfd), Colors.teal, selectedUnit: 'c1', selectedStream: 0));
    }
    for (final op in UnitOp.values) {
      for (final r in [0.5, 1.65, 1e4]) {
        paint((c) => paintUnitOp(c, UnitOpPanel(op: op, mccabe: McCabeThiele(reflux: r), hx: HeatExchanger(counter: r > 1), reactors: ReactorCompare(tanks: r > 1 ? 3 : 1)), KitElement.naturalSizeOf(KitKind.unitOp), Colors.teal));
      }
    }
    for (final v in EvChargeView.values) {
      paint((c) => paintEvCharging(c, EvChargingPanel(view: v), KitElement.naturalSizeOf(KitKind.evCharging), Colors.green));
    }
    for (final mode in EvMode.values) {
      paint((c) => paintEvPowerFlow(c, EvPowerFlow(mode: mode), KitElement.naturalSizeOf(KitKind.evPowerFlow), Colors.green, phase: 0.3));
    }
  });
}

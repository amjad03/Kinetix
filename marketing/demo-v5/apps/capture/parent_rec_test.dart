// Parent App screen recordings (demo build data). One clip per run: CLIP=<id>.
// Copied into apps/parent/test/ by tools/capture_apps.sh, with zz_rec.dart, and deleted after.
import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:zynetix_lesson/zynetix_lesson.dart';
import 'package:zynetix_parent/app.dart';
import 'package:zynetix_parent/core/app_state.dart';
import 'package:zynetix_parent/core/models.dart';
import 'package:zynetix_parent/core/realtime.dart';
import 'package:zynetix_parent/core/token_store.dart';
import 'package:zynetix_parent/demo/demo.dart';
import 'package:zynetix_parent/demo/demo_api.dart';

import 'zz_rec.dart';

final clip = Platform.environment['CLIP'] ?? '';

Finder k(String key) => find.byKey(Key(key));

/// The demo backend, with times from the demo clock where the in-memory fake uses the wall
/// clock (today's board notice, a fee receipt, a sent message).
class _Api extends DemoParentApi {
  _Api({required DateTime Function() clock}) : _now = clock, super(clock: clock);
  final DateTime Function() _now;

  @override
  AppNotification boardNotice(String id, String whiteboardId) {
    final n = super.boardNotice(id, whiteboardId);
    return AppNotification(id: n.id, kind: n.kind, title: n.title, body: n.body, data: n.data, createdAt: _now().subtract(const Duration(minutes: 50)));
  }

  @override
  Future<FeeReceipt> confirmPayment(String paymentId, {required String providerPaymentId, required String signature}) async {
    await super.confirmPayment(paymentId, providerPaymentId: providerPaymentId, signature: signature);
    for (final list in feePayments.values) {
      final i = list.indexWhere((p) => p.id == paymentId);
      if (i >= 0) {
        final p = list[i];
        list[i] = FeePayment(id: p.id, invoiceId: p.invoiceId, amountPaise: p.amountPaise, method: p.method, receiptNo: p.receiptNo, paidAt: _now());
      }
    }
    return receipt(paymentId);
  }

  @override
  Future<ChatMessage> sendMessage(String conversationId, String body) async {
    await super.sendMessage(conversationId, body);
    final list = chats[conversationId]!;
    final m = list.removeLast();
    final fixed = ChatMessage(id: m.id, senderId: m.senderId, body: m.body, createdAt: _now());
    list.add(fixed);
    return fixed;
  }
}

/// Realtime like the demo's, but the teacher's reply arrives when the clip says so.
class _Realtime implements RealtimeConnection {
  _Realtime(this.api);
  final DemoParentApi api;
  final _signals = StreamController<RealtimeSignal>.broadcast();
  static _Realtime? last;

  @override
  Stream<RealtimeSignal> get signals => _signals.stream;

  @override
  void connect() => scheduleMicrotask(() {
    if (!_signals.isClosed) _signals.add(const RealtimeReady());
  });

  void reply() {
    api.replied = true;
    _signals.add(api.receiveReply());
  }

  @override
  void dispose() => _signals.close();
}

class ParentRig {
  ParentRig(this.t, this.r);
  final WidgetTester t;
  final Rec r;
  late _Api api;

  Future<void> boot() async {
    Demo.enabled = true;
    addTearDown(() => Demo.enabled = false);
    LessonAudio.debugFactory = (_, _, length) async => SilentLessonAudio(length, audible: true);
    addTearDown(() => LessonAudio.debugFactory = null);
    await loadAllFonts();
    phoneView(t);
    r.recording = false;
    r.startAt(11, 20);
    SharedPreferences.setMockInitialValues({});
    api = _Api(clock: r.now);
    final state = AppState(
      api,
      await SharedPreferences.getInstance(),
      tokens: MemoryTokenStore(),
      realtime: ({required String baseUrl, required String token}) => _Realtime.last = _Realtime(api),
    );
    await t.pumpWidget(r.wrap(ParentApp(state: state)));
    await state.restore();
    await r.skip(1);
  }

  Future<void> bootSignedIn() async {
    await boot();
    await t.tap(k('demoSignIn0'));
    await r.skip(2);
    r.recording = true;
  }

  Future<void> switchChild(String id, String name) async {
    await r.scrollTo(k('childCard'), top: 100, bottom: 400, up: true);
    await r.tap(k('childCard'), label: 'Switch child');
    await r.settle(min: 0.5);
    await r.hold(0.8);
    await r.tap(k('child-$id'), label: name);
    await r.settle(min: 0.6);
  }
}

void main() {
  testWidgets('parent_home', (t) async {
    final r = Rec(t, id: 'parent_home', title: 'Parent App: sign-in, Home, two children');
    final g = ParentRig(t, r);
    await g.boot();
    r.recording = true;
    r.mark('Sign-in screen (demo mode)');
    await r.hold(1.6);
    await r.tap(k('demoSignIn0'), label: 'Signs in as Rajesh Patel');
    await r.settle(min: 0.8);
    r.mark("Home: how Aarav is doing");
    await r.hold(2.4);
    await r.scroll(-330);
    await r.settle(min: 0.3);
    r.mark('Recent updates: homework, today\'s board, absence');
    await r.hold(2.2);
    await r.scroll(330);
    await r.settle(min: 0.3);
    await r.hold(0.4);
    await g.switchChild('c2', 'Diya Patel');
    r.mark("Diya's overview: 98% attendance");
    await r.hold(2.2);
    await r.tap(k('homeTab-academics'), label: 'Academics');
    await r.settle(min: 0.5);
    r.mark('Her homework and results');
    await r.hold(1.8);
    await r.finish();
  }, skip: clip != 'parent_home');

  testWidgets('parent_attendance', (t) async {
    final r = Rec(t, id: 'parent_attendance', title: 'Parent App: attendance');
    final g = ParentRig(t, r);
    await g.bootSignedIn();
    await r.hold(0.8);
    await r.tap(k('homeTab-attendance'), label: 'Attendance');
    await r.settle(min: 0.5);
    r.mark('88% in the last 30 days, recent absences');
    await r.hold(2);
    await r.scrollTo(find.text('See attendance history'), top: 300, bottom: 650);
    await r.hold(1.2);
    await r.tap(find.text('See attendance history'), label: 'Attendance history');
    await r.settle(min: 0.6);
    r.mark('Every class, day by day');
    await r.hold(2);
    await r.scroll(-350);
    await r.settle(min: 0.3);
    await r.hold(1.6);
    if (k('count-absent').evaluate().isNotEmpty) {
      await r.scroll(350);
      await r.settle(min: 0.3);
      await r.tap(k('count-absent'), label: 'Only absences');
      await r.settle(min: 0.5);
      r.mark('The missed classes');
      await r.hold(2.2);
    }
    await r.finish();
  }, skip: clip != 'parent_attendance');

  testWidgets('parent_fees', (t) async {
    final r = Rec(t, id: 'parent_fees', title: 'Parent App: fees, pay online, receipt');
    final g = ParentRig(t, r);
    await g.bootSignedIn();
    await r.hold(0.8);
    await r.tap(k('navFees'), label: 'Fees');
    await r.settle(min: 0.6);
    r.mark('₹34,350 due: exam fee overdue, tuition part-paid');
    await r.hold(2.2);
    await r.scroll(-280);
    await r.settle(min: 0.3);
    r.mark('₹10,000 of ₹42,500 paid; receipts');
    await r.hold(2);
    await r.scroll(280);
    await r.settle(min: 0.3);
    await r.tap(k('pay-i2'), label: 'Pay the overdue exam fee');
    await r.settle(min: 0.6);
    r.mark('Full or part amount');
    await r.hold(1.6);
    await r.tap(k('payContinue'), label: 'Pay ₹1,850');
    await r.settle(min: 0.6);
    r.mark('Payment gateway (demo)');
    await r.hold(1.8);
    await r.tap(k('demoPay'), label: 'Pay');
    await r.settle(min: 0.8);
    r.mark('Payment successful: receipt');
    await r.hold(2.4);
    await r.scroll(-200);
    await r.settle(min: 0.3);
    await r.hold(1.2);
    if (k('receiptDone').hitTestable().evaluate().isNotEmpty) {
      await r.tap(k('receiptDone'), label: 'Done');
      await r.settle(min: 0.6);
      r.mark('Exam fee paid; only tuition left');
      await r.hold(2.2);
    }
    await r.finish();
  }, skip: clip != 'parent_fees');

  testWidgets('parent_reports', (t) async {
    final r = Rec(t, id: 'parent_reports', title: "Parent App: results and Diya's overdue library book");
    final g = ParentRig(t, r);
    await g.bootSignedIn();
    await r.hold(0.6);
    await r.tap(k('homeTab-academics'), label: 'Academics');
    await r.settle(min: 0.5);
    await r.scrollTo(k('resultsCard'), top: 120, bottom: 720);
    r.mark("Aarav's results with class averages");
    await r.hold(1.6);
    await r.tap(k('assessment-a1'), label: 'Unit test 1');
    await r.settle(min: 0.6);
    r.mark("19/25 and the teacher's remark");
    await r.hold(2.2);
    await r.back();
    await r.settle(min: 0.5);
    await g.switchChild('c2', 'Diya Patel');
    await r.scrollTo(k('libraryCard'), top: 150, bottom: 720);
    r.mark('Diya: library book overdue, fine so far');
    await r.hold(2.6);
    await r.finish();
  }, skip: clip != 'parent_reports');

  testWidgets('parent_messages', (t) async {
    final r = Rec(t, id: 'parent_messages', title: 'Parent App: message the teacher, reply arrives live');
    final g = ParentRig(t, r);
    await g.bootSignedIn();
    await r.hold(0.8);
    await r.tap(k('navMore'), label: 'More');
    await r.settle(min: 0.5);
    await r.scrollTo(k('openMessages'), top: 150, bottom: 650, up: true);
    await r.tap(k('openMessages'), label: 'Messages');
    await r.settle(min: 0.5);
    await r.tap(k('thread-cv1'), label: 'Anita Sharma (class teacher)');
    await r.settle(min: 0.6);
    r.mark('Chat with the teacher');
    await r.hold(1.4);
    await r.tap(k('messageField'));
    await r.type(k('messageField'), 'Ma’am, did Aarav hand in Exercise 4.2?');
    await r.hold(0.3);
    await r.tap(k('sendMessage'), label: 'Send');
    await r.settle(min: 0.5, max: 1.5);
    await r.doneTyping();
    await r.settle(min: 0.3);
    await r.hold(1.8);
    _Realtime.last!.reply();
    await r.settle(min: 0.3);
    r.mark("Anita's reply arrives live");
    await r.hold(3);
    await r.finish();
  }, skip: clip != 'parent_messages');
}

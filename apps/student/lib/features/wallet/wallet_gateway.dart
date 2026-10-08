import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';
import 'package:razorpay_flutter/razorpay_flutter.dart';

import '../../core/campus_services.dart';
import '../../core/format.dart';
import '../../l10n/l10n.dart';

/// What happened in the gateway's checkout. Only [PaymentSucceeded] is confirmed with the server.
sealed class PaymentResult {
  const PaymentResult();
}

class PaymentSucceeded extends PaymentResult {
  const PaymentSucceeded({required this.providerPaymentId, required this.signature});

  final String providerPaymentId;

  /// HMAC-SHA256 of `orderId|providerPaymentId`; the server checks it.
  final String signature;
}

class PaymentCancelled extends PaymentResult {
  const PaymentCancelled();
}

/// The student chose a wallet app that finishes the payment outside the checkout; the gateway tells the server.
class PaymentInWallet extends PaymentResult {
  const PaymentInWallet(this.walletName);

  final String? walletName;
}

enum PaymentFailure { provider, noConfirmation, couldNotOpen, network, generic, unavailable }

class PaymentFailed extends PaymentResult {
  const PaymentFailed(this.message, {this.reason = PaymentFailure.provider});

  /// The gateway's own words (or an English fallback).
  final String message;
  final PaymentFailure reason;

  String describe(AppLocalizations l) => switch (reason) {
    PaymentFailure.provider => message,
    PaymentFailure.noConfirmation => l.walletFailNoConfirm,
    PaymentFailure.couldNotOpen => l.walletFailOpen,
    PaymentFailure.network => l.walletFailNetwork,
    PaymentFailure.generic => l.walletFailGeneric,
    PaymentFailure.unavailable => l.walletPhonesOnly,
  };
}

/// An online payment gateway's checkout on the device (the institution's Razorpay account, or the demo).
abstract class PaymentGateway {
  Future<PaymentResult> pay(BuildContext context, TopUpCheckout checkout);

  /// Tests replace the gateway.
  static PaymentGateway Function(String provider)? debugOverride;

  /// Razorpay's checkout SDK exists only for Android and iOS.
  static bool get razorpaySupported => !kIsWeb && (defaultTargetPlatform == TargetPlatform.android || defaultTargetPlatform == TargetPlatform.iOS);

  /// Whether this device can pay online with what the institution has set up ('razorpay', 'demo' or null).
  static bool available(String? mode) => switch (mode) {
    'demo' => true,
    'razorpay' => debugOverride != null || razorpaySupported,
    _ => false,
  };

  static String? unavailableReason(AppLocalizations l, String? mode) => available(mode) ? null : (mode == null ? l.walletNotSetUp : l.walletPhonesOnly);

  static PaymentGateway forProvider(String provider) {
    final override = debugOverride;
    if (override != null) return override(provider);
    return switch (provider) {
      'demo' => DemoPaymentGateway(),
      'razorpay' when razorpaySupported => RazorpayGateway(),
      _ => const _Unavailable(),
    };
  }
}

class _Unavailable implements PaymentGateway {
  const _Unavailable();

  @override
  Future<PaymentResult> pay(BuildContext context, TopUpCheckout checkout) async =>
      const PaymentFailed('Online payment works on Android phones and iPhones.', reason: PaymentFailure.unavailable);
}

/// Razorpay's standard checkout (UPI, cards, net banking, wallets) through `razorpay_flutter`.
class RazorpayGateway implements PaymentGateway {
  RazorpayGateway({Razorpay Function()? create}) : _create = create ?? Razorpay.new;

  final Razorpay Function() _create;

  static Map<String, dynamic> options(TopUpCheckout c) => {
    'key': c.keyId,
    'order_id': c.orderId,
    'amount': c.amountPaise,
    'currency': 'INR',
    'name': c.name,
    'description': c.description,
    'prefill': {
      if (c.prefillName.isNotEmpty) 'name': c.prefillName,
      if (c.prefillEmail.isNotEmpty) 'email': c.prefillEmail,
      if (c.prefillContact.isNotEmpty) 'contact': c.prefillContact,
    },
    'retry': {'enabled': true, 'max_count': 2},
  };

  @override
  Future<PaymentResult> pay(BuildContext context, TopUpCheckout checkout) {
    final razorpay = _create();
    final done = Completer<PaymentResult>();
    void finish(PaymentResult r) {
      if (!done.isCompleted) done.complete(r);
    }

    razorpay.on(Razorpay.EVENT_PAYMENT_SUCCESS, (PaymentSuccessResponse r) {
      final id = r.paymentId, signature = r.signature;
      finish(
        id == null || signature == null
            ? const PaymentFailed('No confirmation came back.', reason: PaymentFailure.noConfirmation)
            : PaymentSucceeded(providerPaymentId: id, signature: signature),
      );
    });
    razorpay.on(Razorpay.EVENT_PAYMENT_ERROR, (PaymentFailureResponse r) {
      finish(r.code == Razorpay.PAYMENT_CANCELLED ? const PaymentCancelled() : failure(r.code, r.message));
    });
    razorpay.on(Razorpay.EVENT_EXTERNAL_WALLET, (ExternalWalletResponse r) => finish(PaymentInWallet(r.walletName)));
    try {
      razorpay.open(options(checkout));
    } catch (_) {
      finish(const PaymentFailed("Couldn't open the payment screen.", reason: PaymentFailure.couldNotOpen));
    }
    return done.future.whenComplete(razorpay.clear);
  }

  /// Razorpay's failure message is often JSON ({"error": {"description": ...}}); show the description.
  static PaymentFailed failure(int? code, String? raw) {
    String? description;
    if (raw != null) {
      try {
        final j = jsonDecode(raw);
        if (j is Map && j['error'] is Map) description = (j['error'] as Map)['description'] as String?;
      } catch (_) {
        if (!raw.trimLeft().startsWith('{')) description = raw;
      }
    }
    if (code == Razorpay.NETWORK_ERROR) return const PaymentFailed('No internet connection.', reason: PaymentFailure.network);
    return description == null || description.isEmpty ? const PaymentFailed('The payment did not go through.', reason: PaymentFailure.generic) : PaymentFailed(description);
  }
}

/// Development and demos: the server's demo provider accepts payments signed with a known secret. No money moves.
class DemoPaymentGateway implements PaymentGateway {
  DemoPaymentGateway({this.secret = defaultSecret});

  /// DemoPaymentProvider.SECRET in services/api/src/fees/payment-provider.ts.
  static const defaultSecret = 'kinetix-demo-payments';
  final String secret;

  static String sign(String secret, String orderId, String paymentId) => Hmac(sha256, utf8.encode(secret)).convert(utf8.encode('$orderId|$paymentId')).toString();

  static String newPaymentId() {
    final r = Random();
    return 'pay_demo_${DateTime.now().microsecondsSinceEpoch.toRadixString(36)}${List.generate(8, (_) => r.nextInt(36).toRadixString(36)).join()}';
  }

  @override
  Future<PaymentResult> pay(BuildContext context, TopUpCheckout checkout) async {
    final ok = await showModalBottomSheet<bool>(context: context, showDragHandle: true, builder: (_) => _DemoSheet(checkout: checkout));
    if (ok != true) return const PaymentCancelled();
    final id = newPaymentId();
    return PaymentSucceeded(providerPaymentId: id, signature: sign(secret, checkout.orderId, id));
  }
}

class _DemoSheet extends StatelessWidget {
  const _DemoSheet({required this.checkout});

  final TopUpCheckout checkout;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final c = context.colors;
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(Kx.s24, 0, Kx.s24, Kx.s24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(l.walletDemo, style: context.text.headlineSmall),
            const SizedBox(height: Kx.s12),
            Container(
              key: const Key('demoBanner'),
              padding: const EdgeInsets.all(Kx.s12),
              decoration: BoxDecoration(color: c.tertiaryContainer, borderRadius: Kx.radiusMd),
              child: Text(l.walletDemoNoMoney, style: context.text.titleSmall?.copyWith(color: c.onTertiaryContainer)),
            ),
            const SizedBox(height: Kx.s16),
            Text(Fmt.rupees(checkout.amountPaise), key: const Key('demoAmount'), style: context.text.displaySmall),
            Text('${checkout.name} · ${checkout.description}', style: context.text.bodyMedium),
            const SizedBox(height: Kx.s24),
            FilledButton(
              key: const Key('demoPay'),
              onPressed: () => Navigator.pop(context, true),
              style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(Kx.target)),
              child: Text(l.walletDemoPay(Fmt.rupees(checkout.amountPaise))),
            ),
            TextButton(
              key: const Key('demoCancel'),
              onPressed: () => Navigator.pop(context, false),
              style: TextButton.styleFrom(minimumSize: const Size.fromHeight(Kx.target)),
              child: Text(l.cancel),
            ),
          ],
        ),
      ),
    );
  }
}

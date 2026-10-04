import 'dart:convert';
import 'dart:math';

import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/format.dart';
import '../../core/models.dart';
import '../../l10n/l10n.dart';
import 'razorpay_gateway.dart';

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

/// The parent closed the checkout.
class PaymentCancelled extends PaymentResult {
  const PaymentCancelled();
}

/// Why a payment failed, when the app words it itself (else [PaymentFailed.message] is shown).
enum PaymentFailure { provider, noConfirmation, couldNotOpen, network, generic, unavailable }

class PaymentFailed extends PaymentResult {
  const PaymentFailed(this.message, {this.reason = PaymentFailure.provider});

  /// The gateway's own words (or an English fallback).
  final String message;
  final PaymentFailure reason;

  /// In the app's language; the gateway's own description is shown as it sent it.
  String describe(AppLocalizations l) => switch (reason) {
    PaymentFailure.provider => message,
    PaymentFailure.noConfirmation => l.failNoConfirmation,
    PaymentFailure.couldNotOpen => l.failCouldNotOpen,
    PaymentFailure.network => l.failNetwork,
    PaymentFailure.generic => l.failGeneric,
    PaymentFailure.unavailable => l.paymentPhonesOnly,
  };
}

/// The parent chose a wallet app that finishes the payment outside the checkout. The gateway tells
/// the server (webhook) when it goes through.
class PaymentInWallet extends PaymentResult {
  const PaymentInWallet(this.walletName);

  final String? walletName;
}

/// An online payment gateway's checkout on the device.
abstract class PaymentGateway {
  /// Takes the payment that [checkout] describes.
  Future<PaymentResult> pay(BuildContext context, FeeCheckout checkout);

  /// Tests replace the gateway (e.g. a demo gateway with a wrong secret).
  static PaymentGateway Function(String provider)? debugOverride;

  /// Razorpay's checkout SDK exists only for Android and iOS. Desktop and web builds still compile
  /// (the plugin's Dart side is plain method-channel code) but never open it.
  static bool get razorpaySupported =>
      !kIsWeb && (defaultTargetPlatform == TargetPlatform.android || defaultTargetPlatform == TargetPlatform.iOS);

  /// Whether this device can pay online with what the institution has set up.
  static bool available(OnlinePayments? mode) => switch (mode) {
    null => false,
    OnlinePayments.demo => true,
    OnlinePayments.razorpay => debugOverride != null || razorpaySupported,
  };

  /// Why the parent can't pay online here, in plain words; null when they can.
  static String? unavailableReason(AppLocalizations l, OnlinePayments? mode) {
    if (available(mode)) return null;
    if (mode == null) return l.paymentNotSetUp;
    return l.paymentPhonesOnly;
  }

  static PaymentGateway forProvider(String provider) {
    final override = debugOverride;
    if (override != null) return override(provider);
    return switch (provider) {
      'demo' => DemoPaymentGateway(),
      'razorpay' when razorpaySupported => RazorpayGateway(),
      _ => const UnavailableGateway(),
    };
  }
}

class UnavailableGateway implements PaymentGateway {
  const UnavailableGateway();

  @override
  Future<PaymentResult> pay(BuildContext context, FeeCheckout checkout) async =>
      const PaymentFailed(
        'Online payment works in the KINETIX Parent app on Android phones and iPhones.',
        reason: PaymentFailure.unavailable,
      );
}

/// Development and demos: the server's demo provider makes up orders and accepts payments signed
/// with a known secret. The parent sees a plain confirm sheet that says no money moves.
class DemoPaymentGateway implements PaymentGateway {
  DemoPaymentGateway({this.secret = defaultSecret});

  /// DemoPaymentProvider.SECRET in services/api/src/fees/payment-provider.ts.
  static const defaultSecret = 'kinetix-demo-payments';
  final String secret;

  static String sign(String secret, String orderId, String paymentId) =>
      Hmac(sha256, utf8.encode(secret)).convert(utf8.encode('$orderId|$paymentId')).toString();

  static String newPaymentId() {
    final r = Random();
    final suffix = List.generate(8, (_) => r.nextInt(36).toRadixString(36)).join();
    return 'pay_demo_${DateTime.now().microsecondsSinceEpoch.toRadixString(36)}$suffix';
  }

  @override
  Future<PaymentResult> pay(BuildContext context, FeeCheckout checkout) async {
    final ok = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => DemoCheckoutSheet(checkout: checkout),
    );
    if (ok != true) return const PaymentCancelled();
    final id = newPaymentId();
    return PaymentSucceeded(providerPaymentId: id, signature: sign(secret, checkout.orderId, id));
  }
}

/// "Demo payment: no money moves", the amount, who it is paid to, and Pay / Cancel.
class DemoCheckoutSheet extends StatelessWidget {
  const DemoCheckoutSheet({super.key, required this.checkout});

  final FeeCheckout checkout;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final l = context.l10n;
    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(Kx.s24, 0, Kx.s24, Kx.s24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(l.demoPayment, style: context.text.headlineSmall),
            const SizedBox(height: Kx.s12),
            const DemoBanner(),
            const SizedBox(height: Kx.s24),
            Text(l.amount, style: context.text.labelLarge?.copyWith(color: c.onSurfaceVariant)),
            Text(
              Fmt.rupees(checkout.amountPaise),
              key: const Key('demoAmount'),
              style: context.text.displaySmall?.copyWith(fontWeight: FontWeight.w500),
            ),
            const SizedBox(height: Kx.s16),
            _Line(label: l.demoTo, value: checkout.name),
            _Line(label: l.demoFor, value: checkout.description),
            _Line(label: l.demoOrder, value: checkout.orderId),
            const SizedBox(height: Kx.s24),
            FilledButton(
              key: const Key('demoPay'),
              onPressed: () => Navigator.pop(context, true),
              style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(Kx.target)),
              child: Text(l.demoPayAmount(Fmt.rupees(checkout.amountPaise))),
            ),
            const SizedBox(height: Kx.s8),
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

/// The label every demo-mode payment screen carries.
class DemoBanner extends StatelessWidget {
  const DemoBanner({super.key});

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Container(
      key: const Key('demoBanner'),
      padding: const EdgeInsets.all(Kx.s12),
      decoration: BoxDecoration(color: c.tertiaryContainer, borderRadius: Kx.radiusMd),
      child: Row(
        children: [
          Icon(Icons.science_outlined, color: c.onTertiaryContainer),
          const SizedBox(width: Kx.s12),
          Expanded(
            child: Text(context.l10n.demoNoMoney, style: context.text.titleSmall?.copyWith(color: c.onTertiaryContainer)),
          ),
        ],
      ),
    );
  }
}

class _Line extends StatelessWidget {
  const _Line({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: Kx.s4),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 88,
          child: Text(label, style: context.text.bodyMedium?.copyWith(color: context.colors.onSurfaceVariant)),
        ),
        Expanded(child: Text(value, style: context.text.bodyLarge)),
      ],
    ),
  );
}

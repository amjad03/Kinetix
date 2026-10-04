import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:razorpay_flutter/razorpay_flutter.dart';

import '../../core/models.dart';
import 'payment_gateway.dart';

/// Razorpay's standard checkout (UPI, cards, net banking, wallets) through the official
/// `razorpay_flutter` plugin. Android and iOS only: [PaymentGateway.forProvider] never picks it
/// elsewhere, so desktop builds compile the plugin's Dart code but never call its channel.
class RazorpayGateway implements PaymentGateway {
  RazorpayGateway({Razorpay Function()? create}) : _create = create ?? Razorpay.new;

  final Razorpay Function() _create;

  /// Checkout options for an order the server created.
  static Map<String, dynamic> options(FeeCheckout c) => {
    'key': c.keyId,
    'order_id': c.orderId,
    'amount': c.amountPaise,
    'currency': c.currency,
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
  Future<PaymentResult> pay(BuildContext context, FeeCheckout checkout) {
    final razorpay = _create();
    final done = Completer<PaymentResult>();
    void finish(PaymentResult r) {
      if (!done.isCompleted) done.complete(r);
    }

    razorpay.on(Razorpay.EVENT_PAYMENT_SUCCESS, (PaymentSuccessResponse r) {
      final id = r.paymentId, signature = r.signature;
      finish(
        id == null || signature == null
            ? const PaymentFailed(
                'The payment app did not return a confirmation. If money left your account, the fee will update shortly.',
                reason: PaymentFailure.noConfirmation,
              )
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
      finish(const PaymentFailed("Couldn't open the payment screen. Try again.", reason: PaymentFailure.couldNotOpen));
    }
    return done.future.whenComplete(razorpay.clear);
  }

  /// Razorpay's failure message is often JSON ({"error": {"description": ...}}); show the
  /// description (in the gateway's words), or a plain sentence in the app's language.
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
    if (code == Razorpay.NETWORK_ERROR) {
      return const PaymentFailed('No internet connection. Check it and try again.', reason: PaymentFailure.network);
    }
    return description == null || description.isEmpty
        ? const PaymentFailed('The payment did not go through. Try again.', reason: PaymentFailure.generic)
        : PaymentFailed(description);
  }
}

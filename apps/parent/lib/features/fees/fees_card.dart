import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/family.dart';
import '../../core/format.dart';
import '../../core/models.dart';
import '../../l10n/l10n.dart';
import '../../widgets/common.dart';
import 'fees_screen.dart';
import 'payment_gateway.dart';

/// Home's fees card: how much is due, the next due date (overdue in red), "Pay" and "View fees".
class FeesCard extends StatelessWidget {
  const FeesCard({super.key, required this.family, required this.child, required this.today});

  final FamilyController family;
  final Child child;
  final DateTime today;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final l = context.l10n;
    final fees = family.feesOf(child.id);
    final error = family.feesErrorOf(child.id);
    void view() => FeesScreen.open(context, family, child);

    if (fees == null) {
      return SectionCard(
        key: const Key('feesCard'),
        icon: Icons.currency_rupee,
        title: l.fees,
        child: error != null ? ErrorBanner(error, onRetry: () => family.loadFees(child.id)) : const LinearProgressIndicator(),
      );
    }

    final open = fees.open;
    final next = fees.next;
    final overdue = open.where((i) => i.isOverdue(today)).toList();
    final canPay = PaymentGateway.available(fees.onlinePayments);
    final lastPayment = fees.payments.firstOrNull;

    final Widget body;
    if (fees.invoices.isEmpty) {
      body = Text(
        l.noFeesIssued(child.firstName),
        style: context.text.bodyLarge?.copyWith(color: c.onSurfaceVariant),
      );
    } else if (next == null) {
      body = Row(
        children: [
          IconBadge(Icons.check_rounded, background: Tone.goodContainer(context), foreground: Tone.good(context)),
          const SizedBox(width: Kx.s12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  l.allFeesPaid,
                  key: const Key('feesAllPaid'),
                  style: context.text.titleMedium?.copyWith(color: Tone.good(context)),
                ),
                if (lastPayment != null)
                  Text(
                    [
                      l.lastPaid(Fmt.rupees(lastPayment.amountPaise)),
                      if (lastPayment.paidAt != null) context.fmt.shortDay(lastPayment.paidAt!),
                    ].join(' · '),
                    style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant),
                  ),
              ],
            ),
          ),
        ],
      );
    } else {
      final first = overdue.firstOrNull ?? next;
      final (chip, bg, fg) = InvoiceCard.dueChip(context, first, today);
      body = Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Flexible(
                child: FittedBox(
                  fit: BoxFit.scaleDown,
                  alignment: Alignment.bottomLeft,
                  child: Text(
                    Fmt.rupees(fees.duePaise),
                    key: const Key('feesDue'),
                    style: context.text.displaySmall?.copyWith(
                      color: overdue.isEmpty ? c.onSurface : c.error,
                      fontWeight: FontWeight.w500,
                      height: 1,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: Kx.s8),
              Padding(
                padding: const EdgeInsets.only(bottom: 2),
                child: Text(l.dueSuffix, style: context.text.bodyLarge?.copyWith(color: c.onSurfaceVariant)),
              ),
            ],
          ),
          const SizedBox(height: Kx.s12),
          Text(first.title, style: context.text.titleSmall),
          const SizedBox(height: Kx.s4),
          Align(
            alignment: Alignment.centerLeft,
            child: Pill(
              chip,
              key: const Key('feesNextDue'),
              icon: overdue.isEmpty ? Icons.event_outlined : Icons.warning_amber_rounded,
              background: bg,
              foreground: fg,
            ),
          ),
          if (open.length > 1) ...[
            const SizedBox(height: Kx.s8),
            Text(
              [l.feesToPay(open.length), if (overdue.length > 1) l.nOverdue(overdue.length)].join(l.listSeparator),
              style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant),
            ),
          ],
          const SizedBox(height: Kx.s16),
          if (canPay)
            Row(
              children: [
                FilledButton.icon(
                  key: const Key('feesPay'),
                  onPressed: () => FeesScreen.open(context, family, child, payInvoiceId: first.id),
                  icon: const Icon(Icons.currency_rupee, size: 18),
                  label: Text(l.pay),
                ),
                const SizedBox(width: Kx.s8),
                TextButton(key: const Key('feesView'), onPressed: view, child: Text(l.viewFees)),
              ],
            )
          else ...[
            Text(
              l.payAtCounter,
              key: const Key('feesCounter'),
              style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant),
            ),
          ],
        ],
      );
    }

    return SectionCard(
      key: const Key('feesCard'),
      icon: Icons.currency_rupee,
      title: l.fees,
      onTap: view,
      footer: canPay && next != null ? null : CardLink(fees.payments.isEmpty ? l.viewFees : l.viewFeesReceipts, onTap: view),
      child: body,
    );
  }
}

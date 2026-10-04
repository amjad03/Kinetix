/** Invoice list filters (`?status=`). "Overdue" is due invoices past their date. */
export const INVOICE_FILTERS = ['due', 'overdue', 'paid', 'cancelled', 'all'] as const;
export type InvoiceFilter = (typeof INVOICE_FILTERS)[number];

export const INVOICE_FILTER_LABEL: Record<InvoiceFilter, string> = { due: 'Due', overdue: 'Overdue', paid: 'Paid', cancelled: 'Cancelled', all: 'All' };

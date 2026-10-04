/** Invoice list filters (`?status=`). "Overdue" is due invoices past their date. Labels: `fees.filter.*`. */
export const INVOICE_FILTERS = ['due', 'overdue', 'paid', 'cancelled', 'all'] as const;
export type InvoiceFilter = (typeof INVOICE_FILTERS)[number];

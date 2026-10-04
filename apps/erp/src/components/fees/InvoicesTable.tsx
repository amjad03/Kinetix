'use client';

import CheckCircleOutlined from '@mui/icons-material/CheckCircleOutlined';
import MoreVert from '@mui/icons-material/MoreVert';
import PrintOutlined from '@mui/icons-material/PrintOutlined';
import ReceiptLongOutlined from '@mui/icons-material/ReceiptLongOutlined';
import Search from '@mui/icons-material/Search';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Snackbar from '@mui/material/Snackbar';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import Link from 'next/link';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { cancelInvoice, invoicePayments, recordPayment, type RecordedPayment } from '@/app/(dashboard)/fees/actions';
import { TableFrame } from '@/components/DataTable';
import { EmptyState } from '@/components/States';
import { daysBetween, formatDate, formatDateTime } from '@/lib/dates';
import { formatRupees, METHOD_LABEL, paiseToInput, PAY_METHODS, REFERENCE_LABEL, rupeesToPaise, type CounterMethod } from '@/lib/money';
import type { FeeInvoice, StudentFees } from '@/lib/types';
import { ReceiptView } from './ReceiptView';

function StatusCell({ inv, today }: { inv: FeeInvoice; today: string }) {
  if (inv.status === 'paid')
    return <Chip size="small" label="Paid" sx={{ bgcolor: 'kx.successContainer', color: 'kx.onSuccessContainer' }} data-status="paid" />;
  if (inv.status === 'cancelled') return <Chip size="small" label="Cancelled" variant="outlined" sx={{ color: 'text.secondary' }} data-status="cancelled" />;
  const late = inv.dueOn < today;
  if (late) return <Chip size="small" label="Overdue" sx={{ bgcolor: 'm3.errorContainer', color: 'm3.onErrorContainer' }} data-status="overdue" />;
  return <Chip size="small" label={inv.paidPaise > 0 ? 'Part paid' : 'Due'} variant="outlined" data-status="due" />;
}

function DueCell({ inv, today }: { inv: FeeInvoice; today: string }) {
  const n = daysBetween(today, inv.dueOn);
  const open = inv.status === 'due';
  return (
    <Box>
      <Typography variant="body2" sx={{ whiteSpace: 'nowrap' }}>
        {formatDate(inv.dueOn, 'short')}
      </Typography>
      {open && (
        <Typography variant="caption" sx={{ color: n < 0 ? 'error.main' : 'text.secondary', whiteSpace: 'nowrap' }}>
          {n < 0 ? `${-n} day${n === -1 ? '' : 's'} late` : n === 0 ? 'Due today' : `In ${n} day${n === 1 ? '' : 's'}`}
        </Typography>
      )}
    </Box>
  );
}

export function InvoicesTable({ invoices, today, timeZone }: { invoices: FeeInvoice[]; today: string; timeZone: string }) {
  const [q, setQ] = useState('');
  const [paying, setPaying] = useState<FeeInvoice | null>(null);
  const [cancelling, setCancelling] = useState<FeeInvoice | null>(null);
  const [receipts, setReceipts] = useState<FeeInvoice | null>(null);
  const [menu, setMenu] = useState<{ el: HTMLElement; inv: FeeInvoice } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return invoices;
    return invoices.filter((i) => i.student.fullName.toLowerCase().includes(t) || (i.student.rollNo ?? '').toLowerCase().includes(t) || i.title.toLowerCase().includes(t));
  }, [invoices, q]);
  const balance = rows.reduce((s, i) => s + (i.status === 'due' ? i.amountPaise - i.paidPaise : 0), 0);

  return (
    <>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2, mb: 2 }}>
        <TextField
          size="small"
          placeholder="Search by student, roll number or fee"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          sx={{ flex: '1 1 260px', maxWidth: 420 }}
          slotProps={{
            input: { startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> },
            htmlInput: { 'aria-label': 'Search invoices' },
          }}
        />
        <Typography variant="body2" color="text.secondary" data-testid="invoice-count">
          {rows.length} invoice{rows.length === 1 ? '' : 's'}
          {balance > 0 && ` · ${formatRupees(balance)} due`}
        </Typography>
      </Box>

      {rows.length === 0 ? (
        <EmptyState dense icon={<ReceiptLongOutlined />} title={invoices.length ? 'No invoices match your search' : 'No invoices here'} testId="no-invoices">
          {invoices.length ? 'Try a different name or roll number.' : 'Try another status or class.'}
        </EmptyState>
      ) : (
        <TableFrame testId="invoices-table">
          <Table sx={{ minWidth: 900 }} size="small">
            <TableHead>
              <TableRow>
                <TableCell>Student</TableCell>
                <TableCell>Fee</TableCell>
                <TableCell align="right">Amount</TableCell>
                <TableCell align="right">Balance</TableCell>
                <TableCell>Due</TableCell>
                <TableCell>Status</TableCell>
                <TableCell aria-label="Actions" />
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((inv) => {
                const bal = inv.amountPaise - inv.paidPaise;
                return (
                  <TableRow key={inv.id} hover data-testid="invoice-row" sx={{ '& td': { py: 1.25 } }}>
                    <TableCell>
                      <Typography variant="subtitle2">{inv.student.fullName}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {[inv.student.rollNo, inv.className].filter(Boolean).join(' · ')}
                      </Typography>
                    </TableCell>
                    <TableCell>{inv.title}</TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                      {formatRupees(inv.amountPaise)}
                    </TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', color: inv.status === 'due' ? 'text.primary' : 'text.secondary' }}>
                      {inv.status === 'cancelled' ? '—' : formatRupees(Math.max(0, bal))}
                    </TableCell>
                    <TableCell>
                      <DueCell inv={inv} today={today} />
                    </TableCell>
                    <TableCell>
                      <StatusCell inv={inv} today={today} />
                    </TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap', pr: 1 }}>
                      {inv.status === 'due' && (
                        <Button size="small" variant="outlined" onClick={() => setPaying(inv)} sx={{ mr: 0.5 }}>
                          Record payment
                        </Button>
                      )}
                      {(inv.paidPaise > 0 || inv.status === 'due') && (
                        <IconButton size="small" aria-label={`More for ${inv.student.fullName}`} onClick={(e) => setMenu({ el: e.currentTarget, inv })} data-testid="invoice-menu">
                          <MoreVert fontSize="small" />
                        </IconButton>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableFrame>
      )}

      <Menu anchorEl={menu?.el} open={!!menu} onClose={() => setMenu(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
        {menu && menu.inv.paidPaise > 0 && (
          <MenuItem
            onClick={() => {
              setReceipts(menu.inv);
              setMenu(null);
            }}
          >
            Payments and receipts
          </MenuItem>
        )}
        {menu && menu.inv.status === 'due' && menu.inv.paidPaise === 0 && (
          <MenuItem
            onClick={() => {
              setCancelling(menu.inv);
              setMenu(null);
            }}
            sx={{ color: 'error.main' }}
          >
            Cancel invoice
          </MenuItem>
        )}
      </Menu>

      {paying && <PaymentDialog inv={paying} timeZone={timeZone} onClose={() => setPaying(null)} />}
      {cancelling && (
        <CancelDialog
          inv={cancelling}
          onClose={(done) => {
            setCancelling(null);
            if (done) setToast(`Cancelled ${cancelling.title} for ${cancelling.student.fullName}`);
          }}
        />
      )}
      {receipts && <ReceiptsDialog inv={receipts} timeZone={timeZone} onClose={() => setReceipts(null)} />}
      <Snackbar open={!!toast} autoHideDuration={5000} onClose={() => setToast(null)} message={toast} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }} />
    </>
  );
}

function PaymentDialog({ inv, timeZone, onClose }: { inv: FeeInvoice; timeZone: string; onClose: () => void }) {
  const balance = inv.amountPaise - inv.paidPaise;
  const [amount, setAmount] = useState(paiseToInput(balance));
  const [method, setMethod] = useState<CounterMethod>('cash');
  const [reference, setReference] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<RecordedPayment | null>(null);
  const [pending, start] = useTransition();

  const paise = rupeesToPaise(amount);
  const amountError = amount.trim() !== '' && (paise === null || paise < 100 || paise > balance);
  const needsRef = method !== 'cash';
  const ready = paise !== null && paise >= 100 && paise <= balance && (!needsRef || reference.trim() !== '');

  const submit = () => {
    if (!ready || paise === null) return;
    setError(null);
    start(async () => {
      const res = await recordPayment(inv.id, inv.student.id, { amountPaise: paise, method, reference });
      if (res.ok) setDone(res.data);
      else setError(res.error);
    });
  };

  if (done) {
    return (
      <Dialog open onClose={onClose} maxWidth="sm" fullWidth aria-labelledby="paid-title">
        <DialogTitle id="paid-title" sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <CheckCircleOutlined sx={{ color: 'kx.success' }} />
          Payment recorded
        </DialogTitle>
        <DialogContent>
          <Box sx={{ border: 1, borderColor: 'm3.outlineVariant', borderRadius: '12px', p: 2.5 }}>
            <ReceiptView r={done.receipt} timeZone={timeZone} />
          </Box>
          <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1.5 }}>
            The family has been notified in the KINETIX Parent app, where the receipt is also available.
          </Typography>
        </DialogContent>
        <DialogActions>
          {done.paymentId && (
            <Button component={Link} href={`/fees/receipts/${done.paymentId}`} target="_blank" startIcon={<PrintOutlined />}>
              Print receipt
            </Button>
          )}
          <Button variant="contained" onClick={onClose}>
            Done
          </Button>
        </DialogActions>
      </Dialog>
    );
  }

  return (
    <Dialog open onClose={pending ? undefined : onClose} maxWidth="xs" fullWidth aria-labelledby="pay-title">
      <Box
        component="form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <DialogTitle id="pay-title">Record a payment</DialogTitle>
        <DialogContent>
          <Box sx={{ mb: 2.5, p: 2, borderRadius: '12px', bgcolor: 'kx.tonal' }}>
            <Typography variant="subtitle2">{inv.student.fullName}</Typography>
            <Typography variant="body2" color="text.secondary">
              {inv.title} · {inv.className}
            </Typography>
            <Typography variant="body2" sx={{ mt: 0.5 }}>
              Balance due <strong>{formatRupees(balance)}</strong>
              {inv.paidPaise > 0 && ` of ${formatRupees(inv.amountPaise)}`}
            </Typography>
          </Box>
          <Stack spacing={2.5}>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField
              label="Amount received"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              autoFocus
              error={amountError}
              helperText={amountError ? (paise !== null && paise > balance ? 'That is more than the balance due' : 'Enter rupees, for example 42500') : paise && paise < balance ? `Part payment · ${formatRupees(balance - paise)} will remain due` : ' '}
              slotProps={{ input: { startAdornment: <InputAdornment position="start">₹</InputAdornment> }, htmlInput: { inputMode: 'decimal' } }}
            />
            <Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }} id="pay-method">
                Paid by
              </Typography>
              <ToggleButtonGroup exclusive value={method} onChange={(_, v: CounterMethod | null) => v && setMethod(v)} aria-labelledby="pay-method" size="small" sx={{ flexWrap: 'wrap' }}>
                {PAY_METHODS.map((m) => (
                  <ToggleButton key={m} value={m} sx={{ px: 1.75 }}>
                    {METHOD_LABEL[m]}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
            </Box>
            <TextField
              label={REFERENCE_LABEL[method]}
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              required={needsRef}
              slotProps={{ htmlInput: { maxLength: 100 } }}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={pending || !ready} startIcon={pending ? <CircularProgress size={16} color="inherit" /> : undefined}>
            Record payment
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}

function CancelDialog({ inv, onClose }: { inv: FeeInvoice; onClose: (done?: boolean) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <Dialog open onClose={pending ? undefined : () => onClose()} maxWidth="xs" fullWidth aria-labelledby="cancel-inv-title">
      <DialogTitle id="cancel-inv-title">Cancel this invoice?</DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <Typography variant="body2">
          {inv.title} ({formatRupees(inv.amountPaise)}) for <strong>{inv.student.fullName}</strong> will no longer be due. This cannot be undone; to bill again, issue a new fee.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => onClose()} disabled={pending}>
          Keep it
        </Button>
        <Button
          variant="contained"
          color="error"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await cancelInvoice(inv.id);
              if (res.ok) onClose(true);
              else setError(res.error);
            })
          }
        >
          Cancel invoice
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function ReceiptsDialog({ inv, timeZone, onClose }: { inv: FeeInvoice; timeZone: string; onClose: () => void }) {
  const [payments, setPayments] = useState<StudentFees['payments'] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    invoicePayments(inv.student.id, inv.id).then((res) => {
      if (!live) return;
      if (res.ok) setPayments(res.data);
      else setError(res.error);
    });
    return () => {
      live = false;
    };
  }, [inv.id, inv.student.id]);

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth aria-labelledby="receipts-title">
      <DialogTitle id="receipts-title">Payments and receipts</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          {inv.student.fullName} · {inv.title}
        </Typography>
        {error && <Alert severity="error">{error}</Alert>}
        {!payments && !error && <CircularProgress size={24} sx={{ display: 'block', mx: 'auto', my: 3 }} />}
        {payments && payments.length === 0 && <Typography variant="body2">No payments recorded yet.</Typography>}
        {payments && payments.length > 0 && (
          <List dense disablePadding>
            {payments.map((p) => (
              <ListItem
                key={p.id}
                disableGutters
                secondaryAction={
                  <Button component={Link} href={`/fees/receipts/${p.id}`} size="small" startIcon={<PrintOutlined />}>
                    Receipt
                  </Button>
                }
              >
                <ListItemText
                  primary={`${formatRupees(p.amountPaise)} · ${METHOD_LABEL[p.method] ?? p.method}`}
                  secondary={`${p.receiptNo ?? ''}${p.paidAt ? ` · ${formatDateTime(p.paidAt, timeZone)}` : ''}`}
                />
              </ListItem>
            ))}
          </List>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

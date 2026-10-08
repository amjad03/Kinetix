'use client';

import Add from '@mui/icons-material/Add';
import Button from '@mui/material/Button';
import { useRef, useState } from 'react';
import { addItem, markMeal, placeOrder, setItem, topUp } from '@/app/(dashboard)/canteen/actions';
import { ActionButton, Bar, FormDialog, Grid, Pill, useToast, type Field } from '@/components/ops/kit';
import { useI18n } from '@/i18n/client';
import { MEALS, newKey } from '@/lib/ops';
import { st } from '@/lib/ops-labels';
import type { CItem, CMeals } from '@/lib/ops';

type Dialog = 'item' | 'topup' | 'order' | 'meal' | { price: CItem };

export function CanteenDesk({ items, meals }: { items: CItem[]; meals: CMeals }) {
  const { t, fmt } = useI18n();
  const [dlg, setDlg] = useState<Dialog | null>(null);
  const [toast, toastNode] = useToast();
  // One key per opened dialog: pressing Save twice, or retrying after a timeout, charges once.
  const key = useRef('');
  const show = (d: Dialog) => {
    key.current = newKey();
    setDlg(d);
  };
  const done = (m?: string) => {
    setDlg(null);
    if (m) toast(m);
  };
  const studentId: Field = { name: 'studentId', label: t('ops.f.studentId'), kind: 'uuid', required: true };
  const available = items.filter((i) => i.available);

  return (
    <>
      <Bar>
        <Button variant="contained" startIcon={<Add />} onClick={() => setDlg('item')} sx={{ mt: 3 }}>{t('ca.addItem')}</Button>
        <Button variant="outlined" onClick={() => show('topup')} sx={{ mt: 3 }}>{t('ca.topUp')}</Button>
        <Button variant="outlined" onClick={() => show('order')} disabled={available.length === 0} sx={{ mt: 3 }}>{t('ca.order')}</Button>
        <Button variant="outlined" onClick={() => setDlg('meal')} sx={{ mt: 3 }}>{t('ca.markMeal')}</Button>
      </Bar>
      <Grid
        testId="ca-menu"
        empty={t('ca.noItems')}
        rows={items}
        cols={[
          { label: t('ops.f.name'), cell: (i) => i.name },
          { label: t('ca.price'), cell: (i) => fmt.rupees(i.pricePaise), num: true },
          { label: t('ops.f.status'), cell: (i) => <Pill label={i.available ? t('ca.onMenu') : t('ca.off')} /> },
          {
            label: '',
            cell: (i) => (
              <>
                <Button size="small" onClick={() => setDlg({ price: i })}>{t('ca.changePrice')}</Button>
                <ActionButton label={i.available ? t('ca.takeOff') : t('ca.putOn')} run={() => setItem(i.id, { available: !i.available })} onDone={toast} />
              </>
            ),
          },
        ]}
      />
      <Grid
        testId="ca-meals"
        empty={t('ca.noMeals')}
        rows={meals.meals}
        cols={[{ label: t('ca.mealsToday', { date: meals.date }), cell: (m) => st(t, m.meal) }, { label: t('ca.headcount'), cell: (m) => m.count, num: true }, { label: t('ops.f.student'), cell: (m) => m.students.map((x) => x.name).join(', ') || t('ops.none') }]}
      />
      {dlg === 'meal' && <FormDialog title={t('ca.markMeal')} onSubmit={markMeal} onClose={done} intro={undefined} fields={[{ name: 'meal', label: t('ca.meal'), kind: 'select', required: true, options: MEALS.map((m) => ({ value: m, label: st(t, m) })) }, { name: 'studentIds', label: t('ca.studentIds'), kind: 'multiline', required: true }]} />}
      {dlg === 'item' && <FormDialog title={t('ca.addItem')} onSubmit={addItem} onClose={done} fields={[{ name: 'name', label: t('ops.f.name'), required: true }, { name: 'price', label: t('ca.price'), kind: 'rupees', required: true }]} />}
      {dlg === 'topup' && <FormDialog title={t('ca.topUp')} onSubmit={(v) => topUp(v, key.current)} onClose={done} fields={[studentId, { name: 'amount', label: t('ops.f.amount'), kind: 'rupees', required: true }]} />}
      {dlg === 'order' && (
        <FormDialog
          title={t('ca.order')}
          onSubmit={(v) => placeOrder(v, key.current)}
          onClose={done}
          fields={[studentId, ...available.map((i): Field => ({ name: `q_${i.id}`, label: `${i.name} · ${fmt.rupees(i.pricePaise)}`, kind: 'number' }))]}
        />
      )}
      {dlg && typeof dlg === 'object' && <FormDialog title={dlg.price.name} onSubmit={(v) => setItem(dlg.price.id, { pricePaise: Number(v.price) })} onClose={done} fields={[{ name: 'price', label: t('ca.price'), kind: 'rupees', required: true, init: String(dlg.price.pricePaise / 100) }]} />}
      {toastNode}
    </>
  );
}

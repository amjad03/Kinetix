'use client';

import { CalendarSync, FileDown, FileUp, Undo2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';
import { arrangeSubstitutes, revokeLeave, uploadLeaveDocument } from '@/app/(dashboard)/hr/depth-actions';
import { Button } from '@/components/shadcn/button';
import { Dialog, FormField, TextInput, useToast } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { LeaveRequest } from '@/lib/hr-types';

type Arranged = { assigned: { date: string; subject: string; section: string; substitute: string }[]; uncovered: { date: string; subject: string; section: string }[] };

/** Leave record actions beyond the decision: the supporting document, substitutes for the classes, and HR withdrawing approved leave. */
export function LeaveExtras({ r, canManage, canRevoke }: { r: LeaveRequest; canManage: boolean; canRevoke: boolean }) {
  const { t, fmt } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const file = useRef<HTMLInputElement>(null);
  const [busy, start] = useTransition();
  const [revoking, setRevoking] = useState(false);
  const [reason, setReason] = useState('');
  const [arranged, setArranged] = useState<Arranged | null>(null);
  const live = r.status === 'pending' || r.status === 'recommended' || r.status === 'approved';

  const attach = (f: File) =>
    start(async () => {
      const form = new FormData();
      form.set('file', f);
      const res = await uploadLeaveDocument(r.id, form);
      if (file.current) file.current.value = '';
      if (!res.ok) return toast.error(res.error);
      toast.success(t('hk.uploaded'));
      router.refresh();
    });
  const arrange = () =>
    start(async () => {
      const res = await arrangeSubstitutes(r.id);
      if (!res.ok) return toast.error(res.error);
      setArranged(res.data);
      router.refresh();
    });
  const revoke = () =>
    start(async () => {
      const res = await revokeLeave(r.id, reason);
      if (!res.ok) return toast.error(res.error);
      setRevoking(false);
      toast.success(t('hk.leave.revoked'));
      router.refresh();
    });

  return (
    <div className="flex flex-wrap items-center gap-2">
      {r.hasDocument && (
        <Button asChild variant="outline" size="sm" className="h-9">
          <a href={`/api/download?kind=staff-leave-doc&id=${r.id}`} target="_blank" rel="noopener">
            <FileDown />
            {t('hk.link.document')}
          </a>
        </Button>
      )}
      {live && (
        <>
          <input ref={file} type="file" accept="application/pdf,image/jpeg,image/png" hidden aria-hidden onChange={(e) => e.target.files?.[0] && attach(e.target.files[0])} />
          <Button variant="outline" size="sm" className="h-9" disabled={busy} onClick={() => file.current?.click()}>
            <FileUp />
            {r.hasDocument ? t('hk.upload.replace') : t('hk.upload.document')}
          </Button>
        </>
      )}
      {r.status === 'approved' && canManage && (
        <>
          <Button variant="outline" size="sm" className="h-9" disabled={busy} onClick={arrange}>
            <CalendarSync />
            {t('rk.action.leave-requests.arrange')}
          </Button>
          {canRevoke && (
            <Button variant="outline" size="sm" className="h-9" disabled={busy} onClick={() => setRevoking(true)}>
              <Undo2 />
              {t('rk.action.leave-requests.revoke')}
            </Button>
          )}
        </>
      )}
      {revoking && (
        <Dialog
          title={t('rk.action.leave-requests.revoke')}
          onClose={() => setRevoking(false)}
          busy={busy}
          actions={
            <>
              <Button variant="outline" onClick={() => setRevoking(false)} disabled={busy}>
                {t('common.cancel')}
              </Button>
              <Button variant="destructive" onClick={revoke} disabled={busy || reason.trim().length < 3}>
                {t('rk.action.leave-requests.revoke')}
              </Button>
            </>
          }
        >
          <div className="grid gap-3">
            <p className="m-0 text-[13px] text-muted-foreground">{t('hk.help.revoke')}</p>
            <FormField label={t('hk.param.reason')} required>
              <TextInput value={reason} onChange={(e) => setReason(e.target.value)} multiline minRows={2} />
            </FormField>
          </div>
        </Dialog>
      )}
      {arranged && (
        <Dialog title={t('rk.action.leave-requests.arrange')} size="md" onClose={() => setArranged(null)} actions={<Button onClick={() => setArranged(null)}>{t('common.close')}</Button>}>
          <div className="grid gap-3 text-[14px]">
            <p className="m-0" role="status">
              {t('hk.leave.arranged', { n: arranged.assigned.length, m: arranged.uncovered.length })}
            </p>
            {arranged.assigned.length > 0 && (
              <ul className="m-0 grid gap-1 pl-5">
                {arranged.assigned.map((a) => (
                  <li key={`${a.date}-${a.section}-${a.subject}`}>
                    {fmt.date(a.date, 'short')} · {a.section} · {a.subject} → <b>{a.substitute}</b>
                  </li>
                ))}
              </ul>
            )}
            {arranged.uncovered.length > 0 && (
              <>
                <p className="m-0 font-semibold">{t('hk.leave.uncovered')}</p>
                <ul className="m-0 grid gap-1 pl-5">
                  {arranged.uncovered.map((a) => (
                    <li key={`${a.date}-${a.section}-${a.subject}`}>
                      {fmt.date(a.date, 'short')} · {a.section} · {a.subject}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </Dialog>
      )}
    </div>
  );
}

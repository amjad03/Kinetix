'use client';
import Link from 'next/link';
import { useEffect, useState, useTransition, type ReactNode } from 'react';
import { ArrowUpRight, FileText, Send } from 'lucide-react';
import { sendFeeReminders, sheetAttendance, sheetDocuments, sheetFees, sheetMarks, sheetOverview, type SheetAttendance, type SheetDocuments, type SheetFees, type SheetMarks, type SheetOverview } from '@/app/(dashboard)/students/sheet-actions';
import { StatusPill } from '@/components/admissions/Chips';
import { Avatar, AvatarFallback } from '@/components/shadcn/avatar';
import { Badge } from '@/components/shadcn/badge';
import { Button } from '@/components/shadcn/button';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/shadcn/sheet';
import { Skeleton } from '@/components/shadcn/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/shadcn/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/shadcn/tabs';
import { useToast } from '@/components/ui/Toast';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import type { ActionResult } from '@/lib/types';
import { formatDate, formatDateTime } from '@/lib/dates';
import { initials, type RosterRow } from '@/lib/roster';
import { LifecycleTimeline } from './LifecycleTimeline';
import { AttendanceBar, FeeBadge } from './RosterBits';

type Tab = 'overview' | 'attendance' | 'marks' | 'fees' | 'documents' | 'timeline';
const TABS: Tab[] = ['overview', 'attendance', 'marks', 'fees', 'documents', 'timeline'];
type Loaded = { overview?: ActionResult<SheetOverview>; attendance?: ActionResult<SheetAttendance>; marks?: ActionResult<SheetMarks>; fees?: ActionResult<SheetFees>; documents?: ActionResult<SheetDocuments> };

/** A student's profile in a side sheet: each tab loads its data from the API the first time it is opened. */
export function StudentSheet({ row, onClose, canRemind, showFees, showAttendance }: { row: RosterRow; onClose: () => void; canRemind: boolean; showFees: boolean; showAttendance: boolean }) {
  const { t, locale, fmt } = useI18n();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('overview');
  const [data, setData] = useState<Loaded>({});
  const [, start] = useTransition();

  const fetchTab = (k: Tab, overview = data.overview) => {
    if (k === 'timeline' || data[k as keyof Loaded]) return;
    start(async () => {
      let res: Loaded[keyof Loaded];
      if (k === 'overview') res = await sheetOverview(row.id);
      else if (k === 'attendance') res = await sheetAttendance(row.id, row.sectionId);
      else if (k === 'marks') res = await sheetMarks(row.id);
      else if (k === 'fees') res = await sheetFees(row.id);
      else {
        const app = overview?.ok ? overview.data.profile.application : null;
        res = app ? await sheetDocuments(app.id) : { ok: true, data: { docs: [] } };
      }
      setData((d) => ({ ...d, [k]: res }));
    });
  };
  // The overview (profile and timeline) is what the sheet opens on.
  useEffect(() => {
    let live = true;
    void sheetOverview(row.id).then((res) => live && setData((d) => ({ ...d, overview: res })));
    return () => {
      live = false;
    };
  }, [row.id]);

  const profile = data.overview?.ok ? data.overview.data.profile : null;
  const remind = () =>
    start(async () => {
      const res = await sendFeeReminders([row.id]);
      if (!res.ok) toast.error(res.error);
      else toast.success(res.data.reminded ? t('ro.reminded', { n: res.data.reminded }) : t('ro.remindNone'));
    });

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full gap-0 sm:max-w-[560px]" data-testid="student-sheet">
        <SheetHeader className="flex-row items-start gap-3 border-b pb-4">
          <Avatar className="size-12">
            <AvatarFallback className="bg-teal-soft text-[15px] font-semibold text-teal-ink">{initials(row.fullName)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <SheetTitle className="text-lg">{row.fullName}</SheetTitle>
            <SheetDescription className="mt-0.5">
              {row.rollNo} · {row.className}
            </SheetDescription>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <StatusPill kind="student" status={row.status} />
              {showFees && row.fee && row.fee !== 'none' && (
                <Badge variant={row.fee === 'paid' ? 'green' : row.fee === 'overdue' ? 'red' : 'amber'}>
                  {t('ro.col.fees')}: {t(`ro.fee.${row.fee}` as MessageKey)}
                </Badge>
              )}
              {showAttendance && row.attendancePct !== null && row.attendancePct < 75 && <Badge variant="amber">{t('ro.shortage')}</Badge>}
            </div>
          </div>
        </SheetHeader>
        <Tabs
          value={tab}
          onValueChange={(v) => {
            setTab(v as Tab);
            fetchTab(v as Tab);
          }}
          className="min-h-0 flex-1 gap-0"
        >
          <div className="overflow-x-auto border-b px-4">
            <TabsList variant="line" className="h-10">
              {TABS.filter((k) => (k !== 'fees' || showFees) && (k !== 'attendance' || showAttendance)).map((k) => (
                <TabsTrigger key={k} value={k} data-testid={`sheet-tab-${k}`}>
                  {t(`ro.tab.${k}` as MessageKey)}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <TabsContent value="overview">
              <Result res={data.overview}>
                {(o) => (
                  <>
                    <div className="mb-4 grid grid-cols-2 gap-2.5">
                      <Kpi label={t('ro.k.attendance')}>{showAttendance ? <AttendanceBar pct={row.attendancePct} /> : '—'}</Kpi>
                      <Kpi label={t('ro.k.fees')}>{showFees ? <FeeBadge state={row.fee} /> : '—'}</Kpi>
                      <Kpi label={t('ro.k.cgpa')}>{o.cgpa !== null ? o.cgpa.toFixed(2) : '—'}</Kpi>
                      <Kpi label={t('ro.k.due')}>{showFees ? fmt.rupees(row.duePaise) : '—'}</Kpi>
                    </div>
                    <dl className="grid grid-cols-[minmax(0,40%)_1fr] gap-x-3 gap-y-2 text-[13px]">
                      <Kv k={t('ro.kv.roll')} v={o.profile.rollNo} />
                      <Kv k={t('ro.kv.programme')} v={o.profile.program.name} />
                      <Kv k={t('ro.kv.class')} v={o.profile.section.displayName} />
                      <Kv k={t('ro.kv.joined')} v={o.profile.enrolledOn ? formatDate(o.profile.enrolledOn, 'long', locale) : '—'} />
                      {o.profile.guardians[0] && (
                        <>
                          <Kv k={t('ro.kv.guardian')} v={`${o.profile.guardians[0].fullName} (${o.profile.guardians[0].relation})`} />
                          <Kv k={t('ro.kv.phone')} v={o.profile.guardians[0].phone ?? '—'} />
                        </>
                      )}
                    </dl>
                  </>
                )}
              </Result>
            </TabsContent>
            <TabsContent value="attendance">
              <Result res={data.attendance}>
                {(a) =>
                  a.rows.length === 0 ? (
                    <Empty>{t('ro.att.none')}</Empty>
                  ) : (
                    <>
                      <p className="mt-0 mb-3 text-[13px] text-muted-foreground">{t('ro.att.hint', { p: a.thresholdPct })}</p>
                      <ul className="m-0 grid grid-cols-1 list-none gap-2.5 p-0">
                        {a.rows.map((r) => (
                          <li key={r.subject} className="flex items-center justify-between gap-3 text-[13px]">
                            <span className="min-w-0 truncate">{r.subject}</span>
                            <AttendanceBar pct={r.effectivePct ?? r.pct} min={a.thresholdPct} />
                          </li>
                        ))}
                      </ul>
                    </>
                  )
                }
              </Result>
            </TabsContent>
            <TabsContent value="marks">
              <Result res={data.marks}>
                {(m) =>
                  m.assessments.length === 0 ? (
                    <Empty>{t('ro.marks.none')}</Empty>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t('ro.marks.col.test')}</TableHead>
                          <TableHead className="text-right">{t('ro.marks.col.score')}</TableHead>
                          <TableHead className="hidden text-right sm:table-cell">{t('ro.marks.col.avg')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {m.assessments.map((a) => (
                          <TableRow key={a.id}>
                            <TableCell className="whitespace-normal">
                              <b className="block font-[550]">{a.title}</b>
                              <small className="text-muted-foreground">{a.subject}</small>
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{a.absent ? <Badge variant="slate">{t('ro.marks.absent')}</Badge> : a.marks === null ? '—' : `${a.marks}/${a.maxMarks}`}</TableCell>
                            <TableCell className="hidden text-right tabular-nums text-muted-foreground sm:table-cell">{a.classAverage ?? '—'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )
                }
              </Result>
            </TabsContent>
            <TabsContent value="fees">
              <Result res={data.fees}>
                {(f) => {
                  const billed = f.invoices.reduce((s, i) => s + i.amountPaise, 0);
                  const paid = f.invoices.reduce((s, i) => s + i.paidPaise, 0);
                  if (f.invoices.length === 0) return <Empty>{t('ro.fees.none')}</Empty>;
                  return (
                    <>
                      <div className="mb-4 rounded-lg border bg-muted/40 p-3">
                        <div className="flex items-center justify-between text-[13px]">
                          <span className="text-muted-foreground">{t('ro.fees.paidOf', { paid: fmt.rupees(paid), billed: fmt.rupees(billed) })}</span>
                          <b>{f.duePaise > 0 ? t('ro.fees.dueAmt', { amount: fmt.rupees(f.duePaise) }) : t('ro.fees.fullyPaid')}</b>
                        </div>
                        <span aria-hidden className="mt-2 block h-2 overflow-hidden rounded-full bg-muted">
                          <i className="block h-full rounded-full bg-teal" style={{ width: `${billed ? (paid / billed) * 100 : 0}%` }} />
                        </span>
                      </div>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>{t('ro.fees.col.item')}</TableHead>
                            <TableHead className="hidden sm:table-cell">{t('ro.fees.col.dueOn')}</TableHead>
                            <TableHead className="text-right">{t('ro.fees.col.amount')}</TableHead>
                            <TableHead>{t('ro.fees.col.status')}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {f.invoices.map((i) => (
                            <TableRow key={i.id}>
                              <TableCell className="whitespace-normal">{i.title}</TableCell>
                              <TableCell className="hidden sm:table-cell">{formatDate(i.dueOn, 'short', locale)}</TableCell>
                              <TableCell className="text-right tabular-nums">{fmt.rupees(i.amountPaise)}</TableCell>
                              <TableCell>
                                <Badge variant={i.status === 'paid' ? 'green' : i.paidPaise > 0 ? 'blue' : 'amber'}>{t(i.status === 'paid' ? 'ro.fee.paid' : i.paidPaise > 0 ? 'ro.fee.partial' : 'ro.fee.due')}</Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                      {f.payments.length > 0 && (
                        <>
                          <h3 className="mt-5 mb-2 text-[13px] font-semibold">{t('ro.fees.payments')}</h3>
                          <ul className="m-0 grid grid-cols-1 list-none gap-1.5 p-0 text-[13px]">
                            {f.payments.map((p) => (
                              <li key={p.id} className="flex items-center justify-between gap-2">
                                <Link href={`/fees/receipts/${p.id}`} className="text-teal-ink hover:underline">
                                  {p.receiptNo ?? p.title}
                                </Link>
                                <span className="text-muted-foreground">{p.paidAt ? formatDateTime(p.paidAt, undefined, false, locale) : ''}</span>
                                <b className="tabular-nums">{fmt.rupees(p.amountPaise)}</b>
                              </li>
                            ))}
                          </ul>
                        </>
                      )}
                    </>
                  );
                }}
              </Result>
            </TabsContent>
            <TabsContent value="documents">
              <Result res={data.documents}>
                {(d) =>
                  d.docs.length === 0 ? (
                    <Empty>{t('ro.docs.none')}</Empty>
                  ) : (
                    <ul className="m-0 grid grid-cols-1 list-none gap-2 p-0">
                      {d.docs.map((doc) => (
                        <li key={doc.key} className="flex items-center gap-3 rounded-lg border p-2.5 text-[13px]">
                          <span className="grid size-8 place-items-center rounded-md bg-muted text-muted-foreground">
                            <FileText className="size-4" />
                          </span>
                          <b className="flex-1 font-[550]">{doc.label}</b>
                          <Badge variant={doc.status === 'verified' ? 'green' : doc.status === 'rejected' ? 'red' : doc.status === 'pending' ? 'amber' : 'slate'}>{t(`ro.docs.${doc.status}` as MessageKey)}</Badge>
                        </li>
                      ))}
                    </ul>
                  )
                }
              </Result>
            </TabsContent>
            <TabsContent value="timeline">{profile ? profile.timeline.length ? <LifecycleTimeline events={profile.timeline} /> : <Empty>{t('ro.timeline.none')}</Empty> : <Loading />}</TabsContent>
          </div>
        </Tabs>
        <SheetFooter className="flex-row justify-end gap-2 border-t">
          {canRemind && row.duePaise > 0 && (
            <Button variant="outline" size="sm" onClick={remind}>
              <Send />
              {t('ro.remind')}
            </Button>
          )}
          <Button asChild size="sm">
            <Link href={`/students/${row.id}`}>
              {t('ro.fullProfile')}
              <ArrowUpRight />
            </Link>
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function Result<T>({ res, children }: { res: ActionResult<T> | undefined; children: (d: T) => ReactNode }) {
  const { t } = useI18n();
  if (!res) return <Loading />;
  if (!res.ok) return <Empty>{res.error || t('ro.loadFailed')}</Empty>;
  return <>{children(res.data)}</>;
}

function Loading() {
  return (
    <div className="grid gap-2.5" aria-busy>
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-4 w-1/2" />
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="m-0 rounded-lg border border-dashed p-6 text-center text-[13px] text-muted-foreground">{children}</p>;
}

function Kpi({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border p-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="mt-1 text-[18px] font-[650]">{children}</div>
    </div>
  );
}

function Kv({ k, v }: { k: string; v: string }) {
  return (
    <>
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="m-0 min-w-0 break-words">{v}</dd>
    </>
  );
}

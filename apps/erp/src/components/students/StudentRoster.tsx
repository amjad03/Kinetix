'use client';
import Link from 'next/link';
import { useMemo, useState, useTransition, type KeyboardEvent } from 'react';
import { ChevronLeft, ChevronRight, Download, Eye, MoreHorizontal, ReceiptText, Search, Send, SearchX, UserRound, X } from 'lucide-react';
import { sendFeeReminders } from '@/app/(dashboard)/students/sheet-actions';
import { StatusPill } from '@/components/admissions/Chips';
import { Avatar, AvatarFallback } from '@/components/shadcn/avatar';
import { Button } from '@/components/shadcn/button';
import { Checkbox } from '@/components/shadcn/checkbox';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/shadcn/dropdown-menu';
import { Input } from '@/components/shadcn/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/shadcn/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/shadcn/table';
import { useToast } from '@/components/ui/Toast';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { STUDENT_STATUSES } from '@/lib/admissions';
import { FEE_STATES, initials, type RosterRow } from '@/lib/roster';
import { AttendanceBar, FeeBadge } from './RosterBits';
import { StudentSheet } from './StudentSheet';
import { naturalCompare } from '@/lib/natural';

const PER_PAGE = 25;
const ALL = '_all';
type Filters = { prog: string; sem: string; sec: string; status: string; fee: string };
const EMPTY: Filters = { prog: ALL, sem: ALL, sec: ALL, status: ALL, fee: ALL };

export function StudentRoster({ rows, initialQuery = '', canRemind, showFees, showAttendance }: { rows: RosterRow[]; initialQuery?: string; canRemind: boolean; showFees: boolean; showAttendance: boolean }) {
  const { t } = useI18n();
  const toast = useToast();
  const [q, setQ] = useState(initialQuery);
  const [f, setF] = useState<Filters>(EMPTY);
  const [page, setPage] = useState(1);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<RosterRow | null>(null);
  const [pending, start] = useTransition();

  const programs = useMemo(() => [...new Map(rows.filter((r) => r.programId).map((r) => [r.programId!, r.programName])).entries()].sort((a, b) => naturalCompare(a[1], b[1])), [rows]);
  const inProg = useMemo(() => rows.filter((r) => f.prog === ALL || r.programId === f.prog), [rows, f.prog]);
  const terms = useMemo(() => [...new Set(inProg.map((r) => r.term).filter((x): x is number => x !== null))].sort((a, b) => a - b), [inProg]);
  const sections = useMemo(() => [...new Map(inProg.filter((r) => f.sem === ALL || String(r.term) === f.sem).map((r) => [r.sectionId, r.className])).entries()].sort((a, b) => naturalCompare(a[1], b[1])), [inProg, f.sem]);
  const statuses = useMemo(() => STUDENT_STATUSES.filter((s) => s !== 'applicant' && rows.some((r) => r.status === s)), [rows]);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return inProg.filter(
      (r) =>
        (!s || r.fullName.toLowerCase().includes(s) || r.rollNo.toLowerCase().includes(s)) &&
        (f.sem === ALL || String(r.term) === f.sem) &&
        (f.sec === ALL || r.sectionId === f.sec) &&
        (f.status === ALL || r.status === f.status) &&
        (f.fee === ALL || r.fee === f.fee),
    );
  }, [inProg, q, f]);
  const pages = Math.max(1, Math.ceil(list.length / PER_PAGE));
  const cur = Math.min(page, pages);
  const shown = list.slice((cur - 1) * PER_PAGE, cur * PER_PAGE);
  const allOnPage = shown.length > 0 && shown.every((r) => sel.has(r.id));
  const filtered = q.trim() !== '' || Object.values(f).some((v) => v !== ALL);

  const setFilter = (k: keyof Filters, v: string) => {
    setF((o) => ({ ...o, [k]: v, ...(k === 'prog' ? { sem: ALL, sec: ALL } : k === 'sem' ? { sec: ALL } : {}) }));
    setPage(1);
  };
  const clear = () => {
    setF(EMPTY);
    setQ('');
    setPage(1);
  };
  const toggle = (id: string, on: boolean) =>
    setSel((s) => {
      const n = new Set(s);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });
  const togglePage = (on: boolean) =>
    setSel((s) => {
      const n = new Set(s);
      for (const r of shown) {
        if (on) n.add(r.id);
        else n.delete(r.id);
      }
      return n;
    });

  const remind = (ids: string[]) =>
    start(async () => {
      const res = await sendFeeReminders(ids);
      if (!res.ok) toast.error(res.error);
      else if (res.data.reminded === 0) toast.info(t('ro.remindNone'));
      else toast.success(t('ro.reminded', { n: res.data.reminded }));
    });

  const exportCsv = () => {
    const pick = rows.filter((r) => sel.has(r.id));
    const esc = (v: string | number | null) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const head = [t('ro.col.student'), t('ro.col.roll'), t('ro.col.programme'), t('ro.f.semester'), t('ro.f.section'), t('ro.col.attendance'), t('ro.col.fees'), t('ro.col.status')];
    const body = pick.map((r) => [r.fullName, r.rollNo, r.programName, r.term, r.className, r.attendancePct, r.fee ? t(`ro.fee.${r.fee}` as MessageKey) : '', t(`adm.stu.${r.status}` as MessageKey)].map(esc).join(','));
    const url = URL.createObjectURL(new Blob([`﻿${[head.map(esc).join(','), ...body].join('\n')}`], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'students.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const onRowKey = (e: KeyboardEvent, r: RosterRow) => {
    if (e.key === 'Enter' && e.target === e.currentTarget) setOpen(r);
  };

  const sel_ = (k: keyof Filters, label: string, opts: [string, string][], testId: string) => (
    <Select value={f[k]} onValueChange={(v) => setFilter(k, v)}>
      <SelectTrigger size="sm" aria-label={label} data-testid={testId} className="h-9 min-w-[130px] bg-card">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{t('ro.f.all', { label })}</SelectItem>
        {opts.map(([v, l]) => (
          <SelectItem key={v} value={v}>
            {l}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <section className="rounded-lg border bg-card shadow-card" data-testid="students-roster">
      <div className="flex flex-wrap items-center gap-2 border-b p-3">
        <label className="relative flex min-w-[220px] flex-1 items-center sm:max-w-[300px]">
          <Search aria-hidden className="pointer-events-none absolute left-2.5 size-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder={t('ro.search')}
            aria-label={t('ro.search')}
            className="h-9 pl-8"
            data-testid="students-search"
          />
        </label>
        {sel_('prog', t('ro.f.programme'), programs, 'f-programme')}
        {sel_('sem', t('ro.f.semester'), terms.map((n) => [String(n), t('ro.f.sem', { n })]), 'f-semester')}
        {sel_('sec', t('ro.f.section'), sections, 'f-section')}
        {sel_('status', t('ro.f.status'), statuses.map((s) => [s, t(`adm.stu.${s}` as MessageKey)]), 'f-status')}
        {showFees && sel_('fee', t('ro.f.fees'), FEE_STATES.map((s) => [s, t(`ro.fee.${s}` as MessageKey)]), 'f-fees')}
        {filtered && (
          <Button variant="ghost" size="sm" onClick={clear}>
            {t('ro.clear')}
          </Button>
        )}
      </div>

      {sel.size > 0 && (
        <div role="region" aria-label={t('ro.selected', { n: sel.size })} className="flex flex-wrap items-center gap-2 border-b bg-teal-soft/60 px-3 py-2" data-testid="students-bulk">
          <b className="mr-1 text-[13px]">{t('ro.selected', { n: sel.size })}</b>
          {canRemind && (
            <Button size="sm" variant="outline" disabled={pending} onClick={() => remind([...sel])}>
              <Send />
              {t('ro.remind')}
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={exportCsv}>
            <Download />
            {t('ro.export')}
          </Button>
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setSel(new Set())}>
            <X />
            {t('ro.clear')}
          </Button>
        </div>
      )}

      {list.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-4 py-14 text-center" data-testid="students-empty">
          <span className="grid size-11 place-items-center rounded-full bg-muted text-muted-foreground">
            <SearchX className="size-5" />
          </span>
          <h3 className="m-0 text-[15px] font-semibold">{t('ro.noMatch')}</h3>
          <p className="m-0 text-[13px] text-muted-foreground">{t('ro.noMatchBody')}</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={clear}>
            {t('ro.clear')}
          </Button>
        </div>
      ) : (
        <>
          <Table data-testid="students-table">
            <TableHeader>
              <TableRow>
                <TableHead className="w-9 pl-3">
                  <Checkbox checked={allOnPage} onCheckedChange={(v) => togglePage(v === true)} aria-label={t('ro.selectAll')} />
                </TableHead>
                <TableHead>{t('ro.col.student')}</TableHead>
                <TableHead className="hidden sm:table-cell">{t('ro.col.roll')}</TableHead>
                <TableHead className="hidden lg:table-cell">{t('ro.col.programme')}</TableHead>
                {showAttendance && <TableHead className="hidden md:table-cell">{t('ro.col.attendance')}</TableHead>}
                {showFees && <TableHead>{t('ro.col.fees')}</TableHead>}
                <TableHead className="hidden md:table-cell">{t('ro.col.status')}</TableHead>
                <TableHead className="w-10">
                  <span className="sr-only">{t('ro.col.actions')}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((r) => (
                <TableRow key={r.id} tabIndex={0} data-state={sel.has(r.id) ? 'selected' : undefined} className="cursor-pointer" onClick={() => setOpen(r)} onKeyDown={(e) => onRowKey(e, r)} data-testid={`student-row-${r.rollNo}`}>
                  <TableCell className="pl-3" onClick={(e) => e.stopPropagation()}>
                    <Checkbox checked={sel.has(r.id)} onCheckedChange={(v) => toggle(r.id, v === true)} aria-label={t('ro.select', { name: r.fullName })} />
                  </TableCell>
                  <TableCell>
                    <span className="flex max-w-[150px] min-w-0 items-center gap-2.5 sm:max-w-none">
                      <Avatar className="size-8">
                        <AvatarFallback className="bg-teal-soft text-[11.5px] font-semibold text-teal-ink">{initials(r.fullName)}</AvatarFallback>
                      </Avatar>
                      <span className="min-w-0">
                        <b className="block truncate text-[13.5px] font-[550]">{r.fullName}</b>
                        <small className="block truncate text-xs text-muted-foreground">
                          <span className="sm:hidden">{r.rollNo} · </span>
                          {r.className}
                        </small>
                      </span>
                    </span>
                  </TableCell>
                  <TableCell className="hidden tabular-nums text-muted-foreground sm:table-cell">{r.rollNo}</TableCell>
                  <TableCell className="hidden lg:table-cell">
                    {r.programName}
                    {r.term !== null && <span className="text-muted-foreground"> · {t('ro.f.sem', { n: r.term })}</span>}
                  </TableCell>
                  {showAttendance && (
                    <TableCell className="hidden md:table-cell">
                      <AttendanceBar pct={r.attendancePct} />
                    </TableCell>
                  )}
                  {showFees && (
                    <TableCell>
                      <FeeBadge state={r.fee} />
                    </TableCell>
                  )}
                  <TableCell className="hidden md:table-cell">
                    <StatusPill kind="student" status={r.status} />
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label={`${t('ro.col.actions')}: ${r.fullName}`}>
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setOpen(r)}>
                          <Eye />
                          {t('ro.open')}
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link href={`/students/${r.id}`}>
                            <UserRound />
                            {t('ro.fullProfile')}
                          </Link>
                        </DropdownMenuItem>
                        {showFees && (
                          <DropdownMenuItem asChild>
                            <Link href={`/fees/invoices?class=${r.sectionId}&status=all`}>
                              <ReceiptText />
                              {t('ro.invoices')}
                            </Link>
                          </DropdownMenuItem>
                        )}
                        {canRemind && r.duePaise > 0 && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem disabled={pending} onSelect={() => remind([r.id])}>
                              <Send />
                              {t('ro.remind')}
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t px-3 py-2.5">
            <span className="text-[13px] text-muted-foreground" data-testid="students-count">
              {t('ro.showing', { from: (cur - 1) * PER_PAGE + 1, to: Math.min(cur * PER_PAGE, list.length), n: list.length })}
            </span>
            <nav aria-label={t('ro.page', { n: cur })} className="flex items-center gap-1">
              <Button variant="outline" size="icon-sm" disabled={cur <= 1} onClick={() => setPage(cur - 1)} aria-label={t('ro.prev')}>
                <ChevronLeft />
              </Button>
              {pageList(cur, pages).map((p, i) =>
                p === 0 ? (
                  <span key={`gap${i}`} className="px-1 text-muted-foreground">
                    …
                  </span>
                ) : (
                  <Button key={p} variant={p === cur ? 'default' : 'ghost'} size="icon-sm" aria-current={p === cur ? 'page' : undefined} aria-label={t('ro.page', { n: p })} onClick={() => setPage(p)}>
                    {p}
                  </Button>
                ),
              )}
              <Button variant="outline" size="icon-sm" disabled={cur >= pages} onClick={() => setPage(cur + 1)} aria-label={t('ro.next')}>
                <ChevronRight />
              </Button>
            </nav>
          </div>
        </>
      )}
      {open && <StudentSheet key={open.id} row={open} onClose={() => setOpen(null)} canRemind={canRemind} showFees={showFees} showAttendance={showAttendance} />}
    </section>
  );
}

/** Page numbers to show: first, last and the neighbours of the current one; 0 marks a gap. */
function pageList(cur: number, n: number): number[] {
  const set = [...new Set([1, n, cur - 1, cur, cur + 1].filter((x) => x >= 1 && x <= n))].sort((a, b) => a - b);
  const out: number[] = [];
  set.forEach((x, i) => {
    if (i > 0 && x - set[i - 1] > 1) out.push(0);
    out.push(x);
  });
  return out;
}

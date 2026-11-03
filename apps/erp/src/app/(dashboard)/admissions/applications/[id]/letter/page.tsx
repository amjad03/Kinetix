import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PrintButton } from '@/components/admissions/PrintButton';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { ApiError, api, load, requireSection } from '@/lib/api';
import { formatDate } from '@/lib/dates';
import { getI18n } from '@/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('ap.letter.title') };
}

interface Letter {
  kind: 'provisional' | 'confirmed';
  institution: string;
  applicationNo: string;
  name: string;
  guardianName: string;
  programme: string;
  academicYear: string;
  seat: { seatType: string; category: string | null; option: string | null; admissionType: string };
  provisionalUntil: string | null;
  pending: { label: string; dueOn: string | null }[];
  conditions: string[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The provisional (or confirmed) admission letter, printable on the letterhead. */
export default async function LetterPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSection('admissions');
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { t, locale } = await getI18n();
  const res = await load(async () => {
    try {
      return await api<Letter>(`/v1/admissions/applications/${id}/admission-letter`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) notFound();
      throw e;
    }
  });
  if (res.error !== undefined) return <ErrorState message={res.error} />;
  const l = res.data!;
  return (
    <>
      <PageHeader title={t(l.kind === 'confirmed' ? 'ap.letter.confirmed' : 'ap.letter.title')} subtitle={`${l.applicationNo} · ${l.name}`} actions={<PrintButton />} />
      <article className="mx-auto max-w-[720px] rounded-[12px] border bg-card p-8 text-[14px] leading-[22px] print:border-0 print:p-0" data-testid="admission-letter">
        <h2 className="text-center text-lg font-semibold">{l.institution}</h2>
        <p className="mt-1 text-center text-[13px] uppercase tracking-wide text-muted-foreground">{t(l.kind === 'confirmed' ? 'ap.letter.confirmed' : 'ap.letter.title')}</p>
        <p className="mt-6">{t('ap.letter.to', { name: l.name, guardian: l.guardianName })}</p>
        <p className="mt-3">{t('ap.letter.body', { programme: l.programme, year: l.academicYear, type: t(`ap.type.${l.seat.admissionType}` as 'ap.type.regular'), seat: l.seat.seatType, category: (l.seat.category ?? 'GM').toUpperCase() })}</p>
        {l.pending.length > 0 && (
          <>
            <p className="mt-4 font-medium">{t('ap.letter.pending')}</p>
            <ol className="ml-5 list-decimal">
              {l.pending.map((p) => (
                <li key={p.label}>
                  {p.label}
                  {p.dueOn ? ` (${t('ap.check.due', { date: formatDate(p.dueOn, 'long', locale) })})` : ''}
                </li>
              ))}
            </ol>
          </>
        )}
        <ul className="mt-4 ml-5 list-disc text-[13px] text-muted-foreground">
          {l.conditions.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <div className="mt-12 flex justify-between text-[13px]">
          <span>{t('ap.letter.student')}</span>
          <span>{t('ap.letter.principal')}</span>
        </div>
      </article>
    </>
  );
}

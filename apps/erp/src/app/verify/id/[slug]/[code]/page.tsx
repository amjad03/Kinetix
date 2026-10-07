import type { Metadata } from 'next';
import { VerifyView } from '@/components/documents/VerifyView';
import { api } from '@/lib/api';
import { getI18n } from '@/i18n/server';
import type { IdCardVerification } from '@/lib/hr-types';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('doc.verify.idTitle'), robots: { index: false } };
}

/** Where an ID card's QR code leads: public, and shows only name, class or designation, and whether the card is still in use. */
export default async function VerifyIdPage({ params }: { params: Promise<{ slug: string; code: string }> }) {
  const { slug, code } = await params;
  const { t } = await getI18n();
  const r = await api<IdCardVerification>(`/v1/public/verify-id/${encodeURIComponent(slug)}/${encodeURIComponent(code)}`, { anonymous: true }).catch(() => null);
  const lines = r && r.status !== 'not_found' ? [
    ...(r.institution ? [{ label: t('doc.verify.institution'), value: r.institution }] : []),
    ...(r.name ? [{ label: t('doc.verify.name'), value: r.name }] : []),
    ...(r.kind ? [{ label: t('doc.tpl.subject'), value: t(r.kind === 'student' ? 'doc.subject.student' : 'doc.subject.staff') }] : []),
    ...(r.detail ? [{ label: t('doc.verify.detail'), value: r.detail }] : []),
  ] : [];
  return (
    <VerifyView
      tone={r?.status === 'valid' ? 'valid' : r?.status === 'inactive' ? 'bad' : 'unknown'}
      heading={t(r === null ? 'doc.verify.unavailable' : r.status === 'valid' ? 'doc.verify.idValid' : r.status === 'inactive' ? 'doc.verify.idInactive' : 'doc.verify.notFound')}
      lines={lines}
      footer={t('doc.verify.footer')}
    />
  );
}

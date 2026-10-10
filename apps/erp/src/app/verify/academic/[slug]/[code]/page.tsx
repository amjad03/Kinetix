import type { Metadata } from 'next';
import { VerifyView } from '@/components/documents/VerifyView';
import { getI18n } from '@/i18n/server';
import { api } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('uni.verify.title'), robots: { index: false } };
}

interface Verification {
  status: 'valid' | 'not_found';
  institution?: string;
  document?: string;
  serialNo?: string;
  name?: string;
  issuedOn?: string;
  cgpa?: number;
}

/** Where the QR on a transcript, provisional certificate or grade card leads. Public: shows only what the document shows. */
export default async function VerifyAcademicPage({ params }: { params: Promise<{ slug: string; code: string }> }) {
  const { slug, code } = await params;
  const { t } = await getI18n();
  const r = await api<Verification>(`/v1/public/verify-academic/${encodeURIComponent(slug)}/${encodeURIComponent(code)}`, { anonymous: true }).catch(() => null);
  const valid = r?.status === 'valid';
  const lines = valid
    ? [
        ...(r.institution ? [{ label: t('doc.verify.institution'), value: r.institution }] : []),
        ...(r.document ? [{ label: t('uni.verify.document'), value: r.document }] : []),
        ...(r.serialNo ? [{ label: t('uni.verify.serial'), value: r.serialNo }] : []),
        ...(r.name ? [{ label: t('uni.verify.name'), value: r.name }] : []),
        ...(r.issuedOn ? [{ label: t('doc.verify.issuedOn'), value: r.issuedOn }] : []),
        ...(r.cgpa !== undefined ? [{ label: t('uni.verify.cgpa'), value: r.cgpa.toFixed(2) }] : []),
      ]
    : [];
  return <VerifyView tone={valid ? 'valid' : 'unknown'} heading={t(r === null ? 'doc.verify.unavailable' : valid ? 'uni.verify.valid' : 'uni.verify.notFound')} lines={lines} footer={t('doc.verify.footer')} />;
}

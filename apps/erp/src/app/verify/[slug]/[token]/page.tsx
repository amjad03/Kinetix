import type { Metadata } from 'next';
import { VerifyView } from '@/components/documents/VerifyView';
import { api } from '@/lib/api';
import { getI18n } from '@/i18n/server';
import type { CertificateVerification } from '@/lib/hr-types';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('doc.verify.title'), robots: { index: false } };
}

/** Where a certificate's QR code leads. Public: no sign-in, and the API reveals only what the certificate shows. */
export default async function VerifyPage({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  const { t } = await getI18n();
  const r = await api<CertificateVerification>(`/v1/public/verify/${encodeURIComponent(slug)}/${encodeURIComponent(token)}`, { anonymous: true }).catch(() => null);
  const lines = r && r.status !== 'not_found' ? [
    ...(r.institution ? [{ label: t('doc.verify.institution'), value: r.institution }] : []),
    ...(r.title ? [{ label: t('doc.certificate'), value: r.title }] : []),
    ...(r.serialNo ? [{ label: t('doc.serial'), value: r.serialNo }] : []),
    ...(r.subjectName ? [{ label: t('doc.verify.name'), value: r.subjectName }] : []),
    ...(r.issuedOn ? [{ label: t('doc.verify.issuedOn'), value: r.issuedOn }] : []),
    ...(r.revokedOn ? [{ label: t('doc.verify.revokedOn'), value: r.revokedOn }] : []),
  ] : [];
  return (
    <VerifyView
      tone={r?.status === 'valid' ? 'valid' : r?.status === 'revoked' ? 'bad' : 'unknown'}
      heading={t(r === null ? 'doc.verify.unavailable' : r.status === 'valid' ? 'doc.verify.valid' : r.status === 'revoked' ? 'doc.verify.revoked' : 'doc.verify.notFound')}
      lines={lines}
      footer={t('doc.verify.footer')}
    />
  );
}

import type { Metadata } from 'next';
import { ShieldAlert, ShieldCheck } from 'lucide-react';
import { VerifyView } from '@/components/documents/VerifyView';
import { api } from '@/lib/api';
import { getI18n } from '@/i18n/server';
import type { MessageKey } from '@/i18n/messages';
import type { CertificateVerification } from '@/lib/hr-types';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('doc.verify.title'), robots: { index: false } };
}

/**
 * Where a document's QR code leads. Public: no sign-in, and the API reveals only what the document
 * shows. Documents from the register add their key fields, the signature check and the fingerprint
 * printed beside the QR, so a reader can tell an altered copy from the real one.
 */
export default async function VerifyPage({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  const { t } = await getI18n();
  const r = await api<CertificateVerification>(`/v1/public/verify/${encodeURIComponent(slug)}/${encodeURIComponent(token)}`, { anonymous: true }).catch(() => null);
  const registered = !!r?.docType;
  const lines =
    r && r.status !== 'not_found'
      ? [
          ...(r.institution && !registered ? [{ label: t('doc.verify.institution'), value: r.institution }] : []),
          ...(r.docType ? [{ label: t('doc.verify.type'), value: t(`dt.type.${r.docType}` as MessageKey) }] : []),
          ...(r.title ? [{ label: t('doc.certificate'), value: r.title }] : []),
          ...(r.serialNo ? [{ label: t('doc.serial'), value: r.serialNo }] : []),
          ...(r.subjectName ? [{ label: t('doc.verify.name'), value: r.subjectName }] : []),
          ...(r.fields ?? []).filter((f) => f.value && f.value !== r.subjectName && f.value !== r.serialNo && f.value !== r.title),
          ...(r.issuedOn ? [{ label: t('doc.verify.issuedOn'), value: r.issuedOn }] : []),
          ...(r.revokedOn ? [{ label: t('doc.verify.revokedOn'), value: r.revokedOn }] : []),
          ...(r.revokedReason ? [{ label: t('doc.verify.reason'), value: r.revokedReason }] : []),
        ]
      : [];
  const heading = (() => {
    if (r === null) return t('doc.verify.unavailable');
    if (r.status === 'valid') return t(registered ? 'doc.verify.docValid' : 'doc.verify.valid');
    if (r.status === 'revoked') return t(registered ? 'doc.verify.docRevoked' : 'doc.verify.revoked');
    if (r.status === 'superseded') return t('doc.verify.superseded');
    return t('doc.verify.notFound');
  })();
  const extra =
    registered && r ? (
      <div className="mt-5 grid gap-2 text-left" data-testid="verify-integrity">
        <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-[13px] ${r.signatureValid ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'}`}>
          {r.signatureValid ? <ShieldCheck className="size-4 shrink-0" aria-hidden /> : <ShieldAlert className="size-4 shrink-0" aria-hidden />}
          {t(r.signatureValid ? 'doc.verify.signatureOk' : 'doc.verify.signatureBad')}
        </div>
        {r.fingerprint && (
          <div className="rounded-lg border px-3 py-2 text-[13px]">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">{t('doc.verify.fingerprint')}</span>
              <b className="font-mono tracking-wider">{r.fingerprint}</b>
            </div>
            <p className="m-0 mt-1 text-xs text-muted-foreground">{t('doc.verify.fingerprintHelp')}</p>
          </div>
        )}
      </div>
    ) : undefined;
  return (
    <VerifyView
      tone={r?.status === 'valid' ? (registered && !r.signatureValid ? 'bad' : 'valid') : r?.status === 'revoked' || r?.status === 'superseded' ? 'bad' : 'unknown'}
      heading={heading}
      lines={lines}
      footer={t('doc.verify.footer')}
      brand={registered && r?.institution ? { name: r.institution, logo: r.logo ? r.logo.replace(/^\/v1\/public\/branding\//, '/api/branding/') : null } : undefined}
      extra={extra}
    />
  );
}

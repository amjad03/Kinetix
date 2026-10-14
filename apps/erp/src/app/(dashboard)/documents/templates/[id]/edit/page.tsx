import type { Metadata } from 'next';
import Link from 'next/link';
import { MonitorSmartphone } from 'lucide-react';
import { CustomiseButton } from '@/components/documents/CustomiseButton';
import { DesignEditor } from '@/components/documents/editor/DesignEditor';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import type { MessageKey } from '@/i18n/messages';
import { canApprovePayroll } from '@/lib/access';
import { api, load, requireSection } from '@/lib/api';
import type { Branding } from '@/lib/doc-designs';
import type { DocBinding, DocData } from '@/lib/doc-editor/schema';
import type { DesignWithLayout } from '../../../designs-actions';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('de.title') };
}

/** Documents > Templates > a design in the editor (presets are copied first). */
export default async function DesignEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireSection('documents');
  const { t } = await getI18n();
  const { id: raw } = await params;
  const id = decodeURIComponent(raw);
  if (!me || !canApprovePayroll(me.roles)) return <ErrorState title={t('state.cantOpen')} message={t('de.notAllowed')} />;
  const loaded = await load(() => Promise.all([api<DesignWithLayout>(`/v1/documents/designs/${encodeURIComponent(id)}`), api<Branding>('/v1/admin/branding')]));
  if (loaded.error !== undefined) return <ErrorState title={t('state.cantOpen')} message={loaded.error} />;
  const [design, branding] = loaded.data;

  if (design.system) {
    return (
      <>
        <PageHeader title={t('de.title')} subtitle={`${design.name} · ${t(`dt.type.${design.docType}` as MessageKey)}`} />
        <div className="mx-auto grid max-w-[560px] gap-4 rounded-xl border bg-card p-6 text-center shadow-card">
          <h2 className="m-0 text-lg font-semibold">{t('de.presetTitle')}</h2>
          <p className="m-0 text-sm text-muted-foreground">{t('de.presetBody')}</p>
          <div className="flex justify-center gap-2">
            <Link href={`/documents/templates?type=${design.docType}`} className="inline-flex h-9 items-center rounded-md border px-4 text-sm font-medium hover:bg-muted">
              {t('de.back')}
            </Link>
            <CustomiseButton design={design} variant="contained" />
          </div>
        </div>
      </>
    );
  }

  const extra = await load(() => Promise.all([api<{ bindings: DocBinding[]; sample: DocData }>(`/v1/documents/designs/bindings/${design.docType}`), design.basedOn ? api<DesignWithLayout>(`/v1/documents/designs/${encodeURIComponent(design.basedOn)}`).catch(() => null) : Promise.resolve(null)]));
  if (extra.error !== undefined) return <ErrorState title={t('state.cantOpen')} message={extra.error} />;
  const [catalogue, original] = extra.data;

  return (
    <>
      {/* The designer needs a large screen; phones and small tablets get a note instead. */}
      <div className="lg:hidden">
        <PageHeader title={t('de.title')} subtitle={design.name} />
        <div className="mx-auto grid max-w-[480px] justify-items-center gap-3 rounded-xl border bg-card p-6 text-center shadow-card" data-testid="small-screen">
          <MonitorSmartphone className="size-10 text-primary" aria-hidden />
          <h2 className="m-0 text-lg font-semibold">{t('de.smallTitle')}</h2>
          <p className="m-0 text-sm text-muted-foreground">{t('de.smallBody')}</p>
          <Link href={`/documents/templates?type=${design.docType}`} className="inline-flex h-9 items-center rounded-md border px-4 text-sm font-medium hover:bg-muted">
            {t('de.back')}
          </Link>
        </div>
      </div>
      <div className="hidden lg:block">
        <DesignEditor design={design} branding={branding} bindings={catalogue.bindings} sample={catalogue.sample} original={original?.layout ?? null} canUpload={canApprovePayroll(me.roles)} />
      </div>
    </>
  );
}

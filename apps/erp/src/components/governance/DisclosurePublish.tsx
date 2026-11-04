'use client';

import { useRouter } from 'next/navigation';
import { ExternalLink, Globe } from 'lucide-react';
import { useState } from 'react';
import { publishDisclosure } from '@/app/(dashboard)/governance/pass-actions';
import { Alert, Button } from '@/components/kx';
import { FormDialog, useToast } from '@/components/ops/kit';
import { useI18n } from '@/i18n/client';

/** Publishes the disclosure page (or takes it down) with its opening note, and links to the public address. */
export function DisclosurePublish({ published, publishedAt, intro, slug }: { published: boolean; publishedAt: string | null; intro: string; slug: string }) {
  const { t, fmt } = useI18n();
  const router = useRouter();
  const [toast, toastNode] = useToast();
  const [open, setOpen] = useState(false);
  const href = `/disclosure/${slug}`;
  return (
    <>
      <Alert
        severity={published ? 'success' : 'info'}
        className="mb-4"
        action={
          <div className="flex flex-wrap gap-2">
            {published && (
              <Button size="small" component="a" href={href} target="_blank" rel="noopener" startIcon={<ExternalLink className="size-3.5" />} data-testid="disclosure-open">
                {t('gp.ds.open')}
              </Button>
            )}
            <Button size="small" variant="contained" startIcon={<Globe className="size-3.5" />} onClick={() => setOpen(true)} data-testid="disclosure-publish">
              {published ? t('gp.ds.update') : t('gp.ds.publish')}
            </Button>
          </div>
        }
      >
        {published && publishedAt ? t('gp.ds.isPublished', { at: fmt.dateTime(publishedAt) }) : t('gp.ds.notPublished')}
      </Alert>
      {open && (
        <FormDialog
          title={t('gp.ds.publish')}
          fields={[
            { name: 'published', label: t('gp.ds.state'), kind: 'select', options: [{ value: 'yes', label: t('gp.ds.on') }, { value: 'no', label: t('gp.ds.off') }], init: 'yes', required: true },
            { name: 'intro', label: t('gp.ds.intro'), kind: 'multiline', init: intro },
          ]}
          onSubmit={(v) => publishDisclosure(v.published === 'yes', v.intro ?? '')}
          onClose={(msg) => {
            setOpen(false);
            if (msg) {
              toast(msg);
              router.refresh();
            }
          }}
        />
      )}
      {toastNode}
    </>
  );
}

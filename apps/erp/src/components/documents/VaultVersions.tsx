'use client';

import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import { restoreVaultVersion, vaultVersions } from '@/app/(dashboard)/documents/actions';
import { ActionButton, Grid, InfoDialog, Pill, useToast } from '@/components/ops/kit';
import { useLoad } from '@/components/pathways-b/common';
import { useI18n } from '@/i18n/client';
import { docDownload } from '@/lib/documents';
import { sizeLabel, type VaultVersion } from '@/lib/pathways-b';

/** Every version of one vault document, with a way to bring an older one back as the current version. */
export function VaultVersions({ id, title, onClose, onChanged }: { id: string; title: string; onClose: () => void; onChanged: () => void }) {
  const { t, fmt } = useI18n();
  const [toast, toastNode] = useToast();
  const versions = useLoad<VaultVersion[]>(() => vaultVersions(id));
  const rows = [...(versions.data ?? [])].sort((a, b) => b.version - a.version);
  const restored = (m: string) => {
    toast(m);
    versions.reload();
    onChanged();
  };
  return (
    <InfoDialog title={t('pwb.vault.versionsTitle', { title })} onClose={onClose}>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{t('pwb.vault.versionsHelp')}</Typography>
      {versions.error && <Typography color="error">{versions.error}</Typography>}
      <Grid
        testId="pwb-versions"
        empty={t('pwb.vault.noVersions')}
        rows={rows}
        cols={[
          { label: t('doc.vault.version'), cell: (v) => `v${v.version}`, sort: (v) => v.version },
          { label: t('ops.f.date'), cell: (v) => fmt.date(v.createdAt.slice(0, 10), 'short'), sort: (v) => v.createdAt },
          { label: t('pwb.vault.uploadedBy'), cell: (v) => v.uploadedBy?.fullName ?? '-' },
          { label: t('pwb.size'), cell: (v) => sizeLabel(v.sizeBytes), sort: (v) => v.sizeBytes },
          { label: t('ops.f.status'), cell: (v) => (v.current ? <Pill label={t('pwb.vault.current')} /> : '-') },
          {
            label: '',
            cell: (v) => (
              <>
                <Button size="small" href={docDownload.vault(v.id)}>{t('doc.vault.download')}</Button>
                {!v.current && <ActionButton label={t('pwb.vault.restore')} run={() => restoreVaultVersion(v.id)} onDone={restored} />}
              </>
            ),
          },
        ]}
      />
      {toastNode}
    </InfoDialog>
  );
}

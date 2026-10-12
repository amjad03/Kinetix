'use client';
import { useState } from 'react';
import { FormField, TextInput, FormRow } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { docDownload } from '@/lib/documents';

import { Button, MenuItem } from '@/components/kx';
import { IdCard as BadgeOutlined } from 'lucide-react';
export function IdCardsDesk({ classes, canStudents }: { classes: { id: string; name: string }[]; canStudents: boolean }) {
  const { t } = useI18n();
  const [sectionId, setSectionId] = useState('');
  return (
    <div className="grid gap-6 max-w-[560px]">
      <p className="text-[13px] leading-[19px] text-muted-foreground">
        {t('doc.id.help')}
      </p>
      <div>
        <h2 className="font-medium tracking-[0.1px] text-[1rem] mb-2">
          {t('doc.id.students')}
        </h2>
        {canStudents ? (
          <FormRow className="gap-3">
            <FormField label={t('doc.class')}>
              <TextInput className="min-w-[240px]" select value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
                {classes.map((c) => (
                  <MenuItem key={c.id} value={c.id}>
                    {c.name}
                  </MenuItem>
                ))}
              </TextInput>
            </FormField>
            <Button variant="contained" startIcon={<BadgeOutlined />} disabled={!sectionId} href={docDownload.students(sectionId || 'none')} target="_blank">
              {t('doc.id.open')}
            </Button>
          </FormRow>
        ) : (
          <p className="text-[13px] leading-[19px] text-muted-foreground">
            {t('doc.id.notAllowed')}
          </p>
        )}
      </div>
      <div>
        <h2 className="font-medium tracking-[0.1px] text-[1rem] mb-2">
          {t('doc.id.staff')}
        </h2>
        <Button variant="contained" startIcon={<BadgeOutlined />} href={docDownload.staff} target="_blank">
          {t('doc.id.open')}
        </Button>
      </div>
      <div>
        <h2 className="font-medium tracking-[0.1px] text-[1rem] mb-2">
          {t('doc.id.mine')}
        </h2>
        <Button variant="outlined" startIcon={<BadgeOutlined />} href={docDownload.me} target="_blank">
          {t('doc.id.open')}
        </Button>
      </div>
    </div>
  );
}

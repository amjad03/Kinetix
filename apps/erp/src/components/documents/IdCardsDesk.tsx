'use client';

import BadgeOutlined from '@mui/icons-material/BadgeOutlined';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { useI18n } from '@/i18n/client';
import { docDownload } from '@/lib/documents';

export function IdCardsDesk({ classes, canStudents }: { classes: { id: string; name: string }[]; canStudents: boolean }) {
  const { t } = useI18n();
  const [sectionId, setSectionId] = useState('');
  return (
    <Box sx={{ display: 'grid', gap: 3, maxWidth: 560 }}>
      <Typography variant="body2" color="text.secondary">
        {t('doc.id.help')}
      </Typography>
      <Box>
        <Typography variant="h6" component="h2" sx={{ fontSize: '1rem', mb: 1 }}>
          {t('doc.id.students')}
        </Typography>
        {canStudents ? (
          <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
            <TextField select size="small" label={t('doc.class')} value={sectionId} onChange={(e) => setSectionId(e.target.value)} sx={{ minWidth: 240 }}>
              {classes.map((c) => (
                <MenuItem key={c.id} value={c.id}>
                  {c.name}
                </MenuItem>
              ))}
            </TextField>
            <Button variant="contained" startIcon={<BadgeOutlined />} disabled={!sectionId} href={docDownload.students(sectionId || 'none')} target="_blank">
              {t('doc.id.open')}
            </Button>
          </Box>
        ) : (
          <Typography variant="body2" color="text.secondary">
            {t('doc.id.notAllowed')}
          </Typography>
        )}
      </Box>
      <Box>
        <Typography variant="h6" component="h2" sx={{ fontSize: '1rem', mb: 1 }}>
          {t('doc.id.staff')}
        </Typography>
        <Button variant="contained" startIcon={<BadgeOutlined />} href={docDownload.staff} target="_blank">
          {t('doc.id.open')}
        </Button>
      </Box>
      <Box>
        <Typography variant="h6" component="h2" sx={{ fontSize: '1rem', mb: 1 }}>
          {t('doc.id.mine')}
        </Typography>
        <Button variant="outlined" startIcon={<BadgeOutlined />} href={docDownload.me} target="_blank">
          {t('doc.id.open')}
        </Button>
      </Box>
    </Box>
  );
}

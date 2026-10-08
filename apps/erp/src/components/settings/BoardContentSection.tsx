'use client';

import AddOutlined from '@mui/icons-material/AddOutlined';
import DeleteOutline from '@mui/icons-material/DeleteOutlined';
import SchoolOutlined from '@mui/icons-material/SchoolOutlined';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import IconButton from '@mui/material/IconButton';
import Snackbar from '@mui/material/Snackbar';
import Typography from '@mui/material/Typography';
import { useState, useTransition } from 'react';
import { importPastExams, saveBoardContent } from '@/app/(dashboard)/settings/actions';
import { SectionTitle } from '@/components/PageHeader';
import { TextInput } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { InstitutionSettings, WhatsNewItem } from '@/lib/settings';

/**
 * Settings → Smartboard: the training link and contact behind the board's "Schedule a Training",
 * the institution's What's New announcements, and the past-exam question bank that is the only
 * source of Quiz AI's exam-frequency badges.
 */
export function BoardContentSection({ initial }: { initial: InstitutionSettings }) {
  const { t } = useI18n();
  const [url, setUrl] = useState(initial.boardTraining?.url ?? '');
  const [contact, setContact] = useState(initial.boardTraining?.contact ?? '');
  const [items, setItems] = useState<WhatsNewItem[]>(initial.boardWhatsNew ?? []);
  const [csv, setCsv] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const today = new Date().toISOString().slice(0, 10);

  const save = () => {
    setError(null);
    start(async () => {
      const res = await saveBoardContent({ training: { url, contact }, whatsNew: items });
      if (!res.ok) return setError(res.error);
      setToast(t('settings.saved'));
    });
  };
  const upload = () => {
    setError(null);
    start(async () => {
      const res = await importPastExams(csv);
      if (!res.ok) return setError(res.error);
      setCsv('');
      setToast(t('pastExams.imported', { n: res.data.imported }) + (res.data.bad.length ? ` ${t('pastExams.badLines', { lines: res.data.bad.join(', ') })}` : ''));
    });
  };
  const set = (i: number, patch: Partial<WhatsNewItem>) => setItems((xs) => xs.map((x, k) => (k === i ? { ...x, ...patch } : x)));

  return (
    <>
      <SectionTitle>
        <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
          <SchoolOutlined fontSize="small" /> {t('boardContent.title')}
        </Box>
      </SectionTitle>
      <Card data-testid="board-content" aria-busy={pending} sx={{ p: 2.5, display: 'grid', gap: 2 }}>
        {error && (
          <Alert severity="error" role="alert">
            {error}
          </Alert>
        )}
        <Typography variant="subtitle1">{t('boardContent.training')}</Typography>
        <Typography variant="body2" color="text.secondary">
          {t('boardContent.trainingHelp')}
        </Typography>
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '2fr 1fr' } }}>
          <TextInput label={t('boardContent.trainingUrl')} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" slotProps={{ htmlInput: { 'data-testid': 'training-url' } }} />
          <TextInput label={t('boardContent.contact')} value={contact} onChange={(e) => setContact(e.target.value)} slotProps={{ htmlInput: { 'data-testid': 'training-contact' } }} />
        </Box>

        <Typography variant="subtitle1">{t('boardContent.whatsNew')}</Typography>
        <Typography variant="body2" color="text.secondary">
          {t('boardContent.whatsNewHelp')}
        </Typography>
        {items.map((w, i) => (
          <Box key={i} sx={{ display: 'grid', gap: 1, gridTemplateColumns: { xs: '1fr', md: '1fr 2fr auto' }, alignItems: 'start' }}>
            <TextInput label={t('boardContent.itemTitle')} value={w.title} onChange={(e) => set(i, { title: e.target.value })} />
            <TextInput label={t('boardContent.itemBody')} value={w.body} onChange={(e) => set(i, { body: e.target.value })} multiline />
            <IconButton aria-label={t('boardContent.remove')} onClick={() => setItems((xs) => xs.filter((_, k) => k !== i))}>
              <DeleteOutline />
            </IconButton>
          </Box>
        ))}
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button startIcon={<AddOutlined />} onClick={() => setItems((xs) => [{ title: '', body: '', at: today }, ...xs])} data-testid="whats-new-add">
            {t('boardContent.add')}
          </Button>
          <Box sx={{ flex: 1 }} />
          <Button variant="contained" onClick={save} disabled={pending} data-testid="board-content-save">
            {t('boardContent.save')}
          </Button>
        </Box>

        <Typography variant="subtitle1">{t('pastExams.title')}</Typography>
        <Typography variant="body2" color="text.secondary">
          {t('pastExams.help')}
        </Typography>
        <TextInput
          label={t('pastExams.csv')}
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          multiline
          minRows={4}
          placeholder={'question,exam,year,marks\n"What is goodwill?",BU BCom Sem 3,2024,5'}
          slotProps={{ htmlInput: { 'data-testid': 'past-exams-csv' } }}
        />
        <Box>
          <Button variant="outlined" onClick={upload} disabled={pending || !csv.trim()} data-testid="past-exams-import">
            {t('pastExams.import')}
          </Button>
        </Box>
      </Card>
      <Snackbar open={toast !== null} autoHideDuration={4000} onClose={() => setToast(null)} message={toast ?? ''} />
    </>
  );
}

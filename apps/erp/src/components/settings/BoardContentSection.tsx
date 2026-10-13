'use client';
import { useState, useTransition } from 'react';
import { importPastExams, saveBoardContent } from '@/app/(dashboard)/settings/actions';
import { SectionTitle } from '@/components/PageHeader';
import { TextInput } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { InstitutionSettings, WhatsNewItem } from '@/lib/settings';

import { Alert, Button, Card, IconButton, Snackbar } from '@/components/kx';
import { GraduationCap as SchoolOutlined, Plus as AddOutlined, Trash2 as DeleteOutline } from 'lucide-react';
/**
 * Settings → Smartboard: the training link and contact behind the board's "Schedule a Training",
 * the institution's What's New announcements, the school server boards download 3D models from,
 * and the past-exam question bank that is the only source of Quiz AI's exam-frequency badges.
 */
export function BoardContentSection({ initial }: { initial: InstitutionSettings }) {
  const { t } = useI18n();
  const [url, setUrl] = useState(initial.boardTraining?.url ?? '');
  const [contact, setContact] = useState(initial.boardTraining?.contact ?? '');
  const [items, setItems] = useState<WhatsNewItem[]>(initial.boardWhatsNew ?? []);
  const [modelsBase, setModelsBase] = useState(initial.boardModelsBase ?? '');
  const [csv, setCsv] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const today = new Date().toISOString().slice(0, 10);

  const save = () => {
    setError(null);
    start(async () => {
      const res = await saveBoardContent({ training: { url, contact }, whatsNew: items, modelsBase });
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
        <span className="inline-flex items-center gap-2">
          <SchoolOutlined className="size-5" /> {t('boardContent.title')}
        </span>
      </SectionTitle>
      <Card className="p-5 grid gap-4" data-testid="board-content" aria-busy={pending}>
        {error && (
          <Alert severity="error" role="alert">
            {error}
          </Alert>
        )}
        <h6 className="text-base leading-6 font-medium tracking-[0.1px]">{t('boardContent.training')}</h6>
        <p className="text-[13px] leading-[19px] text-muted-foreground">
          {t('boardContent.trainingHelp')}
        </p>
        <div className="grid gap-4 grid-cols-[1fr] md:grid-cols-[2fr_1fr]">
          <TextInput label={t('boardContent.trainingUrl')} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" slotProps={{ htmlInput: { 'data-testid': 'training-url' } }} />
          <TextInput label={t('boardContent.contact')} value={contact} onChange={(e) => setContact(e.target.value)} slotProps={{ htmlInput: { 'data-testid': 'training-contact' } }} />
        </div>

        <h6 className="text-base leading-6 font-medium tracking-[0.1px]">{t('boardContent.models')}</h6>
        <p className="text-[13px] leading-[19px] text-muted-foreground">
          {t('boardContent.modelsHelp')}
        </p>
        <TextInput label={t('boardContent.modelsUrl')} value={modelsBase} onChange={(e) => setModelsBase(e.target.value)} placeholder="http://" slotProps={{ htmlInput: { 'data-testid': 'models-base' } }} />

        <h6 className="text-base leading-6 font-medium tracking-[0.1px]">{t('boardContent.whatsNew')}</h6>
        <p className="text-[13px] leading-[19px] text-muted-foreground">
          {t('boardContent.whatsNewHelp')}
        </p>
        {items.map((w, i) => (
          <div className="grid gap-2 grid-cols-[1fr] md:grid-cols-[1fr_2fr_auto] items-start" key={i}>
            <TextInput label={t('boardContent.itemTitle')} value={w.title} onChange={(e) => set(i, { title: e.target.value })} />
            <TextInput label={t('boardContent.itemBody')} value={w.body} onChange={(e) => set(i, { body: e.target.value })} multiline />
            <IconButton aria-label={t('boardContent.remove')} onClick={() => setItems((xs) => xs.filter((_, k) => k !== i))}>
              <DeleteOutline />
            </IconButton>
          </div>
        ))}
        <div className="flex gap-2">
          <Button startIcon={<AddOutlined />} onClick={() => setItems((xs) => [{ title: '', body: '', at: today }, ...xs])} data-testid="whats-new-add">
            {t('boardContent.add')}
          </Button>
          <div className="flex-1" />
          <Button variant="contained" onClick={save} disabled={pending} data-testid="board-content-save">
            {t('boardContent.save')}
          </Button>
        </div>

        <h6 className="text-base leading-6 font-medium tracking-[0.1px]">{t('pastExams.title')}</h6>
        <p className="text-[13px] leading-[19px] text-muted-foreground">
          {t('pastExams.help')}
        </p>
        <TextInput
          label={t('pastExams.csv')}
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          multiline
          minRows={4}
          placeholder={'question,exam,year,marks\n"What is goodwill?",BU BCom Sem 3,2024,5'}
          slotProps={{ htmlInput: { 'data-testid': 'past-exams-csv' } }}
        />
        <div>
          <Button variant="outlined" onClick={upload} disabled={pending || !csv.trim()} data-testid="past-exams-import">
            {t('pastExams.import')}
          </Button>
        </div>
      </Card>
      <Snackbar open={toast !== null} autoHideDuration={4000} onClose={() => setToast(null)} message={toast ?? ''} />
    </>
  );
}

'use client';
import { useState } from 'react';
import { Button } from '@/components/kx';
import { CheckboxField, Dialog, FormGrid, SelectInput, TextInput } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import type { VideoLanguage } from '@/lib/types';
import { AUDIENCES, MATERIAL_KINDS, materialProblem, toggleAudience, type Audience, type MaterialInput, type MaterialKind, type TopicMaterial } from '@/lib/zynetix';

export const KIND_LABEL: Record<MaterialKind, MessageKey> = {
  pdf: 'zx.kind.pdf',
  book: 'zx.kind.book',
  syllabus: 'zx.kind.syllabus',
  link: 'zx.kind.link',
  animation: 'zx.kind.animation',
  model3d: 'zx.kind.model3d',
  sim: 'zx.kind.sim',
};
export const AUDIENCE_LABEL: Record<Audience, MessageKey> = { board: 'zx.aud.board', teacher: 'zx.aud.teacher', student: 'zx.aud.student', parent: 'zx.aud.parent' };
const LANG_LABEL: Record<VideoLanguage, MessageKey> = { en: 'zx.lang.en', hi: 'zx.lang.hi', kn: 'zx.lang.kn' };

const num = (s: string) => (s.trim() ? Math.max(1, Math.floor(Number(s))) || null : null);

/** Add or edit one topic material: a PDF, a book chapter and pages, a syllabus, a link, an animation, a 3D model or a sim. */
export function MaterialDialog({
  initial,
  animations,
  busy,
  onSave,
  onClose,
}: {
  initial: TopicMaterial | null;
  animations: { id: string; title: string }[];
  busy: boolean;
  onSave: (m: MaterialInput) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [kind, setKind] = useState<MaterialKind>(initial?.kind ?? 'pdf');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [url, setUrl] = useState(initial?.url ?? '');
  const [ref, setRef] = useState(initial?.ref ?? '');
  const [author, setAuthor] = useState(initial?.author ?? '');
  const [chapter, setChapter] = useState(initial?.bookChapter ?? '');
  const [from, setFrom] = useState(initial?.pageFrom ? String(initial.pageFrom) : '');
  const [to, setTo] = useState(initial?.pageTo ? String(initial.pageTo) : '');
  const [language, setLanguage] = useState<VideoLanguage>(initial?.language ?? 'en');
  const [audience, setAudience] = useState<Audience[]>(initial?.audience ?? [...AUDIENCES]);
  const [tried, setTried] = useState(false);

  const input: MaterialInput = {
    kind,
    title: title.trim() || undefined,
    url: url.trim() || null,
    ref: ref.trim() || null,
    author: kind === 'book' ? author.trim() || null : null,
    bookChapter: kind === 'book' ? chapter.trim() || null : null,
    pageFrom: kind === 'book' ? num(from) : null,
    pageTo: kind === 'book' ? num(to) : null,
    language,
    audience,
  };
  const problem = materialProblem(input);
  const save = () => {
    setTried(true);
    if (!problem) onSave(input);
  };

  return (
    <Dialog
      title={t(initial ? 'zx.mat.edit' : 'zx.mat.add')}
      onClose={onClose}
      busy={busy}
      size="md"
      actions={
        <>
          <Button onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button variant="contained" onClick={save} disabled={busy} data-testid="zx-material-save">
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4" data-testid="zx-material-dialog">
        <FormGrid>
          <SelectInput
            label={t('zx.mat.kind')}
            value={kind}
            disabled={!!initial}
            onChange={(e) => setKind(e.target.value as MaterialKind)}
            options={MATERIAL_KINDS.map((k) => ({ value: k, label: t(KIND_LABEL[k]) }))}
            slotProps={{ htmlInput: { 'data-testid': 'zx-material-kind' } }}
          />
          <SelectInput label={t('zx.mat.language')} value={language} onChange={(e) => setLanguage(e.target.value as VideoLanguage)} options={(['en', 'hi', 'kn'] as const).map((l) => ({ value: l, label: t(LANG_LABEL[l]) }))} />
        </FormGrid>
        <TextInput label={t('zx.mat.title')} value={title} onChange={(e) => setTitle(e.target.value)} required={kind === 'book'} slotProps={{ htmlInput: { maxLength: 200, 'data-testid': 'zx-material-title' } }} />
        {kind === 'animation' ? (
          <SelectInput label={t('zx.mat.animation')} value={ref} onChange={(e) => setRef(e.target.value)} empty={t('zx.mat.pick')} options={animations.map((a) => ({ value: a.id, label: a.title }))} slotProps={{ htmlInput: { 'data-testid': 'zx-material-ref' } }} />
        ) : (
          <TextInput label={t('zx.mat.url')} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" required={kind === 'pdf' || kind === 'syllabus' || kind === 'link'} slotProps={{ htmlInput: { maxLength: 1000, 'data-testid': 'zx-material-url' } }} />
        )}
        {(kind === 'model3d' || kind === 'sim') && <TextInput label={t('zx.mat.ref')} helper={t('zx.mat.refHelp')} value={ref} onChange={(e) => setRef(e.target.value)} slotProps={{ htmlInput: { maxLength: 100 } }} />}
        {kind === 'book' && (
          <FormGrid>
            <TextInput label={t('zx.mat.author')} value={author} onChange={(e) => setAuthor(e.target.value)} slotProps={{ htmlInput: { maxLength: 200 } }} />
            <TextInput label={t('zx.mat.bookChapter')} value={chapter} onChange={(e) => setChapter(e.target.value)} slotProps={{ htmlInput: { maxLength: 200, 'data-testid': 'zx-material-chapter' } }} />
            <TextInput label={t('zx.mat.pageFrom')} type="number" value={from} onChange={(e) => setFrom(e.target.value)} slotProps={{ htmlInput: { min: 1, 'data-testid': 'zx-material-from' } }} />
            <TextInput label={t('zx.mat.pageTo')} type="number" value={to} onChange={(e) => setTo(e.target.value)} slotProps={{ htmlInput: { min: 1, 'data-testid': 'zx-material-to' } }} />
          </FormGrid>
        )}
        <fieldset>
          <legend className="text-[13px] leading-5 font-semibold">{t('zx.mat.audience')}</legend>
          <div className="flex flex-wrap gap-x-4">
            {AUDIENCES.map((a) => (
              <CheckboxField key={a} label={t(AUDIENCE_LABEL[a])} checked={audience.includes(a)} onChange={() => setAudience((l) => toggleAudience(l, a))} />
            ))}
          </div>
        </fieldset>
        {tried && problem && (
          <p role="alert" className="text-sm text-red-ink">
            {t(problem)}
          </p>
        )}
      </div>
    </Dialog>
  );
}

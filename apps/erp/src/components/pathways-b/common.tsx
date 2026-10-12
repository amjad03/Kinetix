'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { FormDialog, type Field } from '@/components/ops/kit';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { BLOB_TYPES, fileProblem, readPicked, sizeLabel, type PickedFile } from '@/lib/pathways-b';
import type { ActionResult } from '@/lib/types';

import { Alert, Button } from '@/components/kx';
import { FileUp as UploadFile } from 'lucide-react';
/** Loads a read-only list for a dialog on demand, and reloads it after a change. */
export function useLoad<T>(load: () => Promise<ActionResult<T>>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  // The first loader is kept for the life of the component.
  const [run] = useState(() => load);
  useEffect(() => {
    let live = true;
    void run().then((r) => {
      if (!live) return;
      if (r.ok) {
        setData(r.data);
        setError(null);
      } else setError(r.error);
    });
    return () => {
      live = false;
    };
  }, [run, tick]);
  return { data, error, reload: () => setTick((n) => n + 1) };
}

/** A heading with an action beside it, inside a dialog or a tab. */
export function SectionHead({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-row items-center justify-between gap-2 flex-wrap mt-6 mb-2">
      <h6 className="font-medium tracking-[0.1px] text-[1.0625rem]">{title}</h6>
      {children && <div className="flex flex-row gap-2">{children}</div>}
    </div>
  );
}

/**
 * A form in a dialog with a file to choose. The file is read in the browser and goes to the action as base64
 * (up to 4 MB); `required` refuses to submit without one.
 */
export function FileFormDialog({ title, fields, allowed = BLOB_TYPES, required, intro, submitLabel, onSubmit, onClose }: {
  title: string;
  fields: Field[];
  allowed?: readonly string[];
  required?: boolean;
  intro?: ReactNode;
  submitLabel?: string;
  onSubmit: (v: Record<string, string>, file: PickedFile | null) => Promise<ActionResult<unknown>>;
  onClose: (done?: string) => void;
}) {
  const { t } = useI18n();
  const [file, setFile] = useState<PickedFile | null>(null);
  const [label, setLabel] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  const pick = async (f: File | null) => {
    setFile(null);
    setLabel('');
    setProblem(null);
    if (!f) return;
    const p = fileProblem({ name: f.name, type: f.type, size: f.size }, allowed);
    if (p) return setProblem(t(`pwb.file.err.${p}` as MessageKey));
    setLabel(`${f.name} (${sizeLabel(f.size)})`);
    setFile(await readPicked(f));
  };

  return (
    <FormDialog
      title={title}
      fields={fields}
      submitLabel={submitLabel}
      intro={
        <>
          {intro}
          <Button component="label" variant="outlined" startIcon={<UploadFile />} data-testid="pwb-file">
            {label || t('pwb.file.choose')}
            <input hidden type="file" accept={allowed.join(',')} onChange={(e) => void pick(e.target.files?.[0] ?? null)} />
          </Button>
          {problem && <Alert severity="error">{problem}</Alert>}
        </>
      }
      onSubmit={(v) => (required && !file ? Promise.resolve({ ok: false as const, error: t('pwb.file.required') }) : onSubmit(v, file))}
      onClose={onClose}
    />
  );
}

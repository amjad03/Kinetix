'use client';

import { Button, IconButton, TextField } from '@/components/kx';
import { Plus as Add, X as Close } from 'lucide-react';
/** Edits a list of short texts: one field per item, add and remove. */
export function ListEditor({
  label,
  itemLabel,
  addLabel,
  removeLabel,
  items,
  onChange,
  max,
  maxLength,
  placeholder,
}: {
  label: string;
  itemLabel: string;
  /** "Add note". */
  addLabel: string;
  /** "Remove note 2". */
  removeLabel: (n: number) => string;
  items: string[];
  onChange: (items: string[]) => void;
  max: number;
  maxLength: number;
  placeholder?: string;
}) {
  const set = (i: number, v: string) => onChange(items.map((x, j) => (j === i ? v : x)));
  return (
    <div role="group" aria-label={label}>
      <h6 className="text-sm leading-5 font-medium tracking-[0.1px] mb-2">
        {label}
      </h6>
      {items.map((item, i) => (
        <div className="flex items-start gap-2 mb-2" key={i}>
          <p className="text-[13px] leading-[19px] text-muted-foreground w-[20px] pt-2.5 text-right shrink-0">
            {i + 1}.
          </p>
          <TextField
            size="small"
            fullWidth
            multiline
            maxRows={6}
            value={item}
            placeholder={placeholder}
            onChange={(e) => set(i, e.target.value)}
            slotProps={{ htmlInput: { maxLength, 'aria-label': `${itemLabel} ${i + 1}` } }}
          />
          <IconButton className="mt-1" aria-label={removeLabel(i + 1)} onClick={() => onChange(items.filter((_, j) => j !== i))} size="small">
            <Close className="size-5" />
          </IconButton>
        </div>
      ))}
      <Button className="ml-5" size="small" startIcon={<Add />} onClick={() => onChange([...items, ''])} disabled={items.length >= max}>
        {addLabel}
      </Button>
    </div>
  );
}

'use client';

import Add from '@mui/icons-material/Add';
import Close from '@mui/icons-material/Close';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

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
    <Box role="group" aria-label={label}>
      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        {label}
      </Typography>
      {items.map((item, i) => (
        <Box key={i} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 1 }}>
          <Typography variant="body2" color="text.secondary" sx={{ width: 20, pt: 1.25, textAlign: 'right', flexShrink: 0 }}>
            {i + 1}.
          </Typography>
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
          <IconButton aria-label={removeLabel(i + 1)} onClick={() => onChange(items.filter((_, j) => j !== i))} size="small" sx={{ mt: 0.5 }}>
            <Close fontSize="small" />
          </IconButton>
        </Box>
      ))}
      <Button size="small" startIcon={<Add />} onClick={() => onChange([...items, ''])} disabled={items.length >= max} sx={{ ml: 2.5 }}>
        {addLabel}
      </Button>
    </Box>
  );
}

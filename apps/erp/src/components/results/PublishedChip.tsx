import Chip from '@mui/material/Chip';
import { formatDateTime } from '@/lib/dates';

/** Published (green, with the date) or Draft (outlined): families see published marks only. */
export function PublishedChip({ publishedAt }: { publishedAt: string | null }) {
  if (publishedAt)
    return (
      <Chip
        size="small"
        label={`Published ${formatDateTime(publishedAt, undefined, false)}`}
        sx={{ bgcolor: 'kx.successContainer', color: 'kx.onSuccessContainer' }}
        data-status="published"
      />
    );
  return <Chip size="small" label="Draft" variant="outlined" sx={{ color: 'text.secondary' }} data-status="draft" />;
}

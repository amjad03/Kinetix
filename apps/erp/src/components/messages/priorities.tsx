import CampaignOutlined from '@mui/icons-material/CampaignOutlined';
import NotificationImportantOutlined from '@mui/icons-material/NotificationImportantOutlined';
import ReportOutlined from '@mui/icons-material/ReportOutlined';
import Chip from '@mui/material/Chip';
import type { ReactNode } from 'react';
import type { Priority } from '@/lib/types';

export const PRIORITIES: { value: Priority; label: string; short: string; icon: ReactNode; board: string; families: string }[] = [
  {
    value: 'info',
    label: 'Info',
    short: 'Banner for 15 s',
    icon: <CampaignOutlined />,
    board: 'A banner across the top of the board for 15 seconds, then kept in the board inbox.',
    families: 'Families get a notification.',
  },
  {
    value: 'important',
    label: 'Important',
    short: 'Card with a sound',
    icon: <NotificationImportantOutlined />,
    board: 'A card in the middle of the board, with a sound, until the teacher dismisses it.',
    families: 'Families get a high-priority notification.',
  },
  {
    value: 'emergency',
    label: 'Emergency',
    short: 'Full-screen alarm',
    icon: <ReportOutlined />,
    board: 'Takes over the whole board in red with an alarm until you clear it. For fire drills, lockdowns and early dismissal.',
    families: 'Families get a critical alert.',
  },
];

export function PriorityChip({ priority }: { priority: Priority }) {
  if (priority === 'emergency') return <Chip size="small" label="Emergency" sx={{ bgcolor: 'error.main', color: 'error.contrastText' }} />;
  if (priority === 'important') return <Chip size="small" label="Important" sx={{ bgcolor: 'kx.liveContainer', color: 'kx.onLiveContainer' }} />;
  return <Chip size="small" label="Info" sx={{ bgcolor: 'm3.secondaryContainer', color: 'm3.onSecondaryContainer' }} />;
}

export const EXPIRY_OPTIONS = [
  { minutes: 15, label: '15 minutes' },
  { minutes: 60, label: '1 hour' },
  { minutes: 240, label: '4 hours' },
  { minutes: 24 * 60, label: '1 day' },
  { minutes: 3 * 24 * 60, label: '3 days' },
  { minutes: 7 * 24 * 60, label: '7 days' },
];

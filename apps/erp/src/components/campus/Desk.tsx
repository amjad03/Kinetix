import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';
import { TableFrame } from '@/components/DataTable';

/** A row of stat tiles that stacks on a phone. */
export function Tiles({ children }: { children: ReactNode }) {
  return <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: 'repeat(4, 1fr)' }, gap: 2, mb: 3 }}>{children}</Box>;
}

/** A titled, plain table: header labels and rows of ready-made cells. */
export function DeskTable({ title, head, rows, testId }: { title: string; head: string[]; rows: ReactNode[][]; testId?: string }) {
  return (
    <Box sx={{ mb: 3 }}>
      <Typography variant="h6" component="h2" sx={{ mb: 1.5 }}>
        {title}
      </Typography>
      <TableFrame testId={testId}>
        <Table size="small">
          <TableHead>
            <TableRow>
              {head.map((h) => (
                <TableCell key={h}>{h}</TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((cells, i) => (
              <TableRow key={i} hover>
                {cells.map((c, j) => (
                  <TableCell key={j}>{c}</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableFrame>
    </Box>
  );
}

export function Pill({ label, tone = 'default' }: { label: string; tone?: 'default' | 'warning' | 'error' | 'success' }) {
  return <Chip size="small" label={label} color={tone === 'default' ? 'default' : tone} variant={tone === 'default' ? 'outlined' : 'filled'} />;
}

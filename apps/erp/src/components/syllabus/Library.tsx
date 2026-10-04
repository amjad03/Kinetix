'use client';

import Check from '@mui/icons-material/Check';
import MenuBookOutlined from '@mui/icons-material/MenuBookOutlined';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import Chip from '@mui/material/Chip';
import Typography from '@mui/material/Typography';
import Link from 'next/link';
import { EmptyState } from '@/components/States';
import type { Course, Curriculum } from '@/lib/types';
import { ReviewChip } from './ReviewChip';

const LEVEL: Record<string, string> = { ug: 'Undergraduate', pg: 'Postgraduate', k12: 'School' };

/** Curricula as filter chips, then the courses as cards. */
export function Library({ curricula, courses, selected, usedBy }: { curricula: Curriculum[]; courses: Course[]; selected: string; usedBy: Record<string, string[]> }) {
  const byCode = new Map(curricula.map((c) => [c.code, c]));
  return (
    <>
      <Box role="group" aria-label="Curriculum" sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
        {[{ code: '', name: 'All' }, ...curricula].map((c) => {
          const on = selected === c.code;
          return (
            <Chip
              key={c.code || 'all'}
              component={Link}
              href={c.code ? `/syllabus?curriculum=${c.code}` : '/syllabus'}
              scroll={false}
              clickable
              label={c.name}
              variant={on ? 'filled' : 'outlined'}
              icon={on ? <Check sx={{ fontSize: '18px !important' }} /> : undefined}
              sx={on ? { bgcolor: 'm3.secondaryContainer', color: 'm3.onSecondaryContainer', '& .MuiChip-icon': { color: 'inherit' } } : undefined}
              aria-current={on ? 'true' : undefined}
              data-testid={`curriculum-${c.code || 'all'}`}
            />
          );
        })}
      </Box>
      {courses.length === 0 ? (
        <EmptyState dense icon={<MenuBookOutlined />} title="No courses here yet" />
      ) : (
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))' }} data-testid="course-list">
          {courses.map((c) => {
            const cur = byCode.get(c.curriculumCode);
            const used = usedBy[c.id];
            return (
              <Card key={c.id} data-testid="course-card">
                <CardActionArea
                  component={Link}
                  href={`/syllabus/${c.id}`}
                  sx={{ p: 2.5, height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'stretch', justifyContent: 'flex-start', gap: 1 }}
                >
                  <Typography variant="caption" color="text.secondary">
                    {cur?.name ?? c.curriculumCode}
                    {cur?.level && LEVEL[cur.level] ? ` · ${LEVEL[cur.level]}` : ''}
                  </Typography>
                  <Typography variant="subtitle1" component="h3" sx={{ fontWeight: 500, lineHeight: 1.35 }}>
                    {c.title}
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 'auto', pt: 1 }}>
                    <ReviewChip reviewed={c.reviewed} />
                    {used && <Chip size="small" label={`Used by ${used.join(', ')}`} sx={{ bgcolor: 'm3.primaryContainer', color: 'm3.onPrimaryContainer' }} />}
                  </Box>
                </CardActionArea>
              </Card>
            );
          })}
        </Box>
      )}
    </>
  );
}

'use client';
import Link from 'next/link';
import { EmptyState } from '@/components/States';
import type { Course, Curriculum } from '@/lib/types';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { ReviewChip } from './ReviewChip';
import { cn } from '@/lib/utils';

import { Card, CardActionArea, Chip } from '@/components/kx';
import { BookOpenText as MenuBookOutlined, Check } from 'lucide-react';
const LEVEL: Record<string, MessageKey> = { ug: 'syl.level.ug', pg: 'syl.level.pg', k12: 'syl.level.k12' };

/** Curricula as filter chips, then the courses as cards. */
export function Library({ curricula, courses, selected, usedBy }: { curricula: Curriculum[]; courses: Course[]; selected: string; usedBy: Record<string, string[]> }) {
  const { t } = useI18n();
  const byCode = new Map(curricula.map((c) => [c.code, c]));
  return (
    <>
      <div className="flex flex-wrap gap-2 mb-4" role="group" aria-label={t('syl.curriculum')}>
        {[{ code: '', name: t('syl.all') }, ...curricula].map((c) => {
          const on = selected === c.code;
          return (
            <Chip className={cn(on && 'bg-secondary text-secondary-foreground [&_svg]:text-inherit')}
              key={c.code || 'all'}
              component={Link}
              href={c.code ? `/syllabus?curriculum=${c.code}` : '/syllabus'}
              scroll={false}
              clickable
              label={c.name}
              variant={on ? 'filled' : 'outlined'}
              icon={on ? <Check className="text-[18px_!important]" /> : undefined}
              aria-current={on ? 'true' : undefined}
              data-testid={`curriculum-${c.code || 'all'}`}
            />
          );
        })}
      </div>
      {courses.length === 0 ? (
        <EmptyState dense icon={<MenuBookOutlined />} title={t('syl.noCourses')} />
      ) : (
        <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(min(100%,300px),1fr))]" data-testid="course-list">
          {courses.map((c) => {
            const cur = byCode.get(c.curriculumCode);
            const used = usedBy[c.id];
            return (
              <Card key={c.id} data-testid="course-card">
                <CardActionArea className="p-5 h-full flex flex-col items-stretch justify-start gap-2"
                  component={Link}
                  href={`/syllabus/${c.id}`}
                >
                  <span className="text-xs leading-4 tracking-[0.3px] text-muted-foreground">
                    {cur?.name ?? c.curriculumCode}
                    {cur?.level && LEVEL[cur.level] ? ` · ${t(LEVEL[cur.level])}` : ''}
                  </span>
                  <h3 className="text-base tracking-[0.1px] font-medium leading-[1.35]">
                    {c.title}
                  </h3>
                  <div className="flex gap-2 flex-wrap mt-auto pt-2">
                    <ReviewChip reviewed={c.reviewed} />
                    {used && <Chip className="bg-teal-soft text-teal-ink" size="small" label={t('syl.usedBy', { names: used.join(', ') })} />}
                  </div>
                </CardActionArea>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}

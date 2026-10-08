'use server';

import { send } from '@/lib/ops-server';

const PAGE = '/course-files';
const id = encodeURIComponent;

export async function buildCourseFile(v: Record<string, string>) {
  const [sectionId, subjectId] = (v.pick ?? '').split('|');
  return send('/v1/course-files', { sectionId, subjectId }, PAGE);
}

export async function reviewCourseFile(fileId: string, v: Record<string, string>) {
  return send(`/v1/course-files/${id(fileId)}/review`, { remark: v.remark ?? '' }, PAGE);
}

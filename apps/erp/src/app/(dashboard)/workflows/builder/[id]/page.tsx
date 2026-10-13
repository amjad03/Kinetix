import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { ErrorState } from '@/components/ui';
import { WorkflowBuilder } from '@/components/workflows/WorkflowBuilder';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import type { WorkflowDetail } from '@/lib/workflow-builder';
import { ADMIN } from '../tabs';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('wb.title') };
}

/** The canvas for one workflow. */
export default async function WorkflowBuilderCanvasPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireSection('workflows');
  if (!(me?.roles ?? []).some((r) => ADMIN.includes(r))) redirect('/workflows');
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const res = await load(() => api<WorkflowDetail>(`/v1/workflows/builder/${id}`));
  if (res.error !== undefined) return <ErrorState message={res.error} />;
  return <WorkflowBuilder key={res.data.id} initial={res.data} />;
}

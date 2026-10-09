import type { Metadata } from 'next';
import { DeskPage } from '@/components/g1/DeskPage';
import { getI18n } from '@/i18n/server';
import { LEARNING_DESK } from '@/lib/g1-specs';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t(LEARNING_DESK.title) };
}

export default function LearningSupportPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  return <DeskPage spec={LEARNING_DESK} page="/learning-support" section="learningSupport" searchParams={searchParams} />;
}

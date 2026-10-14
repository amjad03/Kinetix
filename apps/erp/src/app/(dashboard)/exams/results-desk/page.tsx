import { redirect } from 'next/navigation';

/** The results desk opens on result processing. */
export default function ResultsDeskIndex() {
  redirect('/exams/results-desk/processing');
}

import { redirect } from 'next/navigation';

/** The exam cell opens on its sessions. */
export default function ExamCellIndex() {
  redirect('/exams/cell/sessions');
}

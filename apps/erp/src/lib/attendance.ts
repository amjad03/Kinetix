/** Present + late over all marks. Marks are per period, so a student in three periods has three. */
export function rateOf(present: number, absent: number, late: number): number | null {
  const marks = present + absent + late;
  return marks === 0 ? null : Math.round(((present + late) / marks) * 1000) / 10;
}

export interface AbsentStudent {
  id: string;
  student: string;
  rollNo: string | null;
  section: string;
  periods: { subject: string | null; startsAt: string | null; markedBy: string }[];
}

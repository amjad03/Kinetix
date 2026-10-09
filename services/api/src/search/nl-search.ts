/**
 * Natural-language questions for the top-bar search (PRD section 68), read by rules, not a model: a handful of intents the
 * ERP can answer exactly, with a class name or a percentage picked out of the sentence. Anything else falls back to the
 * ordinary search. Pure, so it is tested without a database.
 */
export type NlIntent =
  | { kind: 'fees_overdue'; className?: string }
  | { kind: 'absent_today'; className?: string }
  | { kind: 'low_attendance'; belowPct: number; className?: string }
  | { kind: 'staff_on_leave' }
  | { kind: 'upcoming_events' }
  | { kind: 'my_tasks' }
  | { kind: 'search'; term: string };

/** "class 8", "8A", "in grade 10 B", "section 9-B": the class the sentence is about. */
export function classOf(q: string): string | undefined {
  const m = /\b(?:class|grade|std|standard|section)\s*([0-9]{1,2}\s*-?\s*[a-z]?)\b/i.exec(q) ?? /\bin\s+([0-9]{1,2}\s*-?\s*[a-z])\b/i.exec(q) ?? /\b([0-9]{1,2}\s*-?\s*[a-e])\b(?=\s*(?:$|\?|students|class))/i.exec(q);
  return m ? m[1].replace(/\s+/g, '').replace(/-/g, '').toUpperCase() : undefined;
}

export function parseQuestion(raw: string): NlIntent {
  const q = raw.trim().toLowerCase().replace(/[?.!]+$/g, '');
  const className = classOf(q);
  const pct = /(?:below|under|less than|lower than|<)\s*(\d{1,3})\s*%?/.exec(q);
  if (/\b(overdue|unpaid|pending|defaulter|dues?)\b/.test(q) && /\b(fee|fees|dues?|defaulters?|payments?)\b/.test(q)) return { kind: 'fees_overdue', className };
  if (/\battendance\b/.test(q) && pct) return { kind: 'low_attendance', belowPct: Math.min(100, Number(pct[1])), className };
  if (/\babsent\b/.test(q)) return { kind: 'absent_today', className };
  if (/\b(staff|teachers?|faculty|employees?)\b/.test(q) && /\bleave\b/.test(q)) return { kind: 'staff_on_leave' };
  if (/\b(upcoming|next|coming)\b.*\bevents?\b|\bevents?\b.*\b(this week|soon|upcoming)\b/.test(q)) return { kind: 'upcoming_events' };
  if (/\b(my|pending|open)\b.*\btasks?\b/.test(q)) return { kind: 'my_tasks' };
  return { kind: 'search', term: raw.trim().slice(0, 80) };
}

/** A plain sentence saying how the question was understood, shown above the answer so a wrong reading is obvious. */
export function describe(i: NlIntent): string {
  const cls = 'className' in i && i.className ? ` in class ${i.className}` : '';
  switch (i.kind) {
    case 'fees_overdue':
      return `Students with overdue fees${cls}`;
    case 'absent_today':
      return `Students marked absent today${cls}`;
    case 'low_attendance':
      return `Students with attendance below ${i.belowPct}% in the last 30 days${cls}`;
    case 'staff_on_leave':
      return 'Staff on approved leave today';
    case 'upcoming_events':
      return 'Events in the next 30 days';
    case 'my_tasks':
      return 'Your open tasks';
    case 'search':
      return `Search for "${i.term}"`;
  }
}

'use server';

import { optStr, send } from '@/lib/ops-server';

const PAGE = '/academic-audit';
const A = '/v1/academic-audit';
const id = encodeURIComponent;

/** One checklist item per line; "Category | Item" groups them. */
export async function createTemplate(v: Record<string, string>) {
  const items = (v.items ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [a, ...rest] = l.split('|');
      return rest.length ? { category: a.trim(), text: rest.join('|').trim() } : { category: '', text: l };
    });
  return send(`${A}/templates`, { name: v.name, description: v.description ?? '', items }, PAGE);
}

export async function archiveTemplate(templateId: string) {
  return send(`${A}/templates/${id(templateId)}/archive`, undefined, PAGE);
}

export async function startAudit(v: Record<string, string>) {
  return send(`${A}/audits`, { templateId: v.templateId, departmentId: v.departmentId, ...(optStr(v.title) ? { title: v.title.trim() } : {}), ...(optStr(v.conductedOn) ? { conductedOn: v.conductedOn } : {}) }, PAGE);
}

export async function recordResult(auditId: string, resultId: string, v: Record<string, string>) {
  return send(`${A}/audits/${id(auditId)}/results/${id(resultId)}`, { result: v.result, remark: v.remark ?? '' }, `${PAGE}/${auditId}`, 'PUT');
}

export async function raiseNc(auditId: string, v: Record<string, string>) {
  return send(
    `${A}/audits/${id(auditId)}/non-conformities`,
    {
      description: v.description,
      severity: v.severity || 'minor',
      correctiveAction: v.correctiveAction ?? '',
      ...(optStr(v.resultId) ? { resultId: v.resultId } : {}),
      ...(optStr(v.ownerUserId) ? { ownerUserId: v.ownerUserId } : {}),
      ...(optStr(v.dueOn) ? { dueOn: v.dueOn } : {}),
    },
    `${PAGE}/${auditId}`,
  );
}

export async function completeAudit(auditId: string) {
  return send(`${A}/audits/${id(auditId)}/complete`, undefined, `${PAGE}/${auditId}`);
}

export async function updateNc(ncId: string, v: Record<string, string>) {
  return send(
    `${A}/non-conformities/${id(ncId)}`,
    {
      ...(optStr(v.correctiveAction) ? { correctiveAction: v.correctiveAction.trim() } : {}),
      ...(optStr(v.ownerUserId) ? { ownerUserId: v.ownerUserId } : {}),
      ...(optStr(v.dueOn) ? { dueOn: v.dueOn } : {}),
      ...(optStr(v.status) ? { status: v.status } : {}),
    },
    PAGE,
    'PUT',
  );
}

export async function closeNc(ncId: string, v: Record<string, string>) {
  return send(`${A}/non-conformities/${id(ncId)}/close`, { closureNote: v.closureNote }, PAGE);
}

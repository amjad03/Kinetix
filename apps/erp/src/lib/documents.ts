// Pure helpers for the documents pages (certificates, ID cards, vault).

import type { CertificateKind, CertificateStatus } from './hr-types';

export const MAX_VAULT_BYTES = 10 * 1024 * 1024;
export const VAULT_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];

export const CERT_STATUSES: CertificateStatus[] = ['requested', 'approved', 'issued', 'rejected', 'revoked'];
export const CERT_TONE: Record<CertificateStatus, 'default' | 'warning' | 'success' | 'error' | 'info'> = { requested: 'warning', approved: 'info', issued: 'success', rejected: 'error', revoked: 'error' };
export const CERT_KINDS: CertificateKind[] = ['transfer_certificate', 'bonafide', 'conduct', 'study', 'course_completion', 'fee_receipt', 'experience', 'custom'];

/** The placeholders a template body may use ({{fields.<key>}} are the template's own fields). */
export const PLACEHOLDERS = ['institution', 'name', 'rollNo', 'className', 'program', 'academicYear', 'employeeCode', 'designation', 'department', 'dateOfJoining', 'purpose', 'serialNo', 'issuedOn'];

/** What the person can do to a certificate request, by status and by role (the API checks again). */
export function certActions(status: CertificateStatus, o: { approver: boolean; office: boolean }): { approve: boolean; reject: boolean; issue: boolean; revoke: boolean; pdf: boolean } {
  return {
    approve: status === 'requested' && o.approver,
    reject: status === 'requested' && o.approver,
    issue: status === 'approved' && o.office,
    revoke: status === 'issued' && o.approver,
    pdf: status === 'issued' || status === 'revoked',
  };
}

/** Problems with a file chosen for the vault, before it is sent. */
export function vaultFileProblem(f: { type: string; size: number }): 'type' | 'size' | 'empty' | null {
  if (!VAULT_TYPES.includes(f.type)) return 'type';
  if (f.size === 0) return 'empty';
  if (f.size > MAX_VAULT_BYTES) return 'size';
  return null;
}

export const CATEGORY = /^[a-z][a-z0-9_]{1,39}$/;

/** The query string of a vault upload; empty details are left out. */
export function vaultQuery(o: { ownerType: 'student' | 'staff'; ownerId: string; title: string; category: string; visibility: 'staff' | 'owner'; expiresOn?: string; replacesId?: string }): string {
  const q = new URLSearchParams({ ownerType: o.ownerType, ownerId: o.ownerId, title: o.title.trim(), category: o.category.trim().toLowerCase().replace(/\s+/g, '_'), visibility: o.visibility });
  if (o.expiresOn) q.set('expiresOn', o.expiresOn);
  if (o.replacesId) q.set('replacesId', o.replacesId);
  return q.toString();
}

export const fileSize = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

export const docDownload = {
  certificate: (id: string) => `/api/download?kind=certificate&id=${id}`,
  vault: (id: string) => `/api/download?kind=vault&id=${id}`,
  students: (sectionId: string) => `/api/download?kind=id-students&id=${sectionId}`,
  staff: '/api/download?kind=id-staff',
  me: '/api/download?kind=id-me',
};

/** The asset tag sheet (PDF) for the chosen assets, or for every asset in service. */
export const assetTagsUrl = (ids?: string[]) => (ids?.length ? `/api/download?kind=asset-tags&id=${ids.join(',')}` : '/api/download?kind=asset-tags-all');

/** Fields of a template as `{{fields.key}}` hints for the editor. */
export const fieldsHelp = (fields: { key: string }[]) => fields.map((f) => `{{fields.${f.key}}}`);

/** Parses "key:Label:required" lines of the template editor; null on the first bad line. */
export function parseFieldLines(text: string): { key: string; label: string; required: boolean }[] | null {
  const out: { key: string; label: string; required: boolean }[] = [];
  for (const line of text.split('\n').map((l) => l.trim()).filter(Boolean)) {
    const [key, label, req] = line.split(':').map((x) => x.trim());
    if (!key || !/^[A-Za-z][A-Za-z0-9]{0,29}$/.test(key) || !label || out.some((f) => f.key === key)) return null;
    out.push({ key, label, required: req === 'required' });
  }
  return out.length <= 12 ? out : null;
}

export const fieldLines = (fields: { key: string; label: string; required: boolean }[]) => fields.map((f) => `${f.key}:${f.label}${f.required ? ':required' : ''}`).join('\n');
